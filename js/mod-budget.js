/* Budgeting menu — per pay fortnight.
   Ships with NO financial data: everything comes in through "Import budget" and lives in Hub.store under budget/…
   Store layout (all objects keyed by id):
     budget/cats/<key>      {n name, amt per-fortnight budget, e emoji, o order, by?, at?}
     budget/tx/<id>         {d date, n description, c category key, a amount (+ = spend, − = refund), acc?, m? merchant, by?, at?, ed? edited-by}
     budget/inc/<id>        {d, n, t 'salary'|'sienna'|'other', tn? type label, p? person, a, by?, at?, ed?}
     budget/cov/<YYYY-MM>   {s status, n note}   (data-coverage notes from the export)
     budget/settings        {payJacob, paySienna, importedAt, importedBy, from}
   Reads (never writes) wishlist/settings/perFortnight as a planned "Wishlist savings" line.
   Public API (ready from startup): Hub.budget.{ready, income, planned, spent, free, left, wishlist, on}
   planned()/free() exclude the Wishlist savings line on purpose (Wishlist derives its suggestion from free()). */
(() => {
  const ID = 'budget';
  const r2 = (n) => Math.round((+n || 0) * 100) / 100;
  const esc = (s) => Hub.esc(s);
  const $0 = (n) => Hub.money0(n);
  const $2 = (n) => Hub.money(n);
  const reduce = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isoAdd = (iso, n) => Hub.iso(Hub.addDays(Hub.parse(iso), n));
  const short = (d) => Hub.fmtDate(d, { day: 'numeric', month: 'short' });
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');

  const EMO = [[/rent|mortgage/i, '🏠'], [/child/i, '🧸'], [/\bcar\b/i, '🚗'], [/grocer/i, '🛒'], [/family|friend/i, '💝'], [/loan/i, '🏦'], [/health|fitness|medic|pharm/i, '💊'], [/fuel|transport|park/i, '⛽'], [/dining|takeaway|coffee/i, '🍔'], [/phone|internet|util/i, '📱'], [/buy now|afterpay|zip/i, '🧾'], [/shop|home/i, '🛍️'], [/gam/i, '🎮'], [/subscri|stream/i, '📺'], [/pet/i, '🐾'], [/fine|fee/i, '📄'], [/baby|kid/i, '🍼'], [/entertain|drink/i, '🎟️'], [/sav/i, '🐷']];
  const emojiFor = (name) => (EMO.find(([re]) => re.test(name || '')) || [0, '💸'])[1];
  const slug = (s) => String(s || '').toLowerCase().replace(/&/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'other';
  const prettyKey = (k) => String(k || 'Other').replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
  const tidy = (s) => { s = String(s || '').replace(/\\/g, ' ').replace(/\s+/g, ' ').trim(); return s === s.toUpperCase() ? s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()) : s; };
  const parseAmt = (v) => { const n = parseFloat(String(v || '').replace(/[$,\s]/g, '')); return isFinite(n) ? n : NaN; };
  const INC_T = { salary: 'Jacob’s pay', sienna: 'From Sienna', other: 'Other income' };

  /* ======================================================================
     1. DATA — store subscription, derived model, public API
     ====================================================================== */
  let data = {};
  let wish = 0;
  let M = null, Mday = '';
  const apiCbs = new Set();

  const model = () => {
    const today = Hub.today();
    if (M && Mday === today) return M;
    Mday = today;
    const cats = data.cats || {}, tx = data.tx || {}, inc = data.inc || {}, st = data.settings || {}, cov = data.cov || {};
    const fkc = {};
    const fk = (d) => fkc[d] || (fkc[d] = Hub.fortnight(d).key);
    const byF = {};
    const F = (k) => byF[k] || (byF[k] = { key: k, spent: 0, cat: {}, salary: 0, sienna: 0, other: 0, received: 0, tx: [], inc: [] });
    let first = null;
    Object.keys(tx).forEach((id) => { const t = tx[id]; if (!t || !t.d) return; const f = F(fk(t.d)); const a = +t.a || 0; f.spent += a; f.cat[t.c] = (f.cat[t.c] || 0) + a; f.tx.push(id); if (!first || t.d < first) first = t.d; });
    Object.keys(inc).forEach((id) => { const r = inc[id]; if (!r || !r.d) return; const f = F(fk(r.d)); const a = +r.a || 0; f[r.t === 'salary' ? 'salary' : r.t === 'sienna' ? 'sienna' : 'other'] += a; f.received += a; f.inc.push(id); if (!first || r.d < first) first = r.d; });
    const cur = Hub.fortnight();
    const keys = [];
    let k = first ? fk(first) : cur.key;
    for (let i = 0; k <= cur.key && i < 400; i++, k = isoAdd(k, 14)) keys.push(k);
    if (!keys.length) keys.push(cur.key);
    const catList = Object.keys(cats).filter((key) => cats[key]).map((key) => { const c = cats[key]; return { k: key, n: c.n || prettyKey(key), amt: +c.amt || 0, e: c.e || emojiFor(c.n), o: c.o == null ? 999 : +c.o }; })
      .sort((a, b) => a.o - b.o || b.amt - a.amt || a.n.localeCompare(b.n));
    const catsPlanned = r2(catList.reduce((s, c) => s + c.amt, 0));
    const expected = r2((+st.payJacob || 0) + (+st.paySienna || 0));
    M = { cats, tx, inc, st, cov, byF, keys, cur, first, catList, catsPlanned, expected, txCount: Object.keys(tx).length, incCount: Object.keys(inc).length,
      hasData: catList.length > 0 || Object.keys(tx).length > 0 };
    return M;
  };
  const catOf = (key) => { const c = (data.cats || {})[key]; return c ? { n: c.n || prettyKey(key), e: c.e || emojiFor(c.n) } : { n: prettyKey(key), e: emojiFor(key) }; };
  const fData = (key) => model().byF[key] || { key, spent: 0, cat: {}, salary: 0, sienna: 0, other: 0, received: 0, tx: [], inc: [] };
  /* UI plan total: category budgets + the Wishlist savings line (the public API leaves the wishlist line out). */
  const planned = () => r2(model().catsPlanned + wish);
  /* Income for a fortnight: the expected pay (if set) for the current one, actual money received for past ones. */
  const incomeOf = (key) => { const m = model(); return key === m.cur.key && m.expected > 0 ? m.expected : r2(fData(key).received); };
  const fNote = (key) => {
    const m = model();
    if (key === m.cur.key) return 'so far';
    const f = Hub.fortnight(key);
    const months = [key.slice(0, 7), Hub.iso(f.end).slice(0, 7)];
    if (months.some((mo) => m.cov[mo] && m.cov[mo].s === 'incomplete')) return 'some spending missing';
    if (m.first && m.first > key) return 'part only';
    return '';
  };

  const api = {
    ready: () => model().hasData,
    income: () => incomeOf(model().cur.key),
    planned: () => model().catsPlanned,            // category budgets only — never the Wishlist savings line
    spent: () => r2(fData(model().cur.key).spent),
    free: () => r2(api.income() - model().catsPlanned),
    left: () => r2(api.income() - api.spent()),
    wishlist: () => wish,
    on: (cb) => { apiCbs.add(cb); return () => apiCbs.delete(cb); }
  };

  let rafT = 0;
  const changed = () => {
    M = null;
    if (rafT) return;
    rafT = (window.requestAnimationFrame || setTimeout)(() => {
      rafT = 0;
      Hub.refreshCard(ID);
      apiCbs.forEach((cb) => { try { cb(api); } catch (e) { console.error(e); } });
      if (root) redrawVisible();
    });
  };

  /* ======================================================================
     2. UI SHELL — three panels: quick view → full budget menu → section
     ====================================================================== */
  let root = null, P = {}, curPanel = 'quick', sel = null, sec = 'cats';
  const ui = { trendMode: 'f', trendSel: null, txQ: '', txCat: '', txAll: false, txLimit: 60 };
  const SECTIONS = [
    { id: 'cats', t: 'Categories', e: '🗂️', pick: true },
    { id: 'trend', t: 'Trend', e: '📈' },
    { id: 'income', t: 'Income', e: '💵', pick: true },
    { id: 'subs', t: 'Subscriptions', e: '📺' },
    { id: 'tx', t: 'Transactions', e: '🧾', pick: true },
    { id: 'setup', t: 'Plan & data', e: '⚙️' }
  ];
  const BACK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>';
  const CHEV = '<svg class="bg-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

  const render = (body) => {
    root = body;
    body.classList.add('bg-root');
    body.innerHTML = '<div class="hb-panels bg-panels"><div class="bg-p" data-p="quick"></div><div class="bg-p" data-p="menu" hidden></div><div class="bg-p" data-p="sec" hidden></div></div>';
    body.querySelectorAll('[data-p]').forEach((el) => { P[el.dataset.p] = el; });
    body.addEventListener('click', onClick);
    body.addEventListener('input', onInput);
    body.addEventListener('change', onInput);
    drawQuick();
  };

  const redrawVisible = () => {
    if (curPanel === 'quick') drawQuick(true);
    else if (curPanel === 'menu') drawMenu();
    else drawSection(true);
  };

  const go = (panel, dir) => {
    if (panel === curPanel) return;
    const from = P[curPanel];
    curPanel = panel;
    if (panel === 'quick') drawQuick(); else if (panel === 'menu') drawMenu(); else drawSection();
    Hub.sfx(dir === 'fwd' ? 'enter' : 'close');
    Hub.slide(from, P[panel], dir);
  };

  const onShow = () => {
    if (!root) return;
    // Opening the menu always starts on the short, sweet quick view.
    if (curPanel !== 'quick') { Object.keys(P).forEach((k) => { P[k].hidden = k !== 'quick'; }); curPanel = 'quick'; }
    sel = null;
    drawQuick();
  };

  const onClick = (ev) => {
    const b = ev.target.closest('[data-act]');
    if (!b || !root.contains(b)) return;
    const a = b.dataset.act, v = b.dataset.v;
    const m = model();
    switch (a) {
      case 'add': openAdd(v || 'spend'); break;
      case 'import': openImport(); break;
      case 'open-full': go('menu', 'fwd'); break;
      case 'back-quick': go('quick', 'back'); break;
      case 'back-menu': go('menu', 'back'); break;
      case 'sec': sec = v; go('sec', 'fwd'); break;
      case 'tab': switchTab(v); break;
      case 'fn-prev': case 'fn-next': {
        const s = sel || m.cur.key, n = isoAdd(s, a === 'fn-prev' ? -14 : 14);
        if (n < m.keys[0] || n > m.cur.key) return;
        sel = n; Hub.sfx('swap');
        if (curPanel === 'menu') drawMenu(); else drawSection(false, a === 'fn-prev' ? 'back' : 'fwd');
        break;
      }
      case 'cat': openCat(v); break;
      case 'cat-new': openCat(null); break;
      case 'tx': openTx(v); break;
      case 'inc': openInc(v); break;
      case 'pay': openPay(); break;
      case 'trend-mode': ui.trendMode = v; ui.trendSel = null; drawSection(); break;
      case 'trend-pick': ui.trendSel = v; if (ui.trendMode === 'f') sel = v; Hub.sfx('tap'); drawSection(); break;
      case 'tx-scope': ui.txAll = v === 'all'; ui.txLimit = 60; drawTxList(); markSeg(b); break;
      case 'tx-more': ui.txLimit += 120; drawTxList(); break;
      case 'export': exportBackup(); break;
      case 'clear': openClear(); break;
      case 'go-setup': sec = 'setup'; go('sec', 'fwd'); break;
      default: break;
    }
  };
  const onInput = (ev) => {
    const t = ev.target;
    if (t.matches('[data-tx-q]')) { ui.txQ = t.value; ui.txLimit = 60; drawTxList(); }
    else if (t.matches('[data-tx-cat]')) { ui.txCat = t.value; ui.txLimit = 60; drawTxList(); }
  };
  const markSeg = (b) => b.parentElement.querySelectorAll('.hb-seg-b').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));

  /* Gentle count-up for big numbers */
  const tween = (el, to, fmt) => {
    if (!el) return;
    const from = el._v == null ? to * 0.85 : el._v;
    el._v = to;
    if (reduce() || from === to) { el.textContent = fmt(to); return; }
    const t0 = performance.now(), dur = 650;
    const step = (t) => { const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3); el.textContent = fmt(from + (to - from) * e); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  };

  /* ======================================================================
     3. QUICK VIEW — short, sweet, presentable
     ====================================================================== */
  const riskList = (key) => {
    const m = model(), f = fData(key), out = [];
    m.catList.forEach((c) => { const s = r2(f.cat[c.k] || 0); if (s > 0.004) out.push({ ...c, s, r: c.amt > 0 ? s / c.amt : 9 }); });
    Object.keys(f.cat).forEach((k) => { if (!m.cats[k] && f.cat[k] > 0.004) { const c = catOf(k); out.push({ k, n: c.n, e: c.e, amt: 0, s: r2(f.cat[k]), r: 9 }); } });
    return out.sort((a, b) => b.r - a.r || b.s - a.s);
  };
  const barRow = (c, act) => {
    const over = c.amt > 0 ? c.s > c.amt + 0.004 : c.s > 0;
    const pct = c.amt > 0 ? Math.min(100, (c.s / c.amt) * 100) : 100;
    const right = c.amt > 0 ? (over ? '<span class="hb-bad">' + $0(c.s - c.amt) + ' over</span>' : $0(c.amt - c.s) + ' left') : '<span class="hb-warn">no budget</span>';
    return '<button class="bg-cat' + (over ? ' over' : '') + '" data-act="' + act + '" data-v="' + esc(c.k) + '">' +
      '<span class="bg-cat-e" aria-hidden="true">' + c.e + '</span>' +
      '<span class="bg-cat-m"><span class="bg-cat-t"><b>' + esc(c.n) + '</b><span>' + right + '</span></span>' +
      '<span class="bg-cat-bar"><i style="--w:' + pct.toFixed(1) + '%"></i></span>' +
      '<span class="bg-cat-s">' + $0(c.s) + ' of ' + (c.amt > 0 ? $0(c.amt) : '—') + '</span></span></button>';
  };

  const drawQuick = (soft) => {
    const el = P.quick, m = model(), f = m.cur;
    if (!m.hasData) {
      el.innerHTML = '<div class="bg-titlebar"><div><div class="hb-k">This pay · ' + esc(f.label) + '</div><h1 class="hb-h1">Budget</h1></div></div>' +
        '<div class="hb-card accent bg-welcome"><div class="bg-welcome-e" aria-hidden="true">💰</div><h2 class="hb-h2">Bring your budget in</h2>' +
        '<p class="hb-sub">Pick the budget file you saved (it stays private between your two phones). You’ll see what’s left until payday straight away.</p>' +
        '<button class="hb-btn primary big" data-act="import">Import budget</button>' +
        '<button class="hb-btn ghost" data-act="go-setup">Or set it up by hand</button></div>';
      return;
    }
    const inc = api.income(), sp = api.spent(), left = r2(inc - sp), pl = planned();
    const fd = fData(f.key);
    const gap = r2(pl - inc);
    const usedPct = inc > 0 ? Math.max(0, Math.min(100, (sp / inc) * 100)) : 0;
    const timePct = (f.daysIn / 14) * 100;
    const risks = riskList(f.key).slice(0, 4);
    const lastManual = fd.tx.concat(fd.inc).map((id) => m.tx[id] || m.inc[id]).filter((t) => t && t.by).sort((a, b) => (b.at || 0) - (a.at || 0))[0];
    const toCome = r2(m.catList.reduce((a, c) => a + Math.max(0, c.amt - (fd.cat[c.k] || 0)), 0) + wish);
    const payTxt = f.daysLeft === 1 ? 'Payday tomorrow' : 'Payday ' + Hub.fmtDate(f.nextPayday) + ' · ' + f.daysLeft + ' days to go';
    el.innerHTML =
      '<div class="bg-titlebar"><div><div class="hb-k">This pay · ' + esc(f.label) + '</div><h1 class="hb-h1">Budget</h1></div></div>' +
      '<section class="hb-card accent bg-hero">' +
        '<div class="hb-k">' + (left >= 0 ? 'Left until payday' : 'Over this pay') + '</div>' +
        '<div class="bg-big ' + (left < 0 ? 'hb-bad' : '') + '" data-big></div>' +
        '<div class="hb-note">' + payTxt + '</div>' +
        (toCome > 1 ? '<div class="bg-tocome">' + $0(toCome) + ' of the plan still to come out</div>' : '') +
        '<div class="bg-meter" role="img" aria-label="' + Math.round(usedPct) + '% of this pay spent, ' + Math.round(timePct) + '% of the fortnight gone"><i style="--w:' + usedPct.toFixed(1) + '%"></i><b style="left:' + timePct.toFixed(1) + '%"></b></div>' +
        '<div class="bg-trio">' +
          '<div><div class="hb-k">Income</div><div class="hb-v sm">' + $0(inc) + '</div>' + (m.expected > 0 && Math.abs(fd.received - inc) > 1 ? '<div class="bg-tiny">' + $0(fd.received) + ' in so far</div>' : '') + '</div>' +
          '<div><div class="hb-k">Planned</div><div class="hb-v sm">' + $0(pl) + '</div></div>' +
          '<div><div class="hb-k">Spent</div><div class="hb-v sm">' + $0(sp) + '</div></div>' +
        '</div>' +
      '</section>' +
      (gap > 1 ? '<p class="bg-gap"><span aria-hidden="true">💛</span> The plan is <b>' + $0(gap) + ' more</b> than this pay brings in. Easing a category or two in the full budget would close the gap.</p>' : '') +
      '<section class="hb-card bg-risk"><div class="hb-row between"><h2 class="hb-h2">Keep an eye on</h2><span class="hb-note">day ' + (f.daysIn + 1) + ' of 14</span></div>' +
        (risks.length ? '<div class="bg-cats">' + risks.map((c) => barRow(c, 'cat')).join('') + '</div>' : '<p class="hb-note">Nothing has come out of any category yet this pay. 🌱</p>') +
      '</section>' +
      '<button class="hb-btn primary big bg-add" data-act="add"><span aria-hidden="true">＋</span> Add a spend</button>' +
      (lastManual ? '<p class="bg-last hb-note">Last added: <b>' + $2(lastManual.a) + '</b> ' + esc(lastManual.c ? catOf(lastManual.c).n : (INC_T[lastManual.t] || 'income')) + ' · ' + esc(lastManual.by) + '</p>' : '') +
      '<button class="hb-card tap bg-open" data-act="open-full"><span class="bg-open-e" aria-hidden="true">📊</span><span><b>Open full budget</b><span class="hb-note">Categories, trend, income, subscriptions and every transaction</span></span>' + CHEV + '</button>';
    const big = el.querySelector('[data-big]');
    if (soft && el._last != null) big._v = el._last;
    tween(big, Math.abs(left), $0);
    el._last = Math.abs(left);
  };

  /* ======================================================================
     4. FULL BUDGET — sub-menu of sections
     ====================================================================== */
  const picker = () => {
    const m = model(), k = sel || m.cur.key, f = Hub.fortnight(k), note = fNote(k);
    return '<div class="bg-pick"><button class="hb-btn icon" data-act="fn-prev" aria-label="Earlier pay"' + (k <= m.keys[0] ? ' disabled' : '') + '>‹</button>' +
      '<div class="bg-pick-t"><b>' + esc(f.label) + '</b><span>' + (k === m.cur.key ? 'This pay' : 'Pay of ' + Hub.fmtDate(f.payday, { day: 'numeric', month: 'short' })) + (note ? ' · ' + note : '') + '</span></div>' +
      '<button class="hb-btn icon" data-act="fn-next" aria-label="Later pay"' + (k >= m.cur.key ? ' disabled' : '') + '>›</button></div>';
  };

  const subs = () => {
    const m = model(), rows = {};
    let last = '';
    Object.keys(m.tx).forEach((id) => { const t = m.tx[id]; if (t.d > last) last = t.d; });
    Object.keys(m.tx).forEach((id) => {
      const t = m.tx[id]; if (!t.m || !/subscri|stream/i.test(catOf(t.c).n)) return;
      const r = rows[t.m] || (rows[t.m] = { name: t.m, byMonth: {}, dates: [] });
      const mo = t.d.slice(0, 7); r.byMonth[mo] = (r.byMonth[mo] || 0) + (+t.a || 0); r.dates.push(t.d);
    });
    const recent = last ? isoAdd(last, -45) : '';
    const order = { Regular: 0, New: 1, Occasional: 2 };
    return Object.values(rows).map((r) => {
      const tot = Object.values(r.byMonth).sort((a, b) => a - b), mid = Math.floor(tot.length / 2);
      const monthly = tot.length % 2 ? tot[mid] : (tot[mid - 1] + tot[mid]) / 2;
      r.dates.sort();
      const status = tot.length >= 3 ? 'Regular' : r.dates[0] >= recent ? 'New' : 'Occasional';
      return { name: r.name, status, months: tot.length, first: r.dates[0], last: r.dates[r.dates.length - 1], monthly: r2(monthly) };
    }).sort((a, b) => order[a.status] - order[b.status] || b.monthly - a.monthly);
  };

  const drawMenu = () => {
    const el = P.menu, m = model(), k = sel || m.cur.key, fd = fData(k);
    const isCur = k === m.cur.key;
    const inc = incomeOf(k), sp = r2(fd.spent), left = r2(inc - sp), pl = planned();
    const risks = riskList(k), over = risks.filter((c) => c.amt > 0 && c.s > c.amt + 0.004).length;
    const hist = m.keys.filter((x) => x !== m.cur.key && !fNote(x));
    const avg = hist.length ? hist.reduce((s, x) => s + fData(x).spent, 0) / hist.length : 0;
    const sb = subs().filter((s) => s.status !== 'Occasional');
    const preview = {
      cats: m.catList.length ? (over ? plural(over, 'category') + ' over' : 'All within budget') + ' this pay' : 'No categories yet',
      trend: hist.length ? 'Usual spend ' + $0(avg) + ' a pay' : 'Builds up as pays go by',
      income: m.expected > 0 ? $0(m.expected) + ' expected each pay' : 'Set what comes in each pay',
      subs: sb.length ? $0(sb.reduce((s, x) => s + x.monthly, 0)) + ' a month · ' + plural(sb.length, 'subscription') : 'None found yet',
      tx: plural(m.txCount, 'transaction') + ' · ' + fd.tx.length + ' in this pay',
      setup: 'Budgets, income, import & backup'
    };
    el.innerHTML =
      '<div class="bg-navrow"><button class="fq-back" data-act="back-quick">' + BACK + 'Quick view</button></div>' +
      '<div><h1 class="hb-h1">Full budget</h1><p class="hb-sub">Everything, one pay fortnight at a time.</p></div>' +
      picker() +
      '<div class="bg-tiles">' +
        tile(isCur && m.expected > 0 ? 'Income (expected)' : 'Income', $0(inc), isCur && m.expected > 0 ? $0(fd.received) + ' in so far' : 'Jacob ' + $0(fd.salary) + ' · Sienna ' + $0(fd.sienna) + (fd.other ? ' · other ' + $0(fd.other) : '')) +
        tile('Spent', $0(sp), pl > 0 ? Math.round((sp / pl) * 100) + '% of the plan' : '') +
        tile(left >= 0 ? 'Left over' : 'Over by', $0(Math.abs(left)), inc > 0 ? (left >= 0 ? Math.round((left / inc) * 100) + '% of income' : 'more out than in') : '', left >= 0 ? 'hb-good' : 'hb-bad') +
        tile('Planned', $0(pl), wish ? 'incl. ' + $0(wish) + ' wishlist savings' : 'per pay') +
      '</div>' +
      '<nav class="bg-menu" aria-label="Budget sections">' + SECTIONS.map((s) =>
        '<button class="bg-menu-i" data-act="sec" data-v="' + s.id + '"><span class="bg-menu-e" aria-hidden="true">' + s.e + '</span><span class="bg-menu-m"><b>' + s.t + '</b><span>' + esc(preview[s.id]) + '</span></span>' + CHEV + '</button>').join('') +
      '</nav>';
  };
  const tile = (k, v, n, cls) => '<div class="hb-card bg-tile"><div class="hb-k">' + k + '</div><div class="hb-v sm ' + (cls || '') + '">' + v + '</div>' + (n ? '<div class="bg-tiny">' + esc(n) + '</div>' : '') + '</div>';

  /* ---------- section page ---------- */
  const drawSection = (soft, dir) => {
    const el = P.sec;
    if (!soft || !el.querySelector('.bg-tabs')) {
      el.innerHTML = '<div class="bg-navrow"><button class="fq-back" data-act="back-menu">' + BACK + 'Full budget</button></div>' +
        '<div class="hb-seg bg-tabs" role="tablist">' + SECTIONS.map((s) => '<button class="hb-seg-b" role="tab" data-act="tab" data-v="' + s.id + '" aria-selected="' + (s.id === sec) + '">' + s.t + '</button>').join('') + '</div>' +
        '<div class="bg-secbody"></div>';
    }
    const tabBtn = el.querySelector('.bg-tabs [aria-selected="true"]');
    if (tabBtn && !soft) tabBtn.scrollIntoView({ block: 'nearest', inline: 'center' });
    const bodyEl = el.querySelector('.bg-secbody');
    if (soft && sec === 'tx' && bodyEl.querySelector('[data-tx-list]')) { drawTxList(); const p = bodyEl.querySelector('.bg-pick'); if (p) p.outerHTML = picker(); return; }
    bodyEl.innerHTML = DRAW[sec]();
    if (sec === 'tx') drawTxList();
    if (dir && !reduce()) { bodyEl.classList.remove('bg-sw-fwd', 'bg-sw-back'); void bodyEl.offsetWidth; bodyEl.classList.add('bg-sw-' + dir); }
  };
  const switchTab = (id) => {
    if (id === sec) return;
    const dir = SECTIONS.findIndex((s) => s.id === id) > SECTIONS.findIndex((s) => s.id === sec) ? 'fwd' : 'back';
    sec = id;
    P.sec.querySelectorAll('.bg-tabs .hb-seg-b').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.v === id)));
    const tb = P.sec.querySelector('.bg-tabs [aria-selected="true"]'); if (tb) tb.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reduce() ? 'auto' : 'smooth' });
    Hub.sfx('swap');
    drawSection(true, dir);
  };

  const DRAW = {};
  /* Sheets live outside this page, so give them the butter accent explicitly. */
  const sheet = (o) => { const sh = Hub.sheet(o); sh.el.style.setProperty('--accent', '#FFD36E'); sh.el.classList.add('bg-sheet'); return sh; };

  /* Categories: budget vs actual */
  DRAW.cats = () => {
    const m = model(), k = sel || m.cur.key, f = fData(k);
    const rows = m.catList.map((c) => ({ ...c, s: r2(f.cat[c.k] || 0) }));
    Object.keys(f.cat).forEach((key) => { if (!m.cats[key] && Math.abs(f.cat[key]) > 0.004) { const c = catOf(key); rows.push({ k: key, n: c.n, e: c.e, amt: 0, s: r2(f.cat[key]) }); } });
    rows.sort((a, b) => b.s - a.s || b.amt - a.amt);
    const over = rows.filter((c) => c.amt > 0 && c.s > c.amt + 0.004);
    return picker() +
      '<div class="hb-card"><div class="hb-row between"><h2 class="hb-h2">Budget vs spent</h2><button class="hb-btn sm" data-act="cat-new">＋ Category</button></div>' +
      '<p class="hb-note">' + (over.length ? plural(over.length, 'category') + ' went over: ' + esc(over.map((c) => c.n).join(', ')) + '.' : 'Every category is within its budget for this pay.') + ' Tap one to change its budget.</p>' +
      '<div class="bg-cats">' + rows.map((c) => barRow(c, 'cat')).join('') +
      (wish ? '<div class="bg-cat bg-wish"><span class="bg-cat-e" aria-hidden="true">🎁</span><span class="bg-cat-m"><span class="bg-cat-t"><b>Wishlist savings</b><span>' + $0(wish) + ' a pay</span></span><span class="bg-cat-s">Set aside in the Wishlist menu</span></span></div>' : '') +
      '</div></div>';
  };

  /* Trend: spending vs income per fortnight (or month) */
  const monthRows = () => {
    const m = model(), by = {};
    const B = (mo) => by[mo] || (by[mo] = { key: mo, spent: 0, received: 0 });
    Object.values(m.tx).forEach((t) => { B(t.d.slice(0, 7)).spent += +t.a || 0; });
    Object.values(m.inc).forEach((r) => { B(r.d.slice(0, 7)).received += +r.a || 0; });
    const plan = r2(planned() * 26 / 12), curMo = Hub.today().slice(0, 7);
    return Object.keys(by).sort().map((mo) => {
      const c = m.cov[mo];
      const note = mo === curMo ? 'so far' : c && c.s === 'incomplete' ? 'some spending missing' : c && c.s === 'in progress' ? 'so far' : '';
      return { key: mo, spent: r2(by[mo].spent), income: r2(by[mo].received), plan, note, label: Hub.fmtDate(mo + '-01', { month: 'short' }), title: Hub.fmtDate(mo + '-01', { month: 'long', year: 'numeric' }) };
    });
  };
  const fortRows = () => {
    const m = model(), plan = planned();
    return m.keys.map((k) => { const f = fData(k); return { key: k, spent: r2(f.spent), income: r2(f.received), plan, note: fNote(k), label: short(k), title: Hub.fortnight(k).label }; });
  };
  const chart = (rows, selKey) => {
    const W = 360, H = 210, ml = 38, mr = 6, mt = 10, mb = 24;
    const max = Math.max(1, ...rows.map((r) => Math.max(r.spent, r.income, r.plan)));
    const step = Math.pow(10, Math.floor(Math.log10(max / 3))), nice = [1, 2, 2.5, 5, 10].map((x) => x * step).find((x) => max / x <= 4) || step * 10;
    const top = Math.ceil(max / nice) * nice;
    const y = (v) => mt + (H - mt - mb) * (1 - Math.max(0, v) / top);
    const bw = (W - ml - mr) / rows.length, bar = Math.min(26, bw * 0.62);
    const cx = (i) => ml + bw * i + bw / 2;
    const fmtAx = (v) => (v >= 1000 ? '$' + (v / 1000).toFixed(v % 1000 ? 1 : 0) + 'k' : '$' + v);
    let s = '<svg class="bg-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Spending and income over time">';
    for (let v = 0; v <= top + 0.1; v += nice) s += '<line x1="' + ml + '" x2="' + (W - mr) + '" y1="' + y(v) + '" y2="' + y(v) + '" class="bg-grid"/><text x="' + (ml - 6) + '" y="' + (y(v) + 3.5) + '" text-anchor="end" class="bg-ax">' + fmtAx(v) + '</text>';
    const every = Math.ceil(rows.length / 7);
    rows.forEach((r, i) => {
      const on = r.key === selKey;
      if (on) s += '<rect x="' + (cx(i) - bw / 2) + '" y="' + mt + '" width="' + bw + '" height="' + (H - mt - mb) + '" rx="6" class="bg-hl"/>';
      const h = Math.max(0, y(0) - y(r.spent));
      s += '<rect x="' + (cx(i) - bar / 2) + '" y="' + (y(0) - h) + '" width="' + bar + '" height="' + h + '" rx="' + Math.min(5, bar / 2) + '" class="bg-bar' + (r.note ? ' faded' : '') + (r.spent > r.income && !r.note ? ' over' : '') + '" style="--d:' + Math.round(i * 220 / rows.length) + 'ms"/>';
      if ((rows.length - 1 - i) % every === 0) s += '<text x="' + cx(i) + '" y="' + (H - 7) + '" text-anchor="middle" class="bg-ax' + (on ? ' on' : '') + '">' + esc(r.label) + '</text>';
    });
    s += '<path d="M' + rows.map((r, i) => cx(i) + ' ' + y(r.plan)).join(' L') + '" class="bg-plan"/>';
    s += '<path d="M' + rows.map((r, i) => cx(i) + ' ' + y(r.income)).join(' L') + '" class="bg-incl"/>';
    rows.forEach((r, i) => { s += '<circle cx="' + cx(i) + '" cy="' + y(r.income) + '" r="3.6" class="bg-dot"/>'; });
    rows.forEach((r, i) => { s += '<rect x="' + (cx(i) - bw / 2) + '" y="0" width="' + bw + '" height="' + H + '" fill="transparent" data-act="trend-pick" data-v="' + r.key + '" role="button" aria-label="' + esc(r.title) + '"><title>' + esc(r.title) + '</title></rect>'; });
    return s + '</svg>';
  };
  DRAW.trend = () => {
    const rows = ui.trendMode === 'm' ? monthRows() : fortRows();
    const m = model();
    let pick = ui.trendSel || (ui.trendMode === 'f' ? sel || m.cur.key : null);
    let r = rows.find((x) => x.key === pick) || rows[rows.length - 1];
    if (!r) return '<p class="hb-empty"><b>No history yet</b>It builds up as pays go by.</p>';
    const full = rows.filter((x) => !x.note);
    const avgS = full.length ? full.reduce((s, x) => s + x.spent, 0) / full.length : 0;
    const avgI = full.length ? full.reduce((s, x) => s + x.income, 0) / full.length : 0;
    const left = r2(r.income - r.spent);
    return '<div class="hb-seg bg-mode"><button class="hb-seg-b" data-act="trend-mode" data-v="f" aria-pressed="' + (ui.trendMode === 'f') + '">Each pay</button><button class="hb-seg-b" data-act="trend-mode" data-v="m" aria-pressed="' + (ui.trendMode === 'm') + '">Each month</button></div>' +
      '<div class="hb-card"><h2 class="hb-h2">Spending and income</h2>' +
      '<div class="bg-legend"><span><i class="sw-bar"></i>Spent</span><span><i class="sw-over"></i>More out than in</span><span><i class="sw-inc"></i>Income</span><span><i class="sw-plan"></i>Planned</span></div>' +
      chart(rows, r.key) +
      '<p class="hb-note">' + (full.length ? 'Usually about <b>' + $0(avgS) + '</b> goes out and <b>' + $0(avgI) + '</b> comes in each ' + (ui.trendMode === 'm' ? 'month' : 'pay') + '. ' : '') + 'Faded bars are ' + (ui.trendMode === 'm' ? 'months' : 'pays') + ' still going or with spending missing from the files. Tap a bar for details.</p></div>' +
      '<div class="hb-card bg-detail"><div class="hb-k">' + esc(r.title) + (r.note ? ' · ' + r.note : '') + '</div>' +
      '<div class="bg-dl"><span>Income</span><b class="hb-good">' + $0(r.income) + '</b><span>Spent</span><b>' + $0(r.spent) + '</b><span>Planned</span><b>' + $0(r.plan) + '</b><span>' + (left >= 0 ? 'Left over' : 'More out than in') + '</span><b class="' + (left >= 0 ? 'hb-good' : 'hb-bad') + '">' + $0(Math.abs(left)) + '</b></div></div>';
  };

  /* Income */
  DRAW.income = () => {
    const m = model(), k = sel || m.cur.key, f = fData(k), st = m.st;
    const list = f.inc.map((id) => ({ id, ...m.inc[id] })).sort((a, b) => (b.d < a.d ? -1 : b.d > a.d ? 1 : 0));
    const rows = m.keys.map((key) => { const x = fData(key); return { key, s: x.salary, si: x.sienna, o: x.other }; });
    const max = Math.max(1, ...rows.map((r) => Math.max(0, r.s) + Math.max(0, r.si) + Math.max(0, r.o)));
    const sb = '<div class="bg-stack" role="img" aria-label="Income each pay">' + rows.map((r) => {
      const h = (v) => (Math.max(0, v) / max * 100).toFixed(1) + '%';
      return '<button class="bg-stack-c' + (r.key === k ? ' on' : '') + '" data-act="trend-pick" data-v="' + r.key + '" title="' + esc(Hub.fortnight(r.key).label) + '"><i class="o" style="height:' + h(r.o) + '"></i><i class="si" style="height:' + h(r.si) + '"></i><i class="s" style="height:' + h(r.s) + '"></i></button>';
    }).join('') + '</div>';
    return picker() +
      '<div class="hb-card"><div class="hb-row between"><h2 class="hb-h2">Came in this pay</h2><b class="hb-v sm">' + $0(f.received) + '</b></div>' +
      '<div class="bg-dl"><span>Jacob’s pay</span><b>' + $2(f.salary) + '</b><span>From Sienna</span><b>' + $2(f.sienna) + '</b><span>Other</span><b>' + $2(f.other) + '</b></div>' +
      sb + '<div class="bg-legend"><span><i class="sw-s"></i>Jacob’s pay</span><span><i class="sw-si"></i>Sienna</span><span><i class="sw-o"></i>Other</span></div></div>' +
      '<button class="hb-card tap bg-expect" data-act="pay"><span><span class="hb-k">Expected each pay</span><span class="hb-v sm">' + (m.expected > 0 ? $0(m.expected) : 'Not set') + '</span>' +
      '<span class="bg-tiny">' + (m.expected > 0 ? 'Jacob ' + $0(st.payJacob || 0) + ' · Sienna ' + $0(st.paySienna || 0) + ' — tap to change' : 'Tap to set what usually comes in') + '</span></span>' + CHEV + '</button>' +
      '<div class="hb-card"><div class="hb-row between"><h2 class="hb-h2">Entries</h2><button class="hb-btn sm" data-act="add" data-v="income">＋ Income</button></div>' +
      (list.length ? '<div class="bg-txs">' + list.map((r) => txRow(r, 'inc')).join('') + '</div>' : '<p class="hb-note">Nothing recorded for this pay yet.</p>') + '</div>';
  };

  /* Subscriptions */
  DRAW.subs = () => {
    const list = subs();
    if (!list.length) return '<p class="hb-empty"><b>No subscriptions found</b>Charges in a “Subscriptions” category with a named service show up here.</p>';
    const tot = (s) => list.filter((x) => x.status === s);
    const reg = tot('Regular'), nw = tot('New');
    const sum = (a) => a.reduce((s, x) => s + x.monthly, 0);
    return '<div class="bg-tiles">' + tile('Regular', $0(sum(reg)) + '/mo', plural(reg.length, 'subscription') + ' · ' + $0(sum(reg) * 12 / 26) + ' a pay') + tile('New', $0(sum(nw)) + '/mo', plural(nw.length, 'subscription') + ' in the last 45 days') + '</div>' +
      '<div class="hb-card"><h2 class="hb-h2">Every subscription</h2><p class="hb-note">Regular = charged in 3 or more months. New = first charged in the last 45 days. Monthly cost is a typical month.</p>' +
      '<div class="bg-subs">' + list.map((s) => '<div class="bg-sub"><span class="bg-sub-m"><b>' + esc(s.name) + '</b><span>' + plural(s.months, 'month') + ' · last ' + short(s.last) + '</span></span><span class="hb-chip ' + (s.status === 'Regular' ? 'accent' : s.status === 'New' ? 'good' : '') + '">' + s.status + '</span><b class="bg-sub-a">' + $2(s.monthly) + '</b></div>').join('') + '</div></div>';
  };

  /* Transactions */
  const txRow = (t, kind) => {
    const isInc = kind === 'inc';
    const c = isInc ? { e: t.t === 'sienna' ? '💞' : t.t === 'salary' ? '💼' : '💵', n: t.tn || INC_T[t.t] || 'Income' } : catOf(t.c);
    const who = t.by ? '<span class="hb-chip accent">' + esc(t.by) + '</span>' : t.ed ? '<span class="hb-chip">edited by ' + esc(t.ed) + '</span>' : '';
    return '<button class="bg-tx" data-act="' + (isInc ? 'inc' : 'tx') + '" data-v="' + esc(t.id) + '"><span class="bg-tx-e" aria-hidden="true">' + c.e + '</span>' +
      '<span class="bg-tx-m"><b>' + esc(tidy(t.n) || c.n) + '</b><span>' + short(t.d) + ' · ' + esc(c.n) + (t.acc ? ' · ' + esc(t.acc) : '') + '</span>' + (who ? '<span>' + who + '</span>' : '') + '</span>' +
      '<b class="bg-tx-a' + (isInc || t.a < 0 ? ' hb-good' : '') + '">' + (isInc ? '+' : t.a < 0 ? '+' : '') + $2(Math.abs(t.a)) + '</b></button>';
  };
  DRAW.tx = () => {
    const m = model();
    return '<div class="bg-scope">' + picker() + '</div>' +
      '<div class="hb-card bg-txcard"><div class="hb-row between"><h2 class="hb-h2">Transactions</h2><button class="hb-btn sm" data-act="add">＋ Spend</button></div>' +
      '<input class="hb-input" type="search" placeholder="Search description, category or account" aria-label="Search transactions" data-tx-q value="' + esc(ui.txQ) + '">' +
      '<div class="bg-filters"><div class="hb-seg"><button class="hb-seg-b" data-act="tx-scope" data-v="pay" aria-pressed="' + !ui.txAll + '">This pay</button><button class="hb-seg-b" data-act="tx-scope" data-v="all" aria-pressed="' + ui.txAll + '">All time</button></div>' +
      '<label class="hb-field bg-catsel"><span class="bg-sr">Category</span><select data-tx-cat><option value="">All categories</option>' + m.catList.map((c) => '<option value="' + esc(c.k) + '"' + (ui.txCat === c.k ? ' selected' : '') + '>' + c.e + ' ' + esc(c.n) + '</option>').join('') + '</select></label></div>' +
      '<div data-tx-list></div></div>';
  };
  const drawTxList = () => {
    const box = P.sec && P.sec.querySelector('[data-tx-list]');
    if (!box) return;
    const m = model(), k = sel || m.cur.key;
    const scope = P.sec.querySelector('.bg-scope'); if (scope) scope.classList.toggle('dim', ui.txAll);
    const ids = ui.txAll ? Object.keys(m.tx) : fData(k).tx;
    const q = ui.txQ.trim().toLowerCase();
    const rows = ids.map((id) => ({ id, ...m.tx[id] })).filter((t) => (!ui.txCat || t.c === ui.txCat) && (!q || (t.n + ' ' + catOf(t.c).n + ' ' + (t.acc || '') + ' ' + (t.m || '') + ' ' + (t.by || '')).toLowerCase().includes(q)))
      .sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : (b.at || 0) - (a.at || 0)));
    const total = rows.reduce((s, t) => s + (+t.a || 0), 0);
    if (!rows.length) { box.innerHTML = '<p class="hb-empty"><b>Nothing here</b>' + (q || ui.txCat ? 'Try a different search.' : 'No spending recorded for this pay yet.') + '</p>'; return; }
    let html = '<p class="hb-note bg-txsum">' + plural(rows.length, 'transaction') + ' · ' + $2(total) + '</p>', day = '';
    rows.slice(0, ui.txLimit).forEach((t) => { if (t.d !== day) { day = t.d; html += '<div class="bg-day">' + Hub.fmtDate(t.d, { weekday: 'short', day: 'numeric', month: 'short' }) + '</div>'; } html += txRow(t, 'tx'); });
    if (rows.length > ui.txLimit) html += '<button class="hb-btn ghost bg-more" data-act="tx-more">Show more (' + (rows.length - ui.txLimit) + ' left)</button>';
    box.innerHTML = '<div class="bg-txs">' + html + '</div>';
  };

  /* Plan & data */
  DRAW.setup = () => {
    const m = model(), st = m.st;
    const covs = Object.keys(m.cov).sort().map((mo) => ({ mo, ...m.cov[mo] })).filter((c) => c.s !== 'complete');
    const gap = r2(planned() - (m.expected || 0));
    return '<button class="hb-card tap bg-expect" data-act="pay"><span><span class="hb-k">Expected income each pay</span><span class="hb-v sm">' + (m.expected > 0 ? $0(m.expected) : 'Not set') + '</span>' +
      '<span class="bg-tiny">' + (m.expected > 0 ? 'Jacob ' + $0(st.payJacob || 0) + ' · Sienna ' + $0(st.paySienna || 0) : 'Tap to set') + '</span></span>' + CHEV + '</button>' +
      '<div class="hb-card"><div class="hb-row between"><h2 class="hb-h2">Planned each pay</h2><button class="hb-btn sm" data-act="cat-new">＋ Category</button></div>' +
      '<div class="bg-plan-l">' + m.catList.map((c) => '<button class="bg-pl" data-act="cat" data-v="' + esc(c.k) + '"><span aria-hidden="true">' + c.e + '</span><span>' + esc(c.n) + '</span><b>' + $2(c.amt) + '</b></button>').join('') +
      (wish ? '<div class="bg-pl ro"><span aria-hidden="true">🎁</span><span>Wishlist savings <span class="bg-tiny">set in Wishlist</span></span><b>' + $2(wish) + '</b></div>' : '') +
      '<div class="bg-pl tot"><span></span><span>Total planned</span><b>' + $2(planned()) + '</b></div></div>' +
      (m.expected > 0 ? '<p class="hb-note">' + (gap > 1 ? 'That’s ' + $0(gap) + ' more than the expected income of ' + $0(m.expected) + '. No stress — tap any line to ease it back.' : 'That leaves ' + $0(-gap) + ' unplanned from the expected ' + $0(m.expected) + ' each pay.') + '</p>' : '') +
      '<p class="hb-note">About ' + $0(planned() * 26 / 12) + ' a month.</p></div>' +
      '<div class="hb-card"><h2 class="hb-h2">Data</h2>' +
      '<p class="hb-note">' + (st.importedAt ? 'Last import ' + Hub.fmtDate(new Date(st.importedAt), { day: 'numeric', month: 'short' }) + (st.importedBy ? ' by ' + esc(st.importedBy) : '') + (st.from ? ' · from ' + esc(st.from) : '') + '. ' : '') + plural(m.txCount, 'transaction') + ', ' + plural(m.incCount, 'income entry').replace('entrys', 'entries') + '. Saved privately on your phones, never in the app’s public files.</p>' +
      '<div class="hb-row"><button class="hb-btn primary" data-act="import">Import newer data</button><button class="hb-btn" data-act="export">Download a backup</button></div></div>' +
      (covs.length ? '<div class="hb-card"><h2 class="hb-h2">Notes on the data</h2>' + covs.map((c) => '<p class="hb-note"><b>' + Hub.fmtDate(c.mo + '-01', { month: 'long' }) + '</b> · ' + esc(c.s) + (c.n ? ' — ' + esc(c.n) : '') + '</p>').join('') + '</div>' : '') +
      '<button class="hb-btn ghost danger" data-act="clear">Clear budget from both phones…</button>';
  };

  /* ======================================================================
     5. UPDATING — quick add, edit, categories, income, import / merge
     ====================================================================== */
  const recentCats = () => {
    const m = model(), since = isoAdd(Hub.today(), -60), n = {};
    Object.values(m.tx).forEach((t) => { if (t.d >= since) n[t.c] = (n[t.c] || 0) + 1; });
    return m.catList.slice().sort((a, b) => (n[b.k] || 0) - (n[a.k] || 0) || a.o - b.o);
  };

  const openAdd = (kind) => {
    const m = model();
    const wrap = document.createElement('div');
    wrap.className = 'hb-form bg-add-f';
    let mode = kind === 'income' ? 'income' : 'spend';
    wrap.innerHTML =
      '<div class="hb-seg"><button class="hb-seg-b" data-mode="spend">Spend</button><button class="hb-seg-b" data-mode="income">Income</button></div>' +
      '<label class="bg-amt"><span class="bg-sr">Amount</span><span class="bg-amt-s" aria-hidden="true">$</span><input class="bg-amt-i" size="4" inputmode="decimal" autocomplete="off" placeholder="0.00" data-amt></label>' +
      '<div class="bg-add-row"><input class="hb-input" placeholder="What was it? (optional)" data-note maxlength="80"><input class="hb-input bg-date" type="date" value="' + Hub.today() + '" max="' + Hub.today() + '" aria-label="Date" data-date></div>' +
      '<p class="hb-err" data-err hidden></p>' +
      '<div class="hb-k" data-pickl></div><div class="bg-chips" data-chips></div>';
    const chips = wrap.querySelector('[data-chips]');
    const drawChips = () => {
      wrap.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
      wrap.querySelector('[data-pickl]').textContent = mode === 'spend' ? 'Tap a category to save' : 'Tap where it came from to save';
      const list = mode === 'spend' ? recentCats().map((c) => ({ v: c.k, e: c.e, n: c.n })) : [{ v: 'salary', e: '💼', n: 'Jacob’s pay' }, { v: 'sienna', e: '💞', n: 'From Sienna' }, { v: 'other', e: '💵', n: 'Other income' }];
      chips.innerHTML = list.length ? list.map((c) => '<button class="bg-chipb" data-pick="' + esc(c.v) + '"><span aria-hidden="true">' + c.e + '</span>' + esc(c.n) + '</button>').join('') : '<p class="hb-note">Add a category in the full budget first.</p>';
    };
    wrap.addEventListener('click', (ev) => {
      const md = ev.target.closest('[data-mode]');
      if (md) { mode = md.dataset.mode; Hub.sfx('tap'); drawChips(); return; }
      const pk = ev.target.closest('[data-pick]');
      if (!pk) return;
      const amt = r2(parseAmt(wrap.querySelector('[data-amt]').value));
      const err = wrap.querySelector('[data-err]');
      if (!(amt > 0)) { err.hidden = false; err.textContent = 'Pop the amount in first.'; wrap.querySelector('[data-amt]').focus(); return; }
      const note = wrap.querySelector('[data-note]').value.trim();
      const d = wrap.querySelector('[data-date]').value || Hub.today();
      const by = Hub.me() || 'Someone';
      if (mode === 'spend') {
        const c = catOf(pk.dataset.pick);
        Hub.store.set('budget/tx/' + Hub.store.id('m'), { d, n: note || c.n, c: pk.dataset.pick, a: amt, by, at: Date.now() });
        Hub.toast('Added ' + $2(amt) + ' to ' + c.n);
      } else {
        const t = pk.dataset.pick;
        Hub.store.set('budget/inc/' + Hub.store.id('m'), { d, n: note || INC_T[t], t, p: t === 'sienna' ? 'Sienna' : t === 'salary' ? 'Jacob' : by, a: amt, by, at: Date.now() });
        Hub.toast('Added ' + $2(amt) + ' income');
      }
      Hub.sfx('tick');
      s.close();
    });
    drawChips();
    const s = sheet({ title: m.hasData ? '＋ Add' : '＋ Add', body: wrap });
    setTimeout(() => { const i = wrap.querySelector('[data-amt]'); if (i) i.focus(); }, 80);
  };

  const confirmDelete = (btn, fn) => {
    if (btn.dataset.sure) { fn(); return; }
    btn.dataset.sure = '1'; btn.textContent = 'Tap again to delete';
    setTimeout(() => { if (btn.isConnected) { delete btn.dataset.sure; btn.textContent = 'Delete'; } }, 3500);
  };

  const openTx = (id) => {
    const m = model(), t = m.tx[id];
    if (!t) return;
    const wrap = document.createElement('form');
    wrap.className = 'hb-form';
    wrap.innerHTML =
      '<label class="hb-field"><span>Amount (use − for a refund)</span><input class="hb-input" inputmode="decimal" name="a" value="' + r2(t.a) + '"></label>' +
      '<label class="hb-field"><span>Description</span><input class="hb-input" name="n" value="' + esc(tidy(t.n)) + '" maxlength="80"></label>' +
      '<label class="hb-field"><span>Category</span><select name="c">' + m.catList.map((c) => '<option value="' + esc(c.k) + '"' + (c.k === t.c ? ' selected' : '') + '>' + c.e + ' ' + esc(c.n) + '</option>').join('') + (m.cats[t.c] ? '' : '<option value="' + esc(t.c) + '" selected>' + esc(catOf(t.c).n) + '</option>') + '</select></label>' +
      '<label class="hb-field"><span>Date</span><input class="hb-input" type="date" name="d" value="' + esc(t.d) + '"></label>' +
      '<p class="hb-note">' + (t.by ? 'Added by ' + esc(t.by) + (t.at ? ' on ' + Hub.fmtDate(new Date(t.at)) : '') : 'Imported' + (t.acc ? ' from ' + esc(t.acc) : '')) + (t.ed ? ' · edited by ' + esc(t.ed) : '') + '</p>' +
      '<p class="hb-err" data-err hidden></p>' +
      '<div class="hb-row big"><button class="hb-btn primary" type="submit">Save</button><button class="hb-btn ghost danger" type="button" data-del>Delete</button></div>';
    const s = sheet({ title: catOf(t.c).e + ' Transaction', body: wrap });
    wrap.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const f = new FormData(wrap), a = r2(parseAmt(f.get('a')));
      if (!isFinite(a) || a === 0) { const e = wrap.querySelector('[data-err]'); e.hidden = false; e.textContent = 'That amount doesn’t look right.'; return; }
      const patch = { a, n: String(f.get('n') || '').trim() || t.n, c: f.get('c'), d: f.get('d') || t.d };
      if (!t.by) patch.ed = Hub.me() || 'Someone';
      Hub.store.update('budget/tx/' + id, patch); Hub.sfx('tick'); Hub.toast('Saved'); s.close();
    });
    wrap.querySelector('[data-del]').addEventListener('click', (ev) => confirmDelete(ev.currentTarget, () => { Hub.store.remove('budget/tx/' + id); Hub.toast('Deleted'); s.close(); }));
  };

  const openInc = (id) => {
    const m = model(), t = m.inc[id];
    if (!t) return;
    const wrap = document.createElement('form');
    wrap.className = 'hb-form';
    wrap.innerHTML =
      '<label class="hb-field"><span>Amount</span><input class="hb-input" inputmode="decimal" name="a" value="' + r2(t.a) + '"></label>' +
      '<label class="hb-field"><span>Description</span><input class="hb-input" name="n" value="' + esc(tidy(t.n)) + '" maxlength="80"></label>' +
      '<label class="hb-field"><span>Type</span><select name="t">' + Object.keys(INC_T).map((k) => '<option value="' + k + '"' + (k === t.t ? ' selected' : '') + '>' + INC_T[k] + '</option>').join('') + '</select></label>' +
      '<label class="hb-field"><span>Date</span><input class="hb-input" type="date" name="d" value="' + esc(t.d) + '"></label>' +
      '<p class="hb-note">' + (t.by ? 'Added by ' + esc(t.by) : 'Imported') + (t.ed ? ' · edited by ' + esc(t.ed) : '') + '</p>' +
      '<div class="hb-row big"><button class="hb-btn primary" type="submit">Save</button><button class="hb-btn ghost danger" type="button" data-del>Delete</button></div>';
    const s = sheet({ title: '💵 Income', body: wrap });
    wrap.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const f = new FormData(wrap), a = r2(parseAmt(f.get('a')));
      if (!isFinite(a) || a === 0) return;
      const patch = { a, n: String(f.get('n') || '').trim() || t.n, t: f.get('t'), d: f.get('d') || t.d };
      if (!t.by) patch.ed = Hub.me() || 'Someone';
      Hub.store.update('budget/inc/' + id, patch); Hub.sfx('tick'); Hub.toast('Saved'); s.close();
    });
    wrap.querySelector('[data-del]').addEventListener('click', (ev) => confirmDelete(ev.currentTarget, () => { Hub.store.remove('budget/inc/' + id); Hub.toast('Deleted'); s.close(); }));
  };

  const openCat = (key) => {
    const m = model(), c = key ? (m.cats[key] || { n: catOf(key).n, amt: 0 }) : { n: '', amt: '' };
    const used = key ? Object.values(m.tx).filter((t) => t.c === key).length : 0;
    const wrap = document.createElement('form');
    wrap.className = 'hb-form';
    wrap.innerHTML =
      '<div class="bg-add-row"><label class="hb-field bg-emo"><span>Icon</span><input class="hb-input" name="e" value="' + esc(c.e || (key ? catOf(key).e : '')) + '" maxlength="4"></label>' +
      '<label class="hb-field"><span>Name</span><input class="hb-input" name="n" value="' + esc(c.n) + '" maxlength="40" required></label></div>' +
      '<label class="hb-field"><span>Budget each pay</span><input class="hb-input" inputmode="decimal" name="amt" value="' + (c.amt === '' ? '' : r2(c.amt)) + '" placeholder="0.00"></label>' +
      '<p class="hb-note" data-mo></p>' +
      '<p class="hb-err" data-err hidden></p>' +
      '<div class="hb-row big"><button class="hb-btn primary" type="submit">Save</button>' + (key && m.cats[key] ? '<button class="hb-btn ghost danger" type="button" data-del>Delete</button>' : '') + '</div>' +
      (key && used ? '<p class="hb-note">' + plural(used, 'transaction') + ' use this category. Deleting only removes its budget line; the transactions stay.</p>' : '');
    const mo = wrap.querySelector('[data-mo]'), amtI = wrap.querySelector('[name=amt]');
    const upd = () => { const v = parseAmt(amtI.value); mo.textContent = isFinite(v) && v > 0 ? 'About ' + $0(v * 26 / 12) + ' a month.' : ''; };
    amtI.addEventListener('input', upd); upd();
    const s = sheet({ title: key ? 'Edit category' : 'New category', body: wrap });
    wrap.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const f = new FormData(wrap), n = String(f.get('n') || '').trim(), amt = r2(parseAmt(f.get('amt')) || 0);
      const err = wrap.querySelector('[data-err]');
      if (!n) { err.hidden = false; err.textContent = 'Give it a name.'; return; }
      if (amt < 0) { err.hidden = false; err.textContent = 'The budget can’t be negative.'; return; }
      let k = key;
      if (!k) { k = slug(n); let i = 2; while (m.cats[k]) k = slug(n) + '-' + i++; }
      const e = String(f.get('e') || '').trim() || emojiFor(n);
      const prev = m.cats[k];
      if (prev) Hub.store.update('budget/cats/' + k, { n, amt, e, by: Hub.me() || 'Someone', at: Date.now() });
      else Hub.store.set('budget/cats/' + k, { n, amt, e, o: m.catList.length, by: Hub.me() || 'Someone', at: Date.now() });
      Hub.sfx('tick'); Hub.toast(n + ': ' + $2(amt) + ' a pay'); s.close();
    });
    const del = wrap.querySelector('[data-del]');
    if (del) del.addEventListener('click', (ev) => confirmDelete(ev.currentTarget, () => { Hub.store.remove('budget/cats/' + key); Hub.toast('Category removed'); s.close(); }));
    setTimeout(() => (key ? amtI : wrap.querySelector('[name=n]')).focus(), 80);
  };

  const openPay = () => {
    const st = model().st;
    const wrap = document.createElement('form');
    wrap.className = 'hb-form';
    wrap.innerHTML = '<p class="hb-sub">What usually comes in each pay fortnight. Used for “left until payday” and for the Wishlist’s savings suggestion.</p>' +
      '<label class="hb-field"><span>Jacob’s pay</span><input class="hb-input" inputmode="decimal" name="j" value="' + (st.payJacob ? r2(st.payJacob) : '') + '" placeholder="0.00"></label>' +
      '<label class="hb-field"><span>Sienna’s contribution</span><input class="hb-input" inputmode="decimal" name="s" value="' + (st.paySienna != null ? r2(st.paySienna) : '') + '" placeholder="0.00"></label>' +
      '<p class="hb-note" data-tot></p><button class="hb-btn primary big" type="submit">Save</button>';
    const tot = wrap.querySelector('[data-tot]');
    const upd = () => { const j = parseAmt(wrap.elements.j.value) || 0, s2 = parseAmt(wrap.elements.s.value) || 0; tot.textContent = 'Together: ' + $2(j + s2) + ' a pay.'; };
    wrap.addEventListener('input', upd); upd();
    const s = sheet({ title: '💵 Expected income', body: wrap });
    wrap.addEventListener('submit', (ev) => {
      ev.preventDefault();
      Hub.store.update('budget/settings', { payJacob: r2(Math.max(0, parseAmt(wrap.elements.j.value) || 0)), paySienna: r2(Math.max(0, parseAmt(wrap.elements.s.value) || 0)) });
      Hub.sfx('tick'); Hub.toast('Expected income saved'); s.close();
    });
  };

  const openClear = () => {
    const wrap = document.createElement('div');
    wrap.className = 'hb-stack';
    wrap.innerHTML = '<p>This removes the budget, transactions and income from both phones. Download a backup first if you might want it back.</p><div class="hb-row big"><button class="hb-btn" data-x>Keep it</button><button class="hb-btn primary" data-imp-go>Clear budget</button></div>';
    const s = sheet({ title: 'Clear the budget?', body: wrap });
    wrap.querySelector('[data-x]').addEventListener('click', () => s.close());
    wrap.querySelector('[data-imp-go]').addEventListener('click', () => { Hub.store.remove('budget'); Hub.toast('Budget cleared'); s.close(); if (curPanel !== 'quick') go('quick', 'back'); });
  };

  const exportBackup = () => {
    const d = Hub.store.get('budget') || {};
    const out = { kind: 'teamdexter-budget', v: 1, exported: Hub.today(), from: 'Team Dexter HQ backup', cats: d.cats || {}, tx: d.tx || {}, inc: d.inc || {}, cov: d.cov || {}, settings: { payJacob: (d.settings || {}).payJacob, paySienna: (d.settings || {}).paySienna } };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(out)], { type: 'application/json' }));
    a.download = 'budget-backup-' + Hub.today() + '.json';
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    Hub.toast('Backup downloaded');
  };

  /* ---------- import: JSON export (budget-seed.json / backup) or the dashboard CSVs ---------- */
  const parseCSV = (text) => {
    const rows = []; let row = [], f = '', q = false;
    text = String(text).replace(/^﻿/, '');
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; }
      else if (ch === '"') q = true;
      else if (ch === ',') { row.push(f); f = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(f); f = ''; if (row.length > 1 || row[0]) rows.push(row); row = []; }
      else f += ch;
    }
    if (f || row.length) { row.push(f); rows.push(row); }
    const head = (rows.shift() || []).map((h) => h.trim().toLowerCase());
    return rows.map((r) => { const o = {}; head.forEach((h, i) => { o[h] = (r[i] || '').trim(); }); return o; });
  };
  const safeKey = (k) => String(k || '').replace(/[.$#[\]/]/g, '_').slice(0, 60);
  const TYPE_IN = { salary: 'salary', 'sienna contributions': 'sienna' };

  const readFiles = async (files) => {
    const pack = { cats: {}, tx: {}, inc: {}, cov: {}, settings: {}, names: [], from: '' };
    for (const file of files) {
      const text = await file.text();
      pack.names.push(file.name);
      if (/^\s*[{[]/.test(text)) {
        let j; try { j = JSON.parse(text); } catch (e) { throw new Error(file.name + ' isn’t a readable budget file.'); }
        if (!j || j.kind !== 'teamdexter-budget') throw new Error(file.name + ' isn’t a budget export from this app.');
        ['cats', 'tx', 'inc', 'cov'].forEach((k) => Object.entries(j[k] || {}).forEach(([id, v]) => { if (v && typeof v === 'object') pack[k][safeKey(id)] = v; }));
        Object.assign(pack.settings, j.settings || {});
        pack.from = j.from || pack.from; pack.exported = j.exported;
        continue;
      }
      const rows = parseCSV(text), h = rows[0] || {};
      if ('monthly_budget' in h) rows.forEach((r, i) => { const k = slug(r.category); pack.cats[k] = { n: r.category, amt: r2(parseAmt(r.monthly_budget) * 12 / 26), e: emojiFor(r.category), o: i }; });
      else if ('description' in h && 'category' in h && 'amount' in h) rows.forEach((r) => { if (!r.id || !r.date) return; const k = slug(r.category); const t = { d: r.date, n: r.description, c: k, a: r2(parseAmt(r.amount)) }; if (r.account) t.acc = r.account; if (r.merchant) t.m = r.merchant; pack.tx[safeKey(r.id)] = t; if (!pack.cats[k]) pack.cats['?' + k] = { n: r.category }; });
      else if ('source' in h && 'type' in h && 'amount' in h) rows.forEach((r) => { if (!r.id || !r.date) return; const t = TYPE_IN[String(r.type).toLowerCase()] || 'other'; const o = { d: r.date, n: r.source, t, a: r2(parseAmt(r.amount)) }; if (t === 'other') o.tn = r.type; if (r.person) o.p = r.person; pack.inc[safeKey(r.id)] = o; });
      else if ('month' in h && 'status' in h) rows.forEach((r) => { if (r.month) pack.cov[safeKey(r.month)] = { s: r.status, n: r.note || '' }; });
      else throw new Error(file.name + ' doesn’t look like one of the budget files.');
      pack.from = pack.from || 'Household budget dashboard';
    }
    // categories only seen in transactions (no budget file) → add with no budget
    Object.keys(pack.cats).filter((k) => k[0] === '?').forEach((k) => { const real = k.slice(1); const n = pack.cats[k].n; delete pack.cats[k]; if (!pack.cats[real]) pack.cats[real] = { n, amt: 0, e: emojiFor(n), o: 900 }; });
    return pack;
  };

  const same = (a, b) => ['d', 'n', 'c', 'a', 't', 'acc', 'm', 'tn', 'p'].every((k) => (a[k] == null ? '' : String(a[k])) === (b[k] == null ? '' : String(b[k])));
  const planMerge = (pack) => {
    const cur = Hub.store.get('budget') || {};
    const plan = { tx: { add: [], upd: [], same: 0, kept: 0 }, inc: { add: [], upd: [], same: 0, kept: 0 }, cats: { add: [], change: [] }, first: !cur.cats || !Object.keys(cur.cats).length };
    ['tx', 'inc'].forEach((k) => Object.entries(pack[k]).forEach(([id, v]) => {
      const old = (cur[k] || {})[id];
      if (!old) plan[k].add.push(id); else if (old.ed || old.by) plan[k].kept++; else if (same(old, v)) plan[k].same++; else plan[k].upd.push(id);
    }));
    Object.entries(pack.cats).forEach(([k, c]) => { const old = (cur.cats || {})[k]; if (!old) plan.cats.add.push(k); else if (r2(old.amt) !== r2(c.amt)) plan.cats.change.push(k); });
    const all = Object.values(pack.tx).map((t) => t.d).concat(Object.values(pack.inc).map((t) => t.d)).sort();
    plan.range = all.length ? [all[0], all[all.length - 1]] : null;
    plan.setPay = !(+((cur.settings || {}).payJacob) || +((cur.settings || {}).paySienna)) && (pack.settings.payJacob || pack.settings.paySienna);
    return plan;
  };
  const applyMerge = (pack, plan, useAmounts) => {
    const patch = {};
    ['tx', 'inc'].forEach((k) => plan[k].add.concat(plan[k].upd).forEach((id) => { patch[k + '/' + id] = pack[k][id]; }));
    plan.cats.add.forEach((k) => { patch['cats/' + k] = pack.cats[k]; });
    if (useAmounts || plan.first) plan.cats.change.forEach((k) => { patch['cats/' + k + '/amt'] = pack.cats[k].amt; });
    Object.entries(pack.cov).forEach(([k, v]) => { patch['cov/' + k] = v; });
    if (plan.setPay) { patch['settings/payJacob'] = r2(pack.settings.payJacob || 0); patch['settings/paySienna'] = r2(pack.settings.paySienna || 0); }
    patch['settings/importedAt'] = Date.now(); patch['settings/importedBy'] = Hub.me() || 'Someone'; patch['settings/from'] = pack.from || 'file';
    Hub.store.update('budget', patch);
  };

  const openImport = () => {
    const wrap = document.createElement('div');
    wrap.className = 'hb-stack bg-imp';
    wrap.innerHTML = '<p class="hb-sub">Choose your budget file (<b>budget-seed.json</b> or a backup), or the CSV files from the Household budget dashboard. Nothing leaves your phones.</p>' +
      '<label class="hb-btn primary big bg-file">Choose file…<input type="file" accept=".json,.csv,application/json,text/csv" multiple data-file></label>' +
      '<p class="hb-err" data-err hidden></p><div data-prev></div>';
    const s = sheet({ title: '📥 Import budget', body: wrap });
    const input = wrap.querySelector('[data-file]'), err = wrap.querySelector('[data-err]'), prev = wrap.querySelector('[data-prev]');
    input.addEventListener('change', async () => {
      err.hidden = true; prev.innerHTML = '';
      const files = Array.from(input.files || []);
      if (!files.length) return;
      let pack;
      try { pack = await readFiles(files); } catch (e) { err.hidden = false; err.textContent = e.message; return; }
      const plan = planMerge(pack);
      const nothing = !plan.tx.add.length && !plan.tx.upd.length && !plan.inc.add.length && !plan.inc.upd.length && !plan.cats.add.length && !plan.cats.change.length;
      const line = (e, t, s2) => '<li><span aria-hidden="true">' + e + '</span><span><b>' + t + '</b>' + (s2 ? '<span class="hb-note">' + s2 + '</span>' : '') + '</span></li>';
      const nTx = Object.keys(pack.tx).length, nInc = Object.keys(pack.inc).length, nCat = Object.keys(pack.cats).length;
      prev.innerHTML = '<div class="hb-card accent"><div class="hb-k">' + esc(pack.names.join(', ')) + '</div>' +
        (plan.range ? '<div class="hb-v sm">' + Hub.fmtDate(plan.range[0], { day: 'numeric', month: 'short' }) + ' – ' + Hub.fmtDate(plan.range[1], { day: 'numeric', month: 'short', year: 'numeric' }) + '</div>' : '') +
        '<ul class="bg-prev">' +
        (nTx ? line('🧾', plural(nTx, 'transaction'), plan.tx.add.length + ' new' + (plan.tx.upd.length ? ', ' + plan.tx.upd.length + ' updated' : '') + (plan.tx.same ? ', ' + plan.tx.same + ' already here' : '') + (plan.tx.kept ? ', ' + plan.tx.kept + ' you edited stay as they are' : '')) : '') +
        (nInc ? line('💵', plural(nInc, 'income entry').replace('entrys', 'entries'), plan.inc.add.length + ' new' + (plan.inc.upd.length ? ', ' + plan.inc.upd.length + ' updated' : '') + (plan.inc.same ? ', ' + plan.inc.same + ' already here' : '')) : '') +
        (nCat ? line('🗂️', plural(nCat, 'category').replace('categorys', 'categories'), plan.first ? 'Budgets per pay set from the file (monthly × 12 ÷ 26)' : (plan.cats.add.length ? plan.cats.add.length + ' new. ' : '') + (plan.cats.change.length ? plan.cats.change.length + ' budget amounts differ — yours are kept unless you tick below.' : 'Your budget amounts are kept.')) : '') +
        (plan.setPay ? line('💼', 'Expected income ' + $0((+pack.settings.payJacob || 0) + (+pack.settings.paySienna || 0)) + ' a pay', 'Jacob ' + $0(pack.settings.payJacob || 0) + ' · Sienna ' + $0(pack.settings.paySienna || 0) + ' — change it any time') : '') +
        '</ul>' +
        (!plan.first && plan.cats.change.length ? '<label class="bg-tick"><input type="checkbox" class="hb-check" data-use> Use the file’s budget amounts instead</label>' : '') +
        '<p class="hb-note">Things either of you added by hand are never touched.</p></div>' +
        (nothing ? '<p class="hb-note">Everything in this file is already here. 👍</p><button class="hb-btn big" data-done>Close</button>' : '<button class="hb-btn primary big" data-imp-go>Bring it in</button>');
      const goB = prev.querySelector('[data-imp-go]');
      if (goB) goB.addEventListener('click', () => {
        const use = prev.querySelector('[data-use]');
        applyMerge(pack, plan, use && use.checked);
        Hub.sfx('win'); Hub.toast(plan.first ? 'Budget imported 🎉' : 'Budget updated'); s.close();
      });
      const done = prev.querySelector('[data-done]'); if (done) done.addEventListener('click', () => s.close());
      setTimeout(() => prev.scrollIntoView({ block: 'nearest', behavior: reduce() ? 'auto' : 'smooth' }), 50);
    });
  };

  /* ======================================================================
     6. REGISTER
     ====================================================================== */
  Hub.budget = api; // available as soon as this file loads; numbers fill in once the store is read in init

  Hub.register({
    id: ID,
    title: 'Budgeting',
    emoji: '💰',
    accent: '#FFD36E',
    tagline: 'Import your budget to start',
    card(el) {
      const m = model();
      if (!m.hasData) { el.textContent = 'Import your budget to start'; return; }
      const left = api.left(), d = m.cur.daysLeft;
      const pay = d === 1 ? 'payday tomorrow' : 'payday in ' + d + ' days';
      el.innerHTML = left >= 0 ? '<b>' + $0(left) + ' left</b> · ' + pay : '<b>' + $0(-left) + ' over</b> this pay · ' + pay;
    },
    init() {
      Hub.store.on('budget', (v) => { data = v && typeof v === 'object' ? v : {}; changed(); });
      Hub.store.on('wishlist/settings/perFortnight', (v) => { const n = typeof v === 'object' && v ? +v.amount : +v; wish = isFinite(n) && n > 0 ? r2(n) : 0; changed(); });
    },
    render,
    onShow
  });
})();
