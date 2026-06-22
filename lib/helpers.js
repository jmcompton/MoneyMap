'use strict';

// Normalize a raw account name for matching: trim, collapse whitespace,
// lowercase. "A1 Insulation " and "a1   insulation" become the same key,
// so aliases match reliably regardless of how a manufacturer formatted it.
function normalizeName(s) {
  return String(s == null ? '' : s)
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// The 80/20 engine. Input: [{ account_id, name, commission }] (already summed
// per account). Output: same rows sorted high-to-low, each tagged with rank,
// cumulative %, and a tier:
//   A = the accounts that make up the top 80% of commission (your key accounts)
//   B = the next slice up to 95%
//   C = the long tail
// Deterministic math, no AI needed.
function computeTiers(rows) {
  const sorted = [...rows]
    .map((r) => ({ ...r, commission: Number(r.commission) || 0 }))
    .sort((a, b) => b.commission - a.commission);

  const total = sorted.reduce((sum, r) => sum + r.commission, 0);
  let running = 0;

  return sorted.map((r, i) => {
    running += r.commission;
    const cumulativePct = total > 0 ? (running / total) * 100 : 0;
    let tier;
    if (cumulativePct <= 80) tier = 'A';
    else if (cumulativePct <= 95) tier = 'B';
    else tier = 'C';
    // Edge case: the single account that crosses the 80% line still belongs in A.
    if (i > 0 && sorted[i - 1] && tier !== 'A') {
      const prevRunning = running - r.commission;
      const prevPct = total > 0 ? (prevRunning / total) * 100 : 0;
      if (prevPct < 80 && tier === 'B') tier = 'A';
    }
    return {
      account_id: r.account_id,
      name: r.name,
      commission: Math.round(r.commission * 100) / 100,
      rank: i + 1,
      cumulative_pct: Math.round(cumulativePct * 10) / 10,
      tier,
    };
  });
}

module.exports = { normalizeName, computeTiers };
