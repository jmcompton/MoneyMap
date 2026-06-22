'use strict';

const money = (n) => '$' + (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });

async function api(path, opts) {
  const res = await fetch(path, opts);
  if (res.status === 401) { location.href = '/login.html'; return null; }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}
function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

const I = {
  home: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>',
  accounts: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 4v16"/></svg>',
  import: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 20h14"/></svg>',
  planner: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/></svg>',
  route: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="19" r="2.4"/><circle cx="18" cy="5" r="2.4"/><path d="M8.4 19H14a4 4 0 0 0 0-8H9a4 4 0 0 1 0-8h6.6"/></svg>',
  alert: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.6 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></svg>',
  spark: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/></svg>',
  deal: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M16 7h5v5"/></svg>',
  check: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
  star: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19.2l1-5.8L3.5 9.2l5.9-.9L12 3Z"/></svg>',
};

function rowHtml(a) {
  return `<div class="row">
    <div class="rank">${a.rank}</div>
    <div class="name">${esc(a.name)}<small>rank ${a.rank} in your book</small></div>
    <div class="money">${money(a.commission)}</div>
    <span class="badge ${a.tier}">${a.tier}</span>
  </div>`;
}

const pages = {
  async login() {
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const note = document.getElementById('loginNote'); note.textContent = '';
      try {
        await api('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: document.getElementById('email').value, password: document.getElementById('password').value }) });
        location.href = '/';
      } catch (err) { note.className = 'notice err'; note.textContent = err.message; }
    });
  },

  async home() {
    const d = await api('/api/home');
    if (!d) return;
    const first = d.user.name.split(' ')[0];
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

    // route
    let markedNext = false;
    const routeHtml = d.today_route.map((s) => {
      const isNext = s.status !== 'done' && !markedNext;
      if (isNext) markedNext = true;
      const tag = s.status === 'done' ? '<span class="chip green">Done</span>' : (isNext ? '<span class="chip green">Next</span>' : '');
      return `<div class="stop ${s.status === 'done' ? 'done' : ''} ${isNext ? 'next' : ''}">
        <div class="node"><div class="dot"></div><div class="line"></div></div>
        <div class="body"><div class="t">${esc(s.arrival_time || '')}</div><div class="n">${esc(s.label)}</div><div class="c">${esc(s.city || '')}</div></div>
        <div>${tag}</div></div>`;
    }).join('');
    const doneCount = d.today_route.filter((s) => s.status === 'done').length;

    // at-risk
    const riskHtml = d.at_risk.map((a) => `<div class="row">
      <div class="name">${esc(a.name)}<small>${esc(a.city || '')} · ${money(a.commission)} book</small></div>
      <span class="chip ${a.days_since >= 60 ? 'red' : 'amber'}">${a.days_since}d quiet</span>
      <span class="badge ${a.tier}">${a.tier}</span></div>`).join('');

    // leads
    const leadHtml = d.leads.map((l) => `<div class="lead">
      <div class="top"><span class="n">${esc(l.name)}</span><span class="chip indigo">${l.distance_mi} mi</span></div>
      <div class="reason">${esc(l.reason)}</div>
      <div class="meta"><span class="chip green">~${money(l.est_value)}/yr</span><span class="chip">${esc(l.city || '')}</span></div></div>`).join('');

    // deals
    const dealHtml = d.deals.map((x) => {
      const c = x.days_to_close <= 7 ? 'red' : (x.days_to_close <= 14 ? 'amber' : '');
      return `<div class="deal">
        <div class="top"><span class="n">${esc(x.name)}</span><span class="v">${money(x.value)}</span></div>
        <div class="sub">${esc(x.account_name || '')} · ${esc(x.manufacturer || '')} · ${esc(x.stage)}</div>
        <div class="meta"><span class="chip ${c}">closes in ${x.days_to_close}d</span></div></div>`;
    }).join('');

    // tasks
    const taskHtml = d.tasks.map((t) => {
      const lbl = t.days_to_due <= 0 ? 'Today' : (t.days_to_due === 1 ? 'Tomorrow' : t.days_to_due + 'd');
      return `<div class="task"><div class="box"></div><div class="tt">${esc(t.title)}</div><div class="due ${t.days_to_due <= 0 ? 'today' : ''}">${lbl}</div></div>`;
    }).join('');

    // key accounts (top 5 + see all)
    const ka = d.key_accounts;
    const kaTop = ka.slice(0, 5).map(rowHtml).join('');

    const s = d.summary;
    document.getElementById('app').innerHTML = `
      <header class="top">
        <div><h1>Hey, ${esc(first)}</h1><div class="sub">${today} · here's where your money is.</div></div>
        <a class="logout" href="#" onclick="fetch('/api/logout',{method:'POST'}).then(()=>location.href='/login.html');return false;">Sign out</a>
      </header>
      <div class="brief"><span class="spark">${I.spark}</span><div class="txt">${esc(d.brief)}</div></div>
      <div class="stats">
        <div class="stat"><div class="label">Tracked commission</div><div class="value">${money(s.total_commission)}</div></div>
        <div class="stat"><div class="label">Open pipeline</div><div class="value">${money(s.pipeline_value)}</div></div>
        <div class="stat"><div class="label">Key accounts</div><div class="value">${s.key_account_count}</div></div>
        <div class="stat"><div class="label">At-risk</div><div class="value warn">${s.at_risk_count}</div></div>
      </div>
      <div class="grid">
        <div class="col">
          <div class="panel"><div class="head"><span class="ic">${I.route}</span><h2>Today's route</h2><span class="count">${doneCount}/${d.today_route.length}</span></div>${routeHtml}</div>
          <div class="panel"><div class="head"><span class="ic amber">${I.alert}</span><h2>At-risk accounts</h2><span class="count">${d.at_risk.length}</span></div>${riskHtml}</div>
          <div class="panel"><div class="head"><span class="ic">${I.star}</span><h2>Key accounts · 80/20</h2><span class="count">${ka.length}</span></div><div id="kaList">${kaTop}</div></div>
        </div>
        <div class="col">
          <div class="panel"><div class="head"><span class="ic blue">${I.deal}</span><h2>Deals closing</h2><span class="count">${money(s.pipeline_value)}</span></div>${dealHtml}</div>
          <div class="panel"><div class="head"><span class="ic indigo">${I.spark}</span><h2>AI lead finder</h2><span class="count">${d.leads.length} nearby</span></div>${leadHtml}</div>
          <div class="panel"><div class="head"><span class="ic">${I.check}</span><h2>Follow-ups</h2><span class="count">${d.tasks.length}</span></div>${taskHtml}</div>
        </div>
      </div>`;

    if (ka.length > 5) {
      const list = document.getElementById('kaList');
      const more = el(`<div class="more">See all ${ka.length} key accounts</div>`);
      more.addEventListener('click', () => { list.innerHTML = ka.map(rowHtml).join(''); });
      list.parentElement.appendChild(more);
    }
  },

  async accounts() {
    const render = async (tier) => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tier === tier));
      const data = await api('/api/accounts' + (tier ? '?tier=' + tier : ''));
      if (!data) return;
      document.getElementById('list').innerHTML = data.accounts.length
        ? data.accounts.map(rowHtml).join('') : `<div class="row"><div class="name">No accounts in this tier yet.</div></div>`;
    };
    document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => render(t.dataset.tier)));
    render('');
  },

  async import() {
    const data = await api('/api/manufacturers');
    if (!data) return;
    document.getElementById('manufacturer_id').innerHTML = data.manufacturers.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('');
    document.getElementById('importForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const note = document.getElementById('importNote'); note.textContent = '';
      const file = document.getElementById('file').files[0];
      if (!file) { note.className = 'notice err'; note.textContent = 'Choose a CSV file.'; return; }
      const fd = new FormData();
      fd.append('file', file);
      fd.append('manufacturer_id', document.getElementById('manufacturer_id').value);
      fd.append('period_label', document.getElementById('period_label').value);
      fd.append('account_col', document.getElementById('account_col').value);
      fd.append('amount_col', document.getElementById('amount_col').value);
      try {
        const r = await api('/api/imports', { method: 'POST', body: fd });
        note.className = 'notice ok';
        note.innerHTML = `Imported ${r.total} rows. ${r.matched} auto-matched, ${r.unmatched} to review.`;
        const href = r.unmatched > 0 ? `/unmatched.html?import_id=${r.import_id}` : '/';
        const label = r.unmatched > 0 ? `Review ${r.unmatched} unmatched` : 'See your money map';
        note.appendChild(el(`<a class="btn" style="display:block;text-align:center;text-decoration:none;margin-top:12px" href="${href}">${label}</a>`));
      } catch (err) { note.className = 'notice err'; note.textContent = err.message; }
    });
  },

  async unmatched() {
    const importId = new URLSearchParams(location.search).get('import_id');
    const wrap = document.getElementById('unmatchedList');
    const load = async () => {
      const data = await api('/api/imports/' + importId + '/unmatched');
      if (!data) return;
      if (!data.unmatched.length) { wrap.innerHTML = `<div class="notice ok">All names resolved. <a href="/">See your money map</a></div>`; return; }
      const opts = data.accounts.map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join('');
      wrap.innerHTML = '';
      data.unmatched.forEach((u) => {
        const item = el(`<div class="card" style="margin-bottom:12px;padding:14px 16px">
          <div class="row" style="border:none;padding:0 0 10px"><div class="name">${esc(u.raw_account_name)}<small>${money(u.amount)} across ${u.line_count} line(s)</small></div></div>
          <label>Match to existing account</label><select>${opts}</select>
          <label>...or create a new account</label><input type="text" placeholder="New account name" />
          <button class="btn">Resolve & remember</button></div>`);
        item.querySelector('button').addEventListener('click', async () => {
          const body = { manufacturer_id: u.manufacturer_id, raw_name: u.raw_account_name };
          const nv = item.querySelector('input').value.trim();
          if (nv) body.new_account_name = nv; else body.account_id = item.querySelector('select').value;
          try { await api('/api/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); load(); }
          catch (err) { alert(err.message); }
        });
        wrap.appendChild(item);
      });
    };
    load();
  },
};

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('nav.bottom .ic[data-i]').forEach((s) => { s.innerHTML = I[s.dataset.i] || ''; });
  const page = document.body.dataset.page;
  if (pages[page]) pages[page]().catch((e) => { console.error(e); const a = document.getElementById('app'); if (a) a.innerHTML = '<div style="padding:24px;color:#d92d20">Error: ' + esc(e.message) + '</div>'; });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
});
