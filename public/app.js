'use strict';

const money = (n) => '$' + (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
const typeLabel = (t) => ({ two_step: 'Two-step', one_step: 'One-step', dealer: 'Dealer', contractor: 'Contractor', other: 'Account' }[t] || 'Account');
const initials = (n) => String(n || '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

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
  search: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
  phone: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.4-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z"/></svg>',
  mail: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 6 10 7L22 6"/></svg>',
  back: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  plus: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
  doc: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h6"/></svg>',
  users: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/></svg>',
  clock: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
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
        <div class="stat"><div class="label">Tracked commission</div><div class="value green">${money(s.total_commission)}</div></div>
        <div class="stat"><div class="label">Open pipeline</div><div class="value blue">${money(s.pipeline_value)}</div></div>
        <div class="stat"><div class="label">Key accounts</div><div class="value">${s.key_account_count}</div></div>
        <div class="stat"><div class="label">At-risk</div><div class="value warn">${s.at_risk_count}</div></div>
      </div>
      <div class="grid">
        <div class="col">
          <div class="panel"><div class="head"><span class="ic">${I.route}</span><h2>Today's route</h2><span class="count">${doneCount}/${d.today_route.length}</span></div><div class="progress"><span style="width:${d.today_route.length ? Math.round((doneCount / d.today_route.length) * 100) : 0}%"></span></div>${routeHtml}</div>
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
    const app = document.getElementById('app');
    const state = { q: '', tier: '', sort: 'last_contact' };
    const filters = [['', 'All'], ['A', 'Key (A)'], ['B', 'B'], ['C', 'C'], ['at_risk', 'At-risk']];
    const sorts = [['last_contact', 'Recently contacted'], ['overdue', 'Most overdue'], ['commission', 'Top commission'], ['name', 'Name A–Z']];

    app.innerHTML = `
      <header class="top"><div><h1>Accounts</h1><div class="sub">Your whole book, searchable.</div></div></header>
      <div class="toolbar">
        <div class="search"><span class="si">${I.search}</span><input id="q" type="text" placeholder="Search accounts or city" /></div>
        <div class="controls">
          <div class="chips" id="chips">${filters.map(([v, l]) => `<div class="fchip ${v === state.tier ? 'active' : ''}" data-v="${v}">${l}</div>`).join('')}</div>
          <select class="sortsel" id="sort">${sorts.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
        </div>
      </div>
      <div class="card" id="list"></div>`;

    const list = document.getElementById('list');
    const load = async () => {
      const qs = new URLSearchParams();
      if (state.q) qs.set('q', state.q);
      if (state.tier) qs.set('tier', state.tier);
      qs.set('sort', state.sort);
      const data = await api('/api/accounts?' + qs.toString());
      if (!data) return;
      if (!data.accounts.length) { list.innerHTML = `<div class="arow"><div class="ab"><div class="an">No accounts found.</div></div></div>`; return; }
      list.innerHTML = data.accounts.map((a) => {
        const touch = a.days_since_contact == null ? 'No contact logged' : (a.days_since_contact === 0 ? 'Seen today' : `${a.days_since_contact}d since contact`);
        const tierBadge = a.tier === '—' ? '' : `<span class="badge ${a.tier}">${a.tier}</span>`;
        return `<a class="arow" href="/account.html?id=${a.account_id}">
          <div class="avatar">${esc(initials(a.name))}</div>
          <div class="ab"><div class="an">${esc(a.name)}</div>
            <div class="am"><span class="tchip">${typeLabel(a.account_type)}</span><span>${esc(a.city || '')}</span><span class="dot-sep">${touch}</span></div></div>
          <div class="ar"><div class="av">${a.commission ? money(a.commission) : '—'}</div>${tierBadge}</div></a>`;
      }).join('');
    };

    let t;
    document.getElementById('q').addEventListener('input', (e) => { state.q = e.target.value; clearTimeout(t); t = setTimeout(load, 180); });
    document.getElementById('sort').addEventListener('change', (e) => { state.sort = e.target.value; load(); });
    document.getElementById('chips').addEventListener('click', (e) => {
      const c = e.target.closest('.fchip'); if (!c) return;
      state.tier = c.dataset.v;
      document.querySelectorAll('.fchip').forEach((x) => x.classList.toggle('active', x === c));
      load();
    });
    load();
  },

  async account() {
    const id = new URLSearchParams(location.search).get('id');
    const app = document.getElementById('app');
    const render = async () => {
      const d = await api('/api/accounts/' + id);
      if (!d) return;
      const a = d.account;
      const lastContact = a.days_since_contact == null ? '—' : (a.days_since_contact === 0 ? 'Today' : a.days_since_contact + 'd ago');
      const lastOrder = a.days_since_order == null ? '—' : a.days_since_order + 'd ago';

      const contactsHtml = d.contacts.length ? d.contacts.map((c) => `
        <div class="contact"><div class="ci"><div class="cn">${esc(c.name)}</div><div class="ct">${esc(c.title || '')}${c.phone ? ' · ' + esc(c.phone) : ''}</div></div>
          <div class="links">${c.phone ? `<a class="iconbtn green" href="tel:${esc(c.phone)}">${I.phone}</a>` : ''}${c.email ? `<a class="iconbtn" href="mailto:${esc(c.email)}">${I.mail}</a>` : ''}</div></div>`).join('')
        : `<div class="contact"><div class="ci"><div class="ct">No contacts yet.</div></div></div>`;

      const dealsHtml = d.deals.length ? d.deals.map((x) => {
        const c = x.days_to_close <= 7 ? 'red' : (x.days_to_close <= 14 ? 'amber' : '');
        return `<div class="deal"><div class="top"><span class="n">${esc(x.name)}</span><span class="v">${money(x.value)}</span></div><div class="sub">${esc(x.manufacturer || '')} · ${esc(x.stage)}</div><div class="meta"><span class="chip ${c}">closes in ${x.days_to_close}d</span></div></div>`;
      }).join('') : `<div class="row"><div class="name" style="font-weight:400;color:var(--muted)">No open deals.</div></div>`;

      const quotesHtml = d.quotes.length ? d.quotes.map((q) => `<div class="deal"><div class="top"><span class="n">${esc(q.title)}</span><span class="v">${money(q.amount)}</span></div><div class="sub">${esc(q.manufacturer || '')} · ${esc(q.status)} · ${q.days_ago}d ago</div><div class="meta"><span class="chip">${esc(q.file_label || 'quote.pdf')}</span></div></div>`).join('')
        : `<div class="row"><div class="name" style="font-weight:400;color:var(--muted)">No quotes yet.</div></div>`;

      const actIcon = (t) => t === 'call' ? I.phone : (t === 'visit' ? I.route : I.clock);
      const actsHtml = d.activities.length ? d.activities.map((x) => `<div class="tlitem"><div class="tn ${esc(x.type)}">${actIcon(x.type)}</div><div class="tb"><div class="tt">${esc(x.body || '')}</div><div class="td">${esc(x.type)} · ${x.days_ago === 0 ? 'today' : x.days_ago + 'd ago'}</div></div></div>`).join('')
        : `<div style="padding:2px 0 8px;color:var(--muted);font-size:14px">No activity yet. Log your first call below.</div>`;

      app.innerHTML = `
        <a class="back" href="/accounts.html">${I.back} Accounts</a>
        <div class="profile">
          <div class="pn">${esc(a.name)}</div>
          <div class="pm"><span class="tchip" style="background:rgba(255,255,255,.16);color:#fff">${typeLabel(a.account_type)}</span><span>${esc(a.city || '')}${a.state ? ', ' + esc(a.state) : ''}</span>${a.tier !== '—' ? `<span class="badge ${a.tier}">${a.tier}</span>` : ''}</div>
          <div class="pstats">
            <div class="ps"><div class="l">Commission</div><div class="v">${a.commission ? money(a.commission) : '—'}</div></div>
            <div class="ps"><div class="l">Last contact</div><div class="v ${a.days_since_contact >= 30 ? 'amber' : ''}">${lastContact}</div></div>
            <div class="ps"><div class="l">Last order</div><div class="v">${lastOrder}</div></div>
          </div>
          <div class="qa"><button class="primary" id="logBtn">${I.plus} Log a call</button></div>
        </div>
        <div class="panel"><div class="head"><span class="ic">${I.users}</span><h2>Contacts</h2><span class="count">${d.contacts.length}</span></div>${contactsHtml}</div>
        <div class="panel"><div class="head"><span class="ic blue">${I.deal}</span><h2>Open deals</h2><span class="count">${d.deals.length}</span></div>${dealsHtml}</div>
        <div class="panel"><div class="head"><span class="ic indigo">${I.doc}</span><h2>Quotes</h2><span class="count">${d.quotes.length}</span></div>${quotesHtml}</div>
        <div class="panel"><div class="head"><span class="ic amber">${I.clock}</span><h2>Activity</h2><span class="count">${d.activities.length}</span></div>
          <div class="tl" id="tl">${actsHtml}</div>
          <div class="lognote"><textarea id="noteText" placeholder="Log a call or add a note..."></textarea><button class="btn" id="saveNote" style="margin-top:10px">Save to timeline</button></div>
        </div>`;

      const save = async () => {
        const body = document.getElementById('noteText').value.trim();
        if (!body) return;
        try { await api('/api/accounts/' + id + '/activity', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'call', body }) }); render(); }
        catch (e) { alert(e.message); }
      };
      document.getElementById('saveNote').addEventListener('click', save);
      document.getElementById('logBtn').addEventListener('click', () => document.getElementById('noteText').focus());
    };
    render();
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
