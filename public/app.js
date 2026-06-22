'use strict';

const money = (n) =>
  '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

async function api(path, opts) {
  const res = await fetch(path, opts);
  if (res.status === 401) { location.href = '/login.html'; return null; }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function rowHtml(a) {
  return `<div class="row">
    <div class="rank">${a.rank}</div>
    <div class="name">${esc(a.name)}<small>rank ${a.rank} of book</small></div>
    <div class="money">${money(a.commission)}</div>
    <span class="badge ${a.tier}">${a.tier}</span>
  </div>`;
}

// ---------- pages ----------
const pages = {
  async login() {
    const form = document.getElementById('loginForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const note = document.getElementById('loginNote');
      note.textContent = '';
      try {
        await api('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: document.getElementById('email').value,
            password: document.getElementById('password').value,
          }),
        });
        location.href = '/';
      } catch (err) {
        note.className = 'notice err';
        note.textContent = err.message;
      }
    });
  },

  async home() {
    const data = await api('/api/home');
    if (!data) return;
    document.getElementById('hello').textContent = data.user.name.split(' ')[0];
    const s = data.summary;
    document.getElementById('stats').innerHTML =
      `<div class="stat"><div class="label">Tracked commission</div><div class="value">${money(s.total_commission)}</div></div>
       <div class="stat"><div class="label">Key accounts</div><div class="value">${s.key_account_count}</div></div>
       <div class="stat"><div class="label">Total accounts</div><div class="value">${s.account_count}</div></div>`;

    const list = data.key_accounts;
    const card = document.getElementById('keyAccounts');
    if (!list.length) {
      card.innerHTML = `<div class="row"><div class="name">No commission yet. <small>Import a report to build your money map.</small></div></div>`;
    } else {
      const top = list.slice(0, 5);
      card.innerHTML = top.map(rowHtml).join('');
      if (list.length > 5) {
        const more = el(`<div class="more">See all ${list.length} key accounts</div>`);
        more.addEventListener('click', () => { card.innerHTML = list.map(rowHtml).join(''); });
        card.appendChild(more);
      }
    }
  },

  async accounts() {
    let current = '';
    const render = async (tier) => {
      current = tier;
      document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tier === tier));
      const data = await api('/api/accounts' + (tier ? '?tier=' + tier : ''));
      if (!data) return;
      const card = document.getElementById('list');
      card.innerHTML = data.accounts.length
        ? data.accounts.map(rowHtml).join('')
        : `<div class="row"><div class="name">No accounts in this tier yet.</div></div>`;
    };
    document.querySelectorAll('.tab').forEach((t) =>
      t.addEventListener('click', () => render(t.dataset.tier))
    );
    render('');
  },

  async import() {
    const data = await api('/api/manufacturers');
    if (!data) return;
    const sel = document.getElementById('manufacturer_id');
    sel.innerHTML = data.manufacturers.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('');

    document.getElementById('importForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const note = document.getElementById('importNote');
      note.textContent = '';
      const fd = new FormData();
      const file = document.getElementById('file').files[0];
      if (!file) { note.className = 'notice err'; note.textContent = 'Choose a CSV file.'; return; }
      fd.append('file', file);
      fd.append('manufacturer_id', sel.value);
      fd.append('period_label', document.getElementById('period_label').value);
      fd.append('account_col', document.getElementById('account_col').value);
      fd.append('amount_col', document.getElementById('amount_col').value);
      try {
        const r = await api('/api/imports', { method: 'POST', body: fd });
        note.className = 'notice ok';
        note.innerHTML = `Imported ${r.total} rows. ${r.matched} auto-matched, ${r.unmatched} to review.`;
        if (r.unmatched > 0) {
          const link = el(`<a class="btn" style="display:block;text-align:center;text-decoration:none;margin-top:12px" href="/unmatched.html?import_id=${r.import_id}">Review ${r.unmatched} unmatched</a>`);
          note.appendChild(link);
        } else {
          note.appendChild(el(`<a class="btn secondary" style="display:block;text-align:center;text-decoration:none;margin-top:12px" href="/">See your money map</a>`));
        }
      } catch (err) {
        note.className = 'notice err';
        note.textContent = err.message;
      }
    });
  },

  async unmatched() {
    const importId = new URLSearchParams(location.search).get('import_id');
    const wrap = document.getElementById('unmatchedList');
    const load = async () => {
      const data = await api('/api/imports/' + importId + '/unmatched');
      if (!data) return;
      if (!data.unmatched.length) {
        wrap.innerHTML = `<div class="notice ok">All names resolved. <a href="/">See your money map</a></div>`;
        return;
      }
      const opts = data.accounts.map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join('');
      wrap.innerHTML = '';
      data.unmatched.forEach((u) => {
        const item = el(`<div class="card" style="margin-bottom:12px;padding:14px 16px">
          <div class="row" style="padding:0 0 10px;border:none">
            <div class="name">${esc(u.raw_account_name)}<small>${money(u.amount)} across ${u.line_count} line(s)</small></div>
          </div>
          <label>Match to existing account</label>
          <select>${opts}</select>
          <label>...or create a new account</label>
          <input type="text" placeholder="New account name" />
          <button class="btn">Resolve & remember</button>
        </div>`);
        const select = item.querySelector('select');
        const input = item.querySelector('input');
        item.querySelector('button').addEventListener('click', async () => {
          const body = { manufacturer_id: u.manufacturer_id, raw_name: u.raw_account_name };
          if (input.value.trim()) body.new_account_name = input.value.trim();
          else body.account_id = select.value;
          try {
            await api('/api/resolve', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            });
            load();
          } catch (err) { alert(err.message); }
        });
        wrap.appendChild(item);
      });
    };
    load();
  },
};

document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.dataset.page;
  if (pages[page]) pages[page]().catch((e) => console.error(e));
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
});
