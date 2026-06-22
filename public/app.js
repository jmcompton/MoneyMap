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
  mic: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><path d="M12 17v4M8 21h8"/></svg>',
  recover: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 6.8v10.4"/><path d="M14.6 9.1c-.5-.8-1.5-1.3-2.6-1.3-1.5 0-2.6.8-2.6 1.9 0 1 .9 1.6 2.6 1.9 1.7.3 2.6.9 2.6 1.9 0 1.1-1.1 1.9-2.6 1.9-1.1 0-2.1-.5-2.6-1.3"/></svg>',
  grip: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>',
  up: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M18 15l-6-6-6 6"/></svg>',
  down: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
  x: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  pin: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11Z"/><circle cx="12" cy="10" r="2.4"/></svg>',
  flag: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22V4M4 4h13l-2 4 2 4H4"/></svg>',
};

function rowHtml(a) {
  return `<div class="row">
    <div class="rank">${a.rank}</div>
    <div class="name">${esc(a.name)}<small>rank ${a.rank} in your book</small></div>
    <div class="money">${money(a.commission)}</div>
    <span class="badge ${a.tier}">${a.tier}</span>
  </div>`;
}

function voiceRecorder(accountId, onSaved) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const backdrop = el('<div class="sheet-backdrop"></div>');
  const sheet = el('<div class="sheet"></div>');
  backdrop.appendChild(sheet);
  document.body.appendChild(backdrop);
  const close = () => backdrop.remove();
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });

  let finalText = '';
  let rec = null;

  const review = async (text) => {
    let pickerHtml = '';
    if (!accountId) {
      let accounts = [];
      try { const data = await api('/api/accounts?sort=name'); accounts = (data && data.accounts) || []; } catch (_) {}
      pickerHtml = `<label class="reclabel">Attach to account</label>
        <select id="acctSel" class="recsel">${accounts.map((a) => `<option value="${a.account_id}">${esc(a.name)}</option>`).join('')}</select>`;
    }
    sheet.innerHTML = `
      <h3>Review the note</h3>
      <div class="sub2">Edit anything, then save it to the timeline.</div>
      ${pickerHtml}
      <textarea class="rectext" id="rt">${esc(text)}</textarea>
      <button class="aibtn" id="ai">${I.spark} Clean it up with AI</button>
      <div class="sheetbtns"><button class="ghost" id="cancel">Cancel</button><button class="go" id="save">Save to timeline</button></div>`;
    sheet.querySelector('#cancel').addEventListener('click', close);
    sheet.querySelector('#ai').addEventListener('click', async () => {
      const btn = sheet.querySelector('#ai'); const ta = sheet.querySelector('#rt');
      if (!ta.value.trim()) return;
      btn.textContent = 'Polishing…'; btn.disabled = true;
      try {
        const r = await api('/api/ai/polish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: ta.value }) });
        ta.value = r.polished;
        btn.innerHTML = r.ai ? I.spark + ' Polished' : 'Saved as-is (AI key not set)';
      } catch (e) { btn.innerHTML = I.spark + ' Clean it up with AI'; }
      btn.disabled = false;
    });
    sheet.querySelector('#save').addEventListener('click', async () => {
      const body = sheet.querySelector('#rt').value.trim();
      if (!body) { close(); return; }
      const accId = accountId || (sheet.querySelector('#acctSel') && sheet.querySelector('#acctSel').value);
      if (!accId) { alert('Pick an account to attach this to.'); return; }
      try {
        await api('/api/accounts/' + accId + '/activity', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'call', body }) });
        close(); if (onSaved) onSaved();
      } catch (e) { alert(e.message); }
    });
  };

  if (!SR) {
    sheet.innerHTML = `<h3>Log a call</h3><div class="sub2">Voice capture isn't available in this browser, so type the note instead.</div>`;
    review('');
    return;
  }

  sheet.innerHTML = `
    <h3>Recording call</h3>
    <div class="recmic live">${I.mic}</div>
    <div class="recstatus"><span class="live-dot">●</span> Listening… speak naturally</div>
    <div class="rectranscript" id="tr"><span class="interim">Start talking and your words show up here.</span></div>
    <div class="sheetbtns"><button class="ghost" id="cancel">Cancel</button><button class="gold" id="stop">Stop & review</button></div>`;
  sheet.querySelector('#cancel').addEventListener('click', () => { try { rec && rec.stop(); } catch (_) {} close(); });
  sheet.querySelector('#stop').addEventListener('click', () => { try { rec && rec.stop(); } catch (_) {} review(finalText.trim()); });

  try {
    rec = new SR();
    rec.continuous = true; rec.interimResults = true; rec.lang = 'en-US';
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t + ' '; else interim += t;
      }
      const tr = sheet.querySelector('#tr');
      if (tr) tr.innerHTML = (esc(finalText) || '') + '<span class="interim">' + esc(interim) + '</span>' || '<span class="interim">Listening…</span>';
    };
    rec.onerror = (e) => {
      const st = sheet.querySelector('.recstatus');
      if (st) st.textContent = e.error === 'not-allowed' ? 'Mic permission is blocked. Allow it in the address bar, then reopen.' : 'Mic error: ' + e.error;
    };
    rec.start();
  } catch (e) { review(''); }
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
      ${s.found_total > 0 ? `<a class="foundcard" href="/reconcile.html">
        <div class="fc-ic">${I.recover}</div>
        <div class="fc-body"><div class="fc-label">Found money</div><div class="fc-amt">${money(s.found_total)}</div><div class="fc-sub">across ${s.found_count} account${s.found_count === 1 ? '' : 's'} you may be owed · tap to review</div></div>
        <div class="fc-arrow">→</div></a>` : ''}
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

    document.getElementById('app').insertAdjacentHTML('beforeend', `<button class="fab mic" id="micFabHome" title="Record a call">${I.mic}</button>`);
    document.getElementById('micFabHome').addEventListener('click', () => voiceRecorder(null, () => pages.home()));
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
        </div>
        <button class="fab mic" id="micFab" title="Record a call">${I.mic}</button>`;

      const save = async () => {
        const body = document.getElementById('noteText').value.trim();
        if (!body) return;
        try { await api('/api/accounts/' + id + '/activity', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'call', body }) }); render(); }
        catch (e) { alert(e.message); }
      };
      document.getElementById('saveNote').addEventListener('click', save);
      document.getElementById('logBtn').addEventListener('click', () => voiceRecorder(id, render));
      document.getElementById('micFab').addEventListener('click', () => voiceRecorder(id, render));
    };
    render();
  },

  async planner() {
    const app = document.getElementById('app');
    const state = { offset: 0, leadDay: null, railOpen: true };
    const to24 = (s) => { if (!s) return ''; const m = s.match(/(\d+):(\d+)\s*(AM|PM)/i); if (!m) return ''; let h = +m[1] % 12; if (/PM/i.test(m[3])) h += 12; return String(h).padStart(2, '0') + ':' + m[2]; };
    const to12 = (s) => { if (!s) return ''; const [h, mm] = s.split(':').map(Number); const ap = h < 12 ? 'AM' : 'PM'; const h12 = h % 12 || 12; return `${h12}:${String(mm).padStart(2, '0')} ${ap}`; };
    const post = (path, body) => api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const fullDay = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday' };
    let drag = null; // { label, city, account_id }

    const render = async () => {
      const d = await api('/api/plan?offset=' + state.offset);
      if (!d) return;
      const workingDays = d.days.filter((x) => x.working);
      if (!state.leadDay || !d.days.find((x) => x.date === state.leadDay)) {
        const today = d.days.find((x) => x.is_today);
        state.leadDay = (today || workingDays[0] || d.days[0]).date;
      }

      // ---- Week board: every day, side by side, scroll across ----
      const col = (day) => {
        const head = `<div class="wc-head ${day.is_today ? 'today' : ''}">
          <div><div class="wc-dow">${day.weekday}</div><div class="wc-date">${esc(day.label)}</div></div>
          <button class="wc-toggle ${day.working ? 'on' : ''}" data-date="${day.date}" title="Working / day off"><span></span></button>
        </div>`;
        if (!day.working) {
          return `<div class="wcol off" data-date="${day.date}">${head}<div class="wc-off">Day off</div></div>`;
        }
        const stops = day.stops.map((s, i) => {
          const personal = s.kind === 'personal';
          return `<div class="wstop ${personal ? 'personal' : ''} ${s.status === 'done' ? 'done' : ''}" draggable="${personal ? 'false' : 'true'}" data-id="${s.id}" data-date="${day.date}">
            <div class="ws-top">
              <span class="ws-ic">${personal ? I.pin : (s.account_id ? I.route : I.spark)}</span>
              <input type="time" class="ws-time" value="${to24(s.arrival_time)}" data-id="${s.id}" />
              <div class="ws-move"><button class="ws-up" data-id="${s.id}" data-date="${day.date}" ${i === 0 ? 'disabled' : ''}>${I.up}</button><button class="ws-dn" data-id="${s.id}" data-date="${day.date}" ${i === day.stops.length - 1 ? 'disabled' : ''}>${I.down}</button></div>
              <button class="ws-rem" data-id="${s.id}">${I.x}</button>
            </div>
            <div class="ws-name">${esc(s.label)}</div>
            ${(s.address || s.city) ? `<div class="ws-sub">${esc(s.address || s.city)}</div>` : ''}
          </div>`;
        }).join('');
        return `<div class="wcol" data-date="${day.date}">
          ${head}
          <input class="wc-anchor" list="cities" data-date="${day.date}" placeholder="Anchor city" value="${esc(day.anchor_city)}" />
          <div class="wc-pill start" data-edit="start" data-date="${day.date}"><span>${I.home}</span>${day.start_point ? esc(day.start_point) : 'Set start'}</div>
          <div class="wc-drop">
            ${stops || '<div class="wc-empty">Drag accounts here, or add a lead below.</div>'}
          </div>
          <button class="wc-add personal" data-date="${day.date}">${I.plus} Personal time</button>
          <div class="wc-pill end" data-edit="end" data-date="${day.date}"><span>${I.flag}</span>${day.end_point ? esc(day.end_point) : 'Set end zone'}</div>
        </div>`;
      };

      const board = d.days.map(col).join('');
      const cityOpts = d.cities.map((c) => `<option value="${esc(c)}"></option>`).join('');
      const leadDayChips = d.days.map((x) => `<button class="ldchip ${x.date === state.leadDay ? 'active' : ''} ${x.working ? '' : 'off'}" data-date="${x.date}">${x.weekday}</button>`).join('');

      app.innerHTML = `
        <header class="top"><div><h1>Planner</h1><div class="sub">Your whole week. Drag accounts from the right into a day.</div></div></header>
        <datalist id="cities">${cityOpts}</datalist>

        <div class="planner-wrap">
          <div class="planner-main">
            <div class="weeknav"><button class="wbtn" id="prevW">${I.back}</button><div class="wlabel">${esc(d.week_label)}</div><button class="wbtn" id="nextW" style="transform:rotate(180deg)">${I.back}</button></div>
            <div class="weekboard">${board}</div>
            <div class="boardhint">${I.spark} Each day's stops become <b>Today's Route</b> on your home screen.</div>

            <div class="panel leadsearch">
              <div class="head"><span class="ic indigo">${I.spark}</span><h2>Leads along your route</h2></div>
              <div class="ls-sub">Pick any day. We surface leads near your morning stop early, and near your end zone for the trip home.</div>
              <div class="lddays">${leadDayChips}</div>
              <div id="leadResults"><div class="rail-load">Loading…</div></div>
            </div>
          </div>

          <aside class="planner-rail" id="railPanel">
            <div class="rail-head"><span class="ic amber">${I.alert}</span><h2>Least-touched</h2><span class="count" id="railCount">…</span><button class="rail-close" id="railClose">${I.x}</button></div>
            <div class="rail-hint">Drag a card into a day, or tap "Add to…"</div>
            <div class="rail" id="rail"><div class="rail-load">Loading…</div></div>
          </aside>

          <button class="rail-tab" id="railTab">${I.accounts}<span>Accounts</span></button>
          <div class="rail-scrim" id="railScrim"></div>
        </div>`;

      // ---- week nav ----
      document.getElementById('prevW').addEventListener('click', () => { state.offset -= 1; state.leadDay = null; render(); });
      document.getElementById('nextW').addEventListener('click', () => { state.offset += 1; state.leadDay = null; render(); });

      const dayOf = (date) => d.days.find((x) => x.date === date);
      const saveDay = (date, patch) => { const day = dayOf(date); return post('/api/plan/day', { plan_date: date, working: patch.working ?? day.working, anchor_city: patch.anchor_city ?? day.anchor_city, start_point: patch.start_point ?? day.start_point, end_point: patch.end_point ?? day.end_point }); };

      // ---- working toggles ----
      document.querySelectorAll('.wc-toggle').forEach((b) => b.addEventListener('click', async () => {
        const day = dayOf(b.dataset.date);
        await saveDay(b.dataset.date, { working: !day.working, start_point: day.start_point || 'Home — Birmingham, AL', end_point: day.end_point || 'Home — Birmingham, AL' });
        render();
      }));

      // ---- anchor city (debounced) ----
      let at;
      document.querySelectorAll('.wc-anchor').forEach((inp) => inp.addEventListener('change', () => { clearTimeout(at); at = setTimeout(async () => { await saveDay(inp.dataset.date, { anchor_city: inp.value }); render(); }, 400); }));

      // ---- start / end pills (tap to edit) ----
      document.querySelectorAll('.wc-pill').forEach((p) => p.addEventListener('click', async () => {
        const which = p.dataset.edit; const day = dayOf(p.dataset.date);
        const cur = which === 'start' ? day.start_point : day.end_point;
        const label = which === 'start' ? 'Where do you start the day?' : 'Where do you end the day (your end zone)?';
        const val = prompt(label, cur || 'Home — Birmingham, AL');
        if (val == null) return;
        await saveDay(p.dataset.date, which === 'start' ? { start_point: val } : { end_point: val });
        render();
      }));

      // ---- personal time ----
      document.querySelectorAll('.wc-add.personal').forEach((b) => b.addEventListener('click', async () => {
        const labelv = prompt('Personal block (e.g. Pick up the girls, Lunch)'); if (!labelv) return;
        const timev = prompt('Time? (e.g. 3:30 PM) — leave blank to skip', '');
        const addr = prompt('Address? (so the route plans around it) — optional', '');
        await post('/api/plan/stop', { plan_date: b.dataset.date, label: labelv, kind: 'personal', city: addr || null, address: addr || null, arrival_time: timev || null });
        render();
      }));

      // ---- stop controls: time, remove, up/down ----
      document.querySelectorAll('.ws-time').forEach((inp) => inp.addEventListener('change', () => post('/api/plan/stop/update', { id: +inp.dataset.id, arrival_time: to12(inp.value) })));
      document.querySelectorAll('.ws-rem').forEach((b) => b.addEventListener('click', async () => { await post('/api/plan/stop/delete', { id: +b.dataset.id }); render(); }));
      const moveWithin = async (date, id, dir) => {
        const day = dayOf(date); const ids = day.stops.map((s) => s.id); const i = ids.indexOf(id);
        const j = i + dir; if (j < 0 || j >= ids.length) return;
        [ids[i], ids[j]] = [ids[j], ids[i]]; await post('/api/plan/reorder', { ordered_ids: ids }); render();
      };
      document.querySelectorAll('.ws-up').forEach((b) => b.addEventListener('click', () => moveWithin(b.dataset.date, +b.dataset.id, -1)));
      document.querySelectorAll('.ws-dn').forEach((b) => b.addEventListener('click', () => moveWithin(b.dataset.date, +b.dataset.id, +1)));

      // ---- drag a stop to reorder within its day (desktop) ----
      document.querySelectorAll('.wstop[draggable="true"]').forEach((row) => {
        row.addEventListener('dragstart', (e) => { e.stopPropagation(); drag = { reorder: true, id: +row.dataset.id, date: row.dataset.date }; row.classList.add('dragging'); });
        row.addEventListener('dragend', () => { row.classList.remove('dragging'); drag = null; });
        row.addEventListener('dragover', (e) => e.preventDefault());
        row.addEventListener('drop', async (e) => {
          e.preventDefault(); e.stopPropagation();
          if (!drag) return;
          const day = dayOf(row.dataset.date); const ids = day.stops.map((s) => s.id);
          if (drag.reorder && drag.date === row.dataset.date) {
            const from = ids.indexOf(drag.id); const to = ids.indexOf(+row.dataset.id);
            if (from < 0 || to < 0) return;
            ids.splice(from, 1); ids.splice(to, 0, drag.id);
            await post('/api/plan/reorder', { ordered_ids: ids }); render();
          }
        });
      });

      // ---- day columns are drop zones for rail/lead cards ----
      document.querySelectorAll('.wcol').forEach((c) => {
        c.addEventListener('dragover', (e) => { if (drag && !drag.reorder) { e.preventDefault(); c.classList.add('dropping'); } });
        c.addEventListener('dragleave', () => c.classList.remove('dropping'));
        c.addEventListener('drop', async (e) => {
          c.classList.remove('dropping');
          if (!drag || drag.reorder) return;
          const day = dayOf(c.dataset.date);
          if (!day || !day.working) return;
          e.preventDefault();
          await post('/api/plan/stop', { plan_date: c.dataset.date, account_id: drag.account_id || null, label: drag.label, city: drag.city || null });
          drag = null; render();
        });
      });

      // ---- least-touched rail ----
      const rail = document.getElementById('rail');
      const acc = await api('/api/accounts?sort=overdue');
      const onBoard = new Set(d.days.flatMap((x) => x.stops.map((s) => (s.label || '').toLowerCase())));
      const railItems = (acc ? acc.accounts : []).filter((a) => !onBoard.has(a.name.toLowerCase())).slice(0, 12);
      document.getElementById('railCount').textContent = railItems.length;
      const addMenu = (a) => workingDays.map((x) => `<button class="rmini" data-date="${x.date}">${x.weekday}</button>`).join('');
      rail.innerHTML = railItems.length ? railItems.map((a, i) => `
        <div class="rcard" draggable="true" data-i="${i}">
          <div class="rc-name">${esc(a.name)}</div>
          <div class="rc-meta">${esc(a.city || '')}${a.days_since_contact != null ? ` · ${a.days_since_contact}d quiet` : ''}</div>
          <div class="rc-add"><button class="rc-addbtn" data-i="${i}">${I.plus} Add to…</button><div class="rc-days" data-i="${i}">${addMenu(a)}</div></div>
        </div>`).join('') : '<div class="rail-load">Everything is on the board. Nice.</div>';
      rail.querySelectorAll('.rcard').forEach((card) => {
        const a = railItems[+card.dataset.i];
        card.addEventListener('dragstart', () => { drag = { label: a.name, city: a.city, account_id: a.account_id }; card.classList.add('dragging'); });
        card.addEventListener('dragend', () => { card.classList.remove('dragging'); });
      });
      rail.querySelectorAll('.rc-addbtn').forEach((b) => b.addEventListener('click', () => {
        const menu = rail.querySelector(`.rc-days[data-i="${b.dataset.i}"]`); menu.classList.toggle('open');
      }));
      rail.querySelectorAll('.rc-days .rmini').forEach((b) => b.addEventListener('click', async (e) => {
        const a = railItems[+e.target.closest('.rc-days').dataset.i];
        await post('/api/plan/stop', { plan_date: b.dataset.date, account_id: a.account_id, label: a.name, city: a.city });
        render();
      }));

      // ---- mobile: slide the accounts rail in from the right ----
      const railPanel = document.getElementById('railPanel');
      const railScrim = document.getElementById('railScrim');
      const openRail = () => { railPanel.classList.add('open'); railScrim.classList.add('show'); };
      const closeRail = () => { railPanel.classList.remove('open'); railScrim.classList.remove('show'); };
      document.getElementById('railTab').addEventListener('click', openRail);
      document.getElementById('railClose').addEventListener('click', closeRail);
      railScrim.addEventListener('click', closeRail);

      // ---- route-aware lead search ----
      document.querySelectorAll('.ldchip').forEach((b) => b.addEventListener('click', () => { state.leadDay = b.dataset.date; render(); }));
      const lr = document.getElementById('leadResults');
      if (state.leadDay && lr) {
        const ls = await api('/api/plan/leadsearch?plan_date=' + state.leadDay);
        const grp = (title, sub, leads) => leads && leads.length ? `
          <div class="lsgroup"><div class="lsg-title">${title}</div><div class="lsg-sub">${sub}</div>
          ${leads.map((l, i) => `<div class="lcard"><div class="lc-info"><div class="lc-name">${esc(l.name)}</div><div class="lc-meta">${esc(l.city)} · ${l.miles} mi · ~$${Number(l.est_value).toLocaleString('en-US')}/yr</div><div class="lc-reason">${esc(l.reason)}</div></div><button class="lc-add" data-g="${title}" data-i="${i}">${I.plus}</button></div>`).join('')}</div>` : '';
        if (!ls || !ls.ready) {
          lr.innerHTML = `<div class="rail-load">Set this day's anchor city or first stop, then we can search.</div>`;
        } else {
          const mTitle = `Right after your morning stop`;
          const hTitle = `On your way home`;
          const html = grp(mTitle, `Near ${esc(ls.morning_city || 'your first stop')}`, ls.morning) + grp(hTitle, `Near ${esc(ls.endpoint_city || 'home')}`, ls.home);
          lr.innerHTML = html || '<div class="rail-load">No leads on this route yet. Add more leads or change the day.</div>';
          const pick = (title, i) => (title === mTitle ? ls.morning : ls.home)[i];
          lr.querySelectorAll('.lc-add').forEach((b) => b.addEventListener('click', async () => {
            const l = pick(b.dataset.g, +b.dataset.i);
            await post('/api/plan/stop', { plan_date: state.leadDay, label: l.name, city: l.city, kind: 'lead' });
            render();
          }));
        }
      }
    };
    render();
  },

  async reconcile() {
    const app = document.getElementById('app');
    let filter = 'open';
    const tabs = [['open', 'To recover'], ['recovered', 'Recovered'], ['dismissed', 'Dismissed'], ['all', 'All']];

    const sparkline = (history) => {
      const max = Math.max(1, ...history.map((h) => h.amount));
      return `<div class="spark-bars">${history.map((h, i) => {
        const last = i === history.length - 1;
        const ht = Math.max(4, Math.round((h.amount / max) * 34));
        return `<div class="sb"><div class="sbar ${last && h.amount === 0 ? 'zero' : (last ? 'cur' : '')}" style="height:${ht}px" title="${esc(h.label)}: ${money(h.amount)}"></div><div class="sl">${esc(h.label.split(' ')[0])}</div></div>`;
      }).join('')}</div>`;
    };

    const load = async () => {
      const d = await api('/api/reconcile');
      if (!d) return;
      const s = d.summary;
      const inFilter = (it) => filter === 'all' ? true
        : filter === 'open' ? (it.status === 'open' || it.status === 'claimed')
        : it.status === filter;
      const visible = d.items.filter(inFilter);

      const cards = visible.length ? visible.map((it) => {
        const typeBadge = it.type === 'missing' ? `<span class="chip red">Missing from statement</span>` : `<span class="chip amber">Underpaid</span>`;
        let actions = '';
        if (it.status === 'open') actions = `<button class="rb claim">Mark claimed</button><button class="rb done">Recovered</button><button class="rb ghost">Dismiss</button>`;
        else if (it.status === 'claimed') actions = `<span class="statepill claimed">Claim sent</span><button class="rb done">Recovered</button><button class="rb ghost">Undo</button>`;
        else if (it.status === 'recovered') actions = `<span class="statepill recovered">Recovered ✓</span><button class="rb ghost">Undo</button>`;
        else actions = `<span class="statepill dismissed">Dismissed</span><button class="rb ghost">Undo</button>`;
        const claim = `${it.period_label} commission — ${it.account_name} shows ${money(it.current)} but averaged ${money(it.baseline)} over prior statements. Please review a possible ${money(it.gap)} discrepancy.`;
        return `<div class="rcard" data-key="${esc(it.key)}">
          <div class="rtop"><div><div class="rname">${esc(it.account_name)}</div><div class="rsub">${esc(it.manufacturer)} · ${esc(it.period_label)}</div></div><div class="rgap">+${money(it.gap)}</div></div>
          <div class="rmeta">${typeBadge}<span class="rwas">was averaging ${money(it.baseline)}, paid ${money(it.current)}</span></div>
          ${sparkline(it.history)}
          <div class="ractions">${actions}<button class="rb link copyclaim">Copy claim note</button></div>
          <textarea class="claimnote" hidden>${esc(claim)}</textarea>
        </div>`;
      }).join('') : `<div class="rcard"><div class="rsub" style="text-align:center;padding:14px">Nothing here. ${filter === 'open' ? 'No open discrepancies, your statements look clean.' : ''}</div></div>`;

      app.innerHTML = `
        <header class="top"><div><h1>Found money</h1><div class="sub">Commission you may be owed, caught by comparing every statement.</div></div></header>
        <div class="foundhero">
          <div class="fh-label">${I.recover} You may be owed</div>
          <div class="fh-amt">${money(s.found_total)}</div>
          <div class="fh-sub">${s.open_count} open discrepanc${s.open_count === 1 ? 'y' : 'ies'} across your latest statements${s.recovered_total > 0 ? ` · <b>${money(s.recovered_total)}</b> recovered` : ''}</div>
        </div>
        <div class="chips" id="rtabs" style="margin-bottom:14px">${tabs.map(([v, l]) => `<div class="fchip ${v === filter ? 'active' : ''}" data-v="${v}">${l}</div>`).join('')}</div>
        <div id="rlist">${cards}</div>`;

      document.getElementById('rtabs').addEventListener('click', (e) => {
        const c = e.target.closest('.fchip'); if (!c) return;
        filter = c.dataset.v; load();
      });

      const resolve = async (it, status) => {
        try {
          await api('/api/reconcile/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ account_id: it.account_id, manufacturer_id: it.manufacturer_id, period_label: it.period_label, type: it.type, gap: it.gap, status }) });
          load();
        } catch (e) { alert(e.message); }
      };
      document.querySelectorAll('.rcard').forEach((card) => {
        const it = d.items.find((x) => x.key === card.dataset.key);
        if (!it) return;
        const btn = (sel) => card.querySelector(sel);
        if (btn('.claim')) btn('.claim').addEventListener('click', () => resolve(it, 'claimed'));
        if (btn('.done')) btn('.done').addEventListener('click', () => resolve(it, 'recovered'));
        if (btn('.ghost')) btn('.ghost').addEventListener('click', () => resolve(it, it.status === 'open' ? 'dismissed' : 'open'));
        if (btn('.copyclaim')) btn('.copyclaim').addEventListener('click', () => {
          const ta = card.querySelector('.claimnote');
          ta.hidden = false; ta.select();
          try { document.execCommand('copy'); } catch (_) {}
          if (navigator.clipboard) navigator.clipboard.writeText(ta.value).catch(() => {});
          ta.hidden = true;
          btn('.copyclaim').textContent = 'Copied';
          setTimeout(() => { if (btn('.copyclaim')) btn('.copyclaim').textContent = 'Copy claim note'; }, 1500);
        });
      });
    };
    load();
  },

  async import() {
    const data = await api('/api/manufacturers');
    if (!data) return;
    const mfrOpts = data.manufacturers.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('');
    document.getElementById('manufacturer_id').innerHTML = mfrOpts;
    document.getElementById('pdf_manufacturer_id').innerHTML = mfrOpts;
    const note = document.getElementById('importNote');
    const preview = document.getElementById('pdfPreview');

    // CSV / PDF toggle
    document.querySelectorAll('.segbtn').forEach((b) => b.addEventListener('click', () => {
      document.querySelectorAll('.segbtn').forEach((x) => x.classList.toggle('active', x === b));
      const src = b.dataset.src;
      document.querySelector('.card.src.csv').hidden = src !== 'csv';
      document.querySelector('.card.src.pdf').hidden = src !== 'pdf';
      note.textContent = ''; note.className = ''; preview.innerHTML = '';
    }));

    const afterCommit = (r) => {
      note.className = 'notice ok';
      note.innerHTML = `Imported ${r.total} rows. ${r.matched} auto-matched, ${r.unmatched} to review.`;
      const href = r.unmatched > 0 ? `/unmatched.html?import_id=${r.import_id}` : '/';
      const label = r.unmatched > 0 ? `Review ${r.unmatched} unmatched` : 'See your money map';
      note.appendChild(el(`<a class="btn" style="display:block;text-align:center;text-decoration:none;margin-top:12px" href="${href}">${label}</a>`));
    };

    // ---- CSV ----
    document.getElementById('importForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      note.textContent = ''; note.className = '';
      const file = document.getElementById('file').files[0];
      if (!file) { note.className = 'notice err'; note.textContent = 'Choose a CSV file.'; return; }
      const fd = new FormData();
      fd.append('file', file);
      fd.append('manufacturer_id', document.getElementById('manufacturer_id').value);
      fd.append('period_label', document.getElementById('period_label').value);
      fd.append('account_col', document.getElementById('account_col').value);
      fd.append('amount_col', document.getElementById('amount_col').value);
      try { afterCommit(await api('/api/imports', { method: 'POST', body: fd })); }
      catch (err) { note.className = 'notice err'; note.textContent = err.message; }
    });

    // ---- PDF: read -> preview/edit -> commit ----
    const renderPreview = (res) => {
      const rowHtml = (r, i) => `<div class="prow" data-i="${i}">
        <input class="pr-name" value="${esc(r.raw_name)}" placeholder="Account name" />
        <input class="pr-amt" value="${esc(r.amount)}" inputmode="decimal" placeholder="0.00" />
        <button class="pr-rem" data-i="${i}" type="button">${I.x}</button></div>`;
      preview.innerHTML = `
        <div class="card" style="padding:16px;margin-top:16px">
          <div class="prev-head">
            <div><b>${res.rows.length} rows found</b><span class="prev-method">${res.method === 'ai' ? 'read by AI' : 'pattern match'}</span></div>
            <button class="link-btn" id="prAdd" type="button">${I.plus} Add row</button>
          </div>
          <div class="prev-sub">Check the names and amounts, fix anything off, then import.</div>
          <div id="prRows">${res.rows.map(rowHtml).join('')}</div>
          <button class="btn" id="prCommit" type="button" style="margin-top:14px">Import ${res.rows.length} rows &amp; match</button>
        </div>`;

      const rowsEl = document.getElementById('prRows');
      rowsEl.querySelectorAll('.pr-rem').forEach((b) => b.addEventListener('click', () => b.closest('.prow').remove()));
      document.getElementById('prAdd').addEventListener('click', () => {
        rowsEl.appendChild(el(rowHtml({ raw_name: '', amount: '' }, Date.now())));
        rowsEl.lastChild.querySelector('.pr-rem').addEventListener('click', (e) => e.target.closest('.prow').remove());
      });
      document.getElementById('prCommit').addEventListener('click', async () => {
        const rows = [...rowsEl.querySelectorAll('.prow')].map((row) => ({
          raw_name: row.querySelector('.pr-name').value.trim(),
          amount: Number(String(row.querySelector('.pr-amt').value).replace(/[^0-9.\-]/g, '')) || 0,
        })).filter((r) => r.raw_name);
        if (!rows.length) { note.className = 'notice err'; note.textContent = 'Nothing to import.'; return; }
        try {
          const r = await api('/api/imports/commit', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ manufacturer_id: document.getElementById('pdf_manufacturer_id').value, period_label: document.getElementById('pdf_period_label').value, filename: res.filename, rows }),
          });
          preview.innerHTML = ''; afterCommit(r);
        } catch (err) { note.className = 'notice err'; note.textContent = err.message; }
      });
    };

    document.getElementById('pdfRead').addEventListener('click', async () => {
      note.textContent = ''; note.className = ''; preview.innerHTML = '';
      const file = document.getElementById('pdfFile').files[0];
      if (!file) { note.className = 'notice err'; note.textContent = 'Choose a PDF file.'; return; }
      const btn = document.getElementById('pdfRead'); btn.disabled = true; btn.textContent = 'Reading…';
      try {
        const fd = new FormData(); fd.append('file', file);
        const res = await api('/api/imports/pdf/preview', { method: 'POST', body: fd });
        if (!res.rows.length) { note.className = 'notice err'; note.textContent = 'No commission rows found in that PDF. You can add rows by hand below.'; renderPreview({ rows: [], method: res.method, filename: res.filename }); }
        else renderPreview(res);
      } catch (err) { note.className = 'notice err'; note.textContent = err.message; }
      finally { btn.disabled = false; btn.textContent = 'Read PDF'; }
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

  async outreach() {
    const app = document.getElementById('app');
    const seg = await api('/api/outreach/segments');
    if (!seg) return;
    const state = { mfrId: null, recipients: [], missing: [], subject: '', body: '' };

    const segById = (id) => seg.segments.find((s) => String(s.manufacturer_id) === String(id));
    if (seg.segments.length) state.mfrId = seg.segments[0].manufacturer_id;

    const copy = async (text, btn) => {
      try { await navigator.clipboard.writeText(text); }
      catch (_) { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
      if (btn) { const o = btn.textContent; btn.textContent = 'Copied'; btn.classList.add('ok'); setTimeout(() => { btn.textContent = o; btn.classList.remove('ok'); }, 1400); }
    };
    const emailsOf = () => [...new Set(state.recipients.map((r) => r.email))];

    const render = () => {
      const emails = emailsOf();
      const seg1 = segById(state.mfrId) || { account_count: 0, email_account_count: 0 };
      app.innerHTML = `
        <header class="top"><div><h1>Email blast</h1><div class="sub">Pick a line, draft the promo, blast the buyers.</div></div></header>

        ${seg.segments.length ? `
        <div class="card" style="padding:16px">
          <label for="ob_mfr">Who buys this line</label>
          <select id="ob_mfr">${seg.segments.map((s) => `<option value="${s.manufacturer_id}" ${String(s.manufacturer_id) === String(state.mfrId) ? 'selected' : ''}>${esc(s.name)} · ${s.account_count} account${s.account_count === 1 ? '' : 's'}</option>`).join('')}</select>
          <label for="ob_promo" style="margin-top:12px">What are you pushing?</label>
          <input id="ob_promo" type="text" placeholder="e.g. Fortress 231 promo, holiday order cutoff" value="" />
          <button class="btn" id="ob_draft" type="button" style="margin-top:14px">${I.spark} Draft the email</button>
        </div>

        <div class="recip-bar">
          <span class="ic green">${I.users}</span>
          <div><b id="ob_count">${emails.length}</b> recipient${emails.length === 1 ? '' : 's'} on the ${esc(seg1.name || '')} list${state.missing.length ? ` · <span class="recip-missing">${state.missing.length} have no email</span>` : ''}</div>
          <button class="chip-toggle" id="ob_toggle" type="button">View</button>
        </div>
        <div id="ob_reciplist" class="recip-list" hidden></div>

        <div id="ob_draftwrap"></div>
        ` : `<div class="placeholder" style="margin-top:16px"><b>No lists yet</b>Import a commission statement first. Your manufacturer lists build themselves from who actually buys each line.</div>`}`;

      if (!seg.segments.length) return;

      document.getElementById('ob_mfr').addEventListener('change', async (e) => { state.mfrId = e.target.value; state.subject = ''; state.body = ''; await loadRecipients(); render(); });
      document.getElementById('ob_draft').addEventListener('click', draft);
      document.getElementById('ob_toggle').addEventListener('click', () => {
        const list = document.getElementById('ob_reciplist');
        list.hidden = !list.hidden;
        document.getElementById('ob_toggle').textContent = list.hidden ? 'View' : 'Hide';
        if (!list.hidden) list.innerHTML = (state.recipients.map((r) => `<div class="recip-row"><span>${esc(r.account_name)}${r.contact_name ? ` · ${esc(r.contact_name)}` : ''}</span><span class="recip-email">${esc(r.email)}</span></div>`).join('') + state.missing.map((m) => `<div class="recip-row missing"><span>${esc(m.account_name)}</span><span class="recip-email">no email on file</span></div>`).join('')) || '<div class="recip-row"><span>No buyers found for this line.</span></div>';
      });

      if (state.body) renderDraft();
    };

    const renderDraft = () => {
      const emails = emailsOf();
      const wrap = document.getElementById('ob_draftwrap');
      const mailto = `mailto:?bcc=${encodeURIComponent(emails.join(','))}&subject=${encodeURIComponent(state.subject)}&body=${encodeURIComponent(state.body)}`;
      const tooBig = mailto.length > 1800;
      wrap.innerHTML = `
        <div class="card" style="padding:16px;margin-top:16px">
          <label for="ob_subject">Subject</label>
          <input id="ob_subject" type="text" value="${esc(state.subject)}" />
          <label for="ob_body" style="margin-top:12px">Email</label>
          <textarea id="ob_body" rows="11" class="ob-body">${esc(state.body)}</textarea>

          <div class="blast-actions">
            <button class="btn" id="ob_copyrec" type="button">${I.users} Copy ${emails.length} recipients</button>
            <button class="btn ghost" id="ob_copybody" type="button">${I.mail} Copy email</button>
          </div>
          <a class="btn ghost ${tooBig ? 'disabled' : ''}" id="ob_mailto" href="${tooBig ? '#' : mailto}">${I.mail} Open in Mail (BCC)</a>
          ${tooBig ? '<div class="blast-hint">List is big for a mail link, so use the copy buttons and paste into Gmail or Outlook.</div>' : '<div class="blast-hint">Opens your mail app with everyone BCC\'d. Just hit send.</div>'}
        </div>`;

      document.getElementById('ob_subject').addEventListener('input', (e) => { state.subject = e.target.value; });
      document.getElementById('ob_body').addEventListener('input', (e) => { state.body = e.target.value; renderMailto(); });
      document.getElementById('ob_copyrec').addEventListener('click', (e) => copy(emails.join(', '), e.currentTarget));
      document.getElementById('ob_copybody').addEventListener('click', (e) => copy(state.subject + '\n\n' + state.body, e.currentTarget));
      const mt = document.getElementById('ob_mailto');
      if (tooBig) mt.addEventListener('click', (ev) => ev.preventDefault());
    };
    const renderMailto = () => {
      const emails = emailsOf();
      const mailto = `mailto:?bcc=${encodeURIComponent(emails.join(','))}&subject=${encodeURIComponent(state.subject)}&body=${encodeURIComponent(state.body)}`;
      const mt = document.getElementById('ob_mailto'); if (mt && mailto.length <= 1800) mt.href = mailto;
    };

    const loadRecipients = async () => {
      const r = await api('/api/outreach/recipients?manufacturer_id=' + state.mfrId);
      state.recipients = r ? r.recipients : [];
      state.missing = r ? r.missing : [];
    };

    const draft = async () => {
      const btn = document.getElementById('ob_draft'); btn.disabled = true; btn.textContent = 'Drafting…';
      try {
        const promo = document.getElementById('ob_promo').value.trim();
        const d = await api('/api/outreach/draft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ manufacturer_id: state.mfrId, promo }) });
        state.subject = d.subject; state.body = d.body;
        renderDraft();
        document.getElementById('ob_draftwrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (err) { alert(err.message); }
      finally { btn.disabled = false; btn.innerHTML = `${I.spark} Draft the email`; }
    };

    await loadRecipients();
    render();
  },
};

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('nav.bottom .ic[data-i]').forEach((s) => { s.innerHTML = I[s.dataset.i] || ''; });
  const page = document.body.dataset.page;
  if (pages[page]) pages[page]().catch((e) => { console.error(e); const a = document.getElementById('app'); if (a) a.innerHTML = '<div style="padding:24px;color:#d92d20">Error: ' + esc(e.message) + '</div>'; });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
});
