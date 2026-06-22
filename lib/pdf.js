'use strict';

// PDF commission parsing. Extraction uses pdfjs-dist (reads modern manufacturer
// PDFs, not just old ones). Rows are parsed two ways: a heuristic line parser
// that always works, and an optional AI pass that handles weird layouts when an
// ANTHROPIC_API_KEY is present. The preview endpoint prefers AI, falls back to
// heuristic, so it never hard-fails.

// Pull text out of a PDF buffer, reconstructing visual lines by grouping text
// items on the same y-coordinate. That line structure is what the row parser
// needs (a flat space-join would merge every row into one blob).
async function extractPdfText(buffer) {
  // pdfjs tries to polyfill these via the optional `canvas` module and warns
  // when it's absent. Text extraction doesn't need them, so predefine no-op
  // stubs and pdfjs skips the polyfill (and the warning) entirely.
  if (typeof globalThis.DOMMatrix === 'undefined') globalThis.DOMMatrix = class DOMMatrix {};
  if (typeof globalThis.Path2D === 'undefined') globalThis.Path2D = class Path2D {};
  if (typeof globalThis.ImageData === 'undefined') globalThis.ImageData = class ImageData {};
  const _warn = console.warn;
  console.warn = () => {};
  try {
    const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
    const doc = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
      verbosity: 0,
    }).promise;
    let out = '';
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      const lines = new Map();
      for (const it of tc.items) {
        if (!it.str || !it.str.trim()) continue;
        const y = Math.round(it.transform[5]);
        const x = it.transform[4];
        if (!lines.has(y)) lines.set(y, []);
        lines.get(y).push({ x, s: it.str });
      }
      const ys = [...lines.keys()].sort((a, b) => b - a); // top of page first
      for (const y of ys) {
        const parts = lines.get(y).sort((a, b) => a.x - b.x).map((p) => p.s);
        const line = parts.join(' ').replace(/\s+/g, ' ').trim();
        if (line) out += line + '\n';
      }
    }
    return out;
  } finally {
    console.warn = _warn;
  }
}

const MONEY = /(-?\$?\s?[\d,]+\.\d{2})(?!.*\d)/; // last money figure on the line
const SKIP = /\b(total|subtotal|sub-total|grand total|balance|page|statement|period|net sales|commission|account|customer|date|rep agency)\b/i;

// Heuristic: each line that ends in a money figure becomes account + amount.
function parseCommissionText(text) {
  const out = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/\s+/g, ' ').trim();
    if (!line) continue;
    const m = line.match(MONEY);
    if (!m) continue;
    const amount = parseFloat(m[1].replace(/[^0-9.\-]/g, ''));
    if (!isFinite(amount)) continue;
    let name = line.slice(0, m.index).trim().replace(/[.\-\s]+$/, '');
    name = name.replace(/^\d+[).\s]+/, '').trim();         // strip "1) " row numbers
    name = name.replace(/\s+\$?[\d,]+(\.\d{2})?$/, '').trim(); // strip a net-sales column if present
    if (name.length < 2 || !/[A-Za-z]/.test(name)) continue;
    if (SKIP.test(name)) continue;
    out.push({ raw_name: name, amount });
  }
  return out;
}

// Optional AI pass. Returns null on any failure so the caller falls back.
async function aiParseCommission(text) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const clipped = String(text || '').slice(0, 9000);
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        messages: [{ role: 'user', content: `This is text extracted from a building-materials manufacturer commission statement. Pull out each customer/account line and its commission dollar amount. Return ONLY a compact JSON array like [{"account_name":"Acme Supply","amount":1234.56}]. amount is a plain number, no $ or commas. Skip headers, totals, and summary rows. No prose, no code fences.\n\nTEXT:\n${clipped}` }],
      }),
    });
    const data = await r.json();
    const txt = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
    const s = txt.indexOf('['); const e = txt.lastIndexOf(']');
    if (s < 0 || e < 0) return null;
    const arr = JSON.parse(txt.slice(s, e + 1));
    const rows = arr
      .map((x) => ({ raw_name: String(x.account_name || x.name || '').trim(), amount: Number(x.amount) || 0 }))
      .filter((x) => x.raw_name);
    return rows.length ? rows : null;
  } catch (_) {
    return null;
  }
}

// Preferred path: AI if available and it found rows, otherwise heuristic.
async function parsePdfCommission(buffer) {
  const text = await extractPdfText(buffer);
  const ai = await aiParseCommission(text);
  if (ai && ai.length) return { rows: ai, method: 'ai', text_sample: text.slice(0, 1200) };
  return { rows: parseCommissionText(text), method: 'heuristic', text_sample: text.slice(0, 1200) };
}

module.exports = { extractPdfText, parseCommissionText, aiParseCommission, parsePdfCommission };
