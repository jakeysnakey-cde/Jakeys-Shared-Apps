/* Wishlist — wishes with prices, and how much to tuck away each pay fortnight to get there.
   Store (all under wishlist/):
     items/<id>                 { name, price, emoji, link, who, prio(1-3), target(YYYY-MM-DD|''), start, by, at, bought:{by,at}|null }
     deposits/<payKey>/<id>     dollars put away for that wish in that pay fortnight (negative = taken out)
     fortnights/<payKey>        { done, total, split:{id:dollars}, by, at }  — the "I've put it away" record for that pay
     settings/perFortnight      dollars per pay the household chose (the Budget menu shows it as "Wishlist savings")
     bonus/<id>                 { item, amount, points, from:'cleaning', by, at } — written by the Cleaning menu when points are cashed in
   items/<id>/celebrated marks a wish whose "fully saved" party has happened (so a bonus only celebrates once, on the first phone to see it). */
(() => {
  const ID = 'wishlist', ACCENT = '#FF8FB1';
  const WHO = ['Jacob', 'Sienna', 'Dexter', 'Family'];
  const PRIO = { 1: { label: 'Must-have', w: 3 }, 2: { label: 'Would love', w: 2 }, 3: { label: 'Someday', w: 1 } };
  const EMOJI = ['🎁', '🧸', '👟', '👗', '📱', '💻', '🎧', '🎮', '📚', '🚲', '🛋️', '🍳', '🌿', '🛏️', '👶', '✈️', '🏖️', '🎟️', '💍', '🚗', '📷', '⌚', '🎨', '🏕️'];
  const GUESS = [
    [/shoe|sneaker|boot|runner|nike|adidas/i, '👟'], [/dress|cloth|jacket|jumper|shirt|coat|hoodie/i, '👗'], [/phone|iphone|pixel/i, '📱'],
    [/laptop|macbook|computer|\bpc\b|ipad|tablet/i, '💻'], [/headphone|airpod|earbud|speaker/i, '🎧'], [/switch|playstation|ps5|xbox|game/i, '🎮'],
    [/book|kindle/i, '📚'], [/bike|bicycle|scooter|trike/i, '🚲'], [/couch|sofa|chair|table|desk|shelf/i, '🛋️'], [/bed|mattress|cot|pillow/i, '🛏️'],
    [/pram|stroller|baby|nappy|bottle|carrier/i, '👶'], [/toy|lego|teddy|plush|duplo/i, '🧸'], [/pan|pot|kitchen|blender|air ?fryer|thermomix|coffee/i, '🍳'],
    [/plant|garden/i, '🌿'], [/trip|holiday|flight|travel/i, '✈️'], [/beach|swim|pool/i, '🏖️'], [/ticket|concert|show|movie/i, '🎟️'],
    [/ring|necklace|jewel|earring/i, '💍'], [/car|tyre|tire/i, '🚗'], [/camera/i, '📷'], [/watch/i, '⌚'], [/paint|art|craft/i, '🎨'], [/tent|camp/i, '🏕️']
  ];

  /* ---------- state ---------- */
  let S = { items: {}, deposits: {}, fortnights: {}, settings: {}, bonus: {} };
  let ui = null;           // DOM refs once rendered
  let filter = 'all';
  let draft = null;        // amount being dragged on the slider (not saved yet)

  const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const me = () => Hub.me() || 'Jacob';
  const r2 = (n) => Math.round((+n || 0) * 100) / 100;
  const cents = (n) => Math.round((+n || 0) * 100);
  const money = (n) => (Math.abs(n - Math.round(n)) < 0.005 ? Hub.money0(n) : Hub.money(n));
  const parseMoney = (s) => { const v = parseFloat(String(s == null ? '' : s).replace(/[^0-9.]/g, '')); return isFinite(v) ? r2(v) : NaN; };
  const guessEmoji = (name) => { const hit = GUESS.find(([re]) => re.test(name || '')); return hit ? hit[1] : '🎁'; };
  const paydayOf = (idx) => Hub.addDays(Hub.parse(Hub.PAY_ANCHOR), idx * 14);
  const keyOf = (idx) => Hub.iso(paydayOf(idx));
  const shortDate = (d) => Hub.fmtDate(d, { weekday: 'short', day: 'numeric', month: 'short' });

  const savedOf = (id) => {
    const it = S.items[id]; let s = it ? +it.start || 0 : 0;
    Object.values(S.deposits || {}).forEach((f) => { if (f && f[id] != null) s += +f[id] || 0; });
    return r2(s + bonusTotal(id));
  };
  const bonusesOf = (id) => Object.entries(S.bonus || {}).filter(([, b]) => b && b.item === id && isFinite(+b.amount)).map(([bid, b]) => ({ bid, ...b, amount: +b.amount })).sort((a, b) => (a.at || 0) - (b.at || 0));
  const bonusTotal = (id) => r2(bonusesOf(id).reduce((t, b) => t + b.amount, 0));
  const itemsList = () => Object.entries(S.items || {}).map(([id, it]) => {
    const price = +it.price || 0, saved = savedOf(id);
    return { id, ...it, price, saved, rem: r2(Math.max(0, price - saved)), prio: PRIO[it.prio] ? +it.prio : 2 };
  });
  const active = () => itemsList().filter((x) => !x.bought);
  const bought = () => itemsList().filter((x) => x.bought).sort((a, b) => (b.bought.at || 0) - (a.bought.at || 0));

  /* ---------- savings maths ----------
     allocate(): split one pay's amount between wishes.
       1) wishes with a target date get what they need to stay on track (remaining ÷ pays left), earliest date first;
       2) the rest is shared by priority (Must-have 3 : Would love 2 : Someday 1), in whole dollars, never more than a wish still needs. */
  const allocate = (amount, wants, fIdx) => {
    const out = {}; wants.forEach((x) => { out[x.id] = 0; });
    let left = Math.max(0, cents(amount));
    const room = (x) => x.remC - out[x.id];
    wants.filter((x) => x.remC > 0 && x.tIdx != null).sort((a, b) => a.tIdx - b.tIdx || a.prio - b.prio).forEach((x) => {
      const pays = Math.max(1, x.tIdx - fIdx + 1);
      const need = Math.min(x.remC, Math.ceil(x.remC / pays / 100) * 100);
      const give = Math.min(need, left); out[x.id] += give; left -= give;
    });
    let open = wants.filter((x) => room(x) > 0);
    for (let guard = 0; left > 0 && open.length && guard < 50; guard++) {
      const W = open.reduce((s, x) => s + PRIO[x.prio].w, 0); let spent = 0;
      open.forEach((x) => { const give = Math.min(Math.floor((left * PRIO[x.prio].w) / W / 100) * 100, room(x)); out[x.id] += give; spent += give; });
      left -= spent; open = open.filter((x) => room(x) > 0);
      if (!spent) break;
    }
    // leftover dollars (and odd cents): hand out one dollar at a time, most-wanted first
    open = wants.filter((x) => room(x) > 0).sort((a, b) => a.prio - b.prio || (a.tIdx ?? 1e9) - (b.tIdx ?? 1e9));
    for (let guard = 0; left > 0 && open.length && guard < 100000; guard++) {
      const x = open[guard % open.length]; const give = Math.min(100, left, room(x));
      out[x.id] += give; left -= give; if (room(x) <= 0) open = open.filter((y) => y !== x);
    }
    Object.keys(out).forEach((k) => { out[k] = out[k] / 100; });
    return out;
  };
  const wantsOf = (list) => list.map((x) => ({ id: x.id, remC: cents(x.rem), prio: x.prio, tIdx: x.target ? Hub.fortnight(x.target).index : null }));

  const cur = () => Hub.fortnight();
  const doneRec = () => { const r = S.fortnights[cur().key]; return r && r.done ? r : null; };

  /* what the target dates alone ask for this pay */
  const targetNeed = (list) => {
    const f = cur(); let need = 0;
    wantsOf(list).forEach((x) => { if (x.remC > 0 && x.tIdx != null) need += Math.min(x.remC, Math.ceil(x.remC / Math.max(1, x.tIdx - f.index + 1) / 100) * 100); });
    return need / 100;
  };

  /* Forecast: repeat `amount` every pay (from this pay, or next pay if this one is done) until each wish is full. */
  const forecast = (amount, list) => {
    const f = cur(), start = doneRec() ? f.index + 1 : f.index;
    const wants = wantsOf(list); const eta = {};
    wants.forEach((x) => { if (x.remC <= 0) eta[x.id] = 'ready'; });
    if (amount > 0) {
      for (let k = 0; k < 260 && wants.some((x) => x.remC > 0); k++) {
        const idx = start + k, a = allocate(amount, wants, idx);
        wants.forEach((x) => { if (x.remC > 0) { x.remC -= cents(a[x.id]); if (x.remC <= 0) eta[x.id] = idx; } });
      }
    }
    return { start, eta };
  };

  const budget = () => {
    try {
      const b = Hub.budget;
      if (b && typeof b.ready === 'function' && b.ready()) { const free = +b.free(); if (isFinite(free)) return { ready: true, free: r2(free) }; }
    } catch (e) { /* budget menu not ready */ }
    return { ready: false, free: null };
  };

  const round5 = (n) => Math.round(n / 5) * 5;
  const totalRem = (list) => r2(list.reduce((s, x) => s + x.rem, 0));
  const chosen = () => { const v = S.settings && S.settings.perFortnight; return v == null || !isFinite(+v) ? null : Math.max(0, +v); };
  const suggestion = (list) => {
    const need = Math.ceil(targetNeed(list)), b = budget(), tr = Math.ceil(totalRem(list));
    const base = b.ready ? (b.free > 0 ? round5(b.free * 0.5) : 0) : 50;
    return Math.min(tr, Math.max(need, base));
  };
  /* The amount for this pay: what's being dragged, else what was chosen, else a suggestion. Never more than what's left to save. */
  const planAmount = (list) => { const v = draft != null ? draft : chosen() != null ? chosen() : suggestion(list); return Math.min(v, Math.ceil(totalRem(list))); };

  /* ---------- writes ---------- */
  const addDeposit = (id, dollars, key) => {
    key = key || cur().key;
    const prev = +(Hub.store.get('wishlist/deposits/' + key + '/' + id) || 0);
    const next = r2(prev + dollars);
    Hub.store.set('wishlist/deposits/' + key + '/' + id, Math.abs(next) < 0.005 ? null : next);
  };
  const setPerFortnight = (v) => { v = Math.max(0, Math.round(+v || 0)); if (chosen() !== v) Hub.store.set('wishlist/settings/perFortnight', v); };

  const putAway = () => {
    const list = active(), f = cur(), amt = planAmount(list);
    if (!(amt > 0) || doneRec()) return;
    const before = new Set(list.filter((x) => x.rem <= 0).map((x) => x.id));
    const split = allocate(amt, wantsOf(list), f.index);
    Object.keys(split).forEach((k) => { if (!(split[k] > 0)) delete split[k]; });
    const patch = {};
    Object.entries(split).forEach(([id, v]) => { patch[id] = r2((+(S.deposits[f.key] || {})[id] || 0) + v); });
    draft = null;
    setPerFortnight(chosen() != null ? chosen() : amt);
    Hub.store.update('wishlist/deposits/' + f.key, patch);
    Hub.store.set('wishlist/fortnights/' + f.key, { done: true, total: r2(Object.values(split).reduce((s, v) => s + v, 0)), split, by: me(), at: Date.now() });
    const finished = list.filter((x) => !before.has(x.id) && split[x.id] && split[x.id] >= x.rem - 0.005);
    if (finished.length) celebrate(finished[0]);
    else { Hub.sfx('win'); Hub.toast('Nice! ' + money(amt) + ' tucked away 🐷'); }
  };

  const undoPutAway = () => {
    const f = cur(), rec = doneRec(); if (!rec) return;
    const patch = {};
    Object.entries(rec.split || {}).forEach(([id, v]) => { const n = r2((+(S.deposits[f.key] || {})[id] || 0) - v); patch[id] = Math.abs(n) < 0.005 ? null : n; });
    if (Object.keys(patch).length) Hub.store.update('wishlist/deposits/' + f.key, patch);
    Hub.store.remove('wishlist/fortnights/' + f.key);
    Hub.sfx('swap'); Hub.toast('Undone — this pay is open again');
  };

  /* ---------- celebration ---------- */
  const confetti = () => {
    if (reduceMotion()) return;
    const host = document.querySelector('.fq') || document.body;
    const box = document.createElement('div'); box.className = 'wl-confetti'; box.setAttribute('aria-hidden', 'true');
    const cols = [ACCENT, '#FFD36E', '#8BD17C', '#7FB8FF', '#FFF4E6'];
    for (let i = 0; i < 44; i++) {
      const p = document.createElement('i');
      p.style.left = (Math.random() * 100) + '%';
      p.style.background = cols[i % cols.length];
      p.style.setProperty('--dx', (Math.random() * 120 - 60) + 'px');
      p.style.setProperty('--r', (Math.random() * 720 - 360) + 'deg');
      p.style.animationDelay = (Math.random() * 0.35) + 's';
      p.style.animationDuration = (1.4 + Math.random() * 0.8) + 's';
      if (i % 3 === 0) p.style.borderRadius = '50%';
      box.appendChild(p);
    }
    host.appendChild(box);
    setTimeout(() => box.remove(), 2800);
  };
  const celebrate = (it) => {
    if (it && it.id && S.items[it.id] && !S.items[it.id].celebrated) Hub.store.set('wishlist/items/' + it.id + '/celebrated', { by: me(), at: Date.now() });
    Hub.sfx('win'); confetti(); Hub.toast('🎉 ' + it.name + ' is fully saved — go get it!');
  };
  /* A cleaning bonus that fills a jar: party once, on whichever phone notices first. */
  const checkBonusWins = () => {
    active().forEach((x) => { if (x.rem <= 0 && !x.celebrated && bonusesOf(x.id).length) celebrate(x); });
  };

  /* ---------- small view bits ---------- */
  const jar = (pct, emoji, size, p0) => '<span class="wl-jar' + (size ? ' ' + size : '') + (pct >= 100 ? ' full' : '') + '" aria-hidden="true"><span class="wl-jar-lid"></span><span class="wl-jar-glass"><span class="wl-jar-fill" style="--p:' + Math.max(0, Math.min(100, pct)).toFixed(1) + '%' + (p0 ? ';--p0:' + p0 : '') + '"></span><span class="wl-jar-emo">' + Hub.esc(emoji || '🎁') + '</span></span></span>';
  const pctOf = (x) => (x.price > 0 ? Math.min(100, (x.saved / x.price) * 100) : 100);

  const etaText = (x, fc) => {
    if (x.rem <= 0) return { t: 'Ready to buy! 🎉', cls: 'good' };
    const e = fc.eta[x.id];
    if (e == null) return { t: (planAmount(active()) > 0 ? 'A long way off — a bit more each pay will help' : 'Choose an amount above to see when'), cls: '' };
    const f = cur();
    if (e === f.index && !doneRec()) return { t: 'Done after this pay! 🎉', cls: 'good' };
    const n = e - fc.start + 1;
    return { t: '≈ ' + shortDate(paydayOf(e)) + ' · ' + n + ' pay' + (n === 1 ? '' : 's'), cls: '' };
  };
  const targetChip = (x, fc) => {
    if (!x.target || x.rem <= 0) return '';
    const tIdx = Hub.fortnight(x.target).index, e = fc.eta[x.id];
    const ok = e != null && e !== 'ready' && e <= tIdx && x.target >= Hub.today();
    return '<span class="hb-chip ' + (ok ? 'good' : 'warn') + '">' + (ok ? 'On track for ' : 'Wanted by ') + Hub.esc(Hub.fmtDate(x.target, { day: 'numeric', month: 'short' })) + '</span>';
  };

  /* ---------- page ---------- */
  const render = (body) => {
    body.classList.add('wl');
    body.innerHTML =
      '<header class="wl-top"><div><h1 class="hb-h1">Wishlist</h1><p class="hb-sub">Little by little, every payday.</p></div>' +
      '<button class="hb-btn primary wl-add-top" data-add><span aria-hidden="true">＋</span> Add a wish</button></header>' +
      '<section class="wl-plan" data-plan aria-live="polite"></section>' +
      '<section class="wl-wishes" data-wishes></section>' +
      '<section class="wl-shelf" data-shelf></section>';
    ui = { body, plan: body.querySelector('[data-plan]'), wishes: body.querySelector('[data-wishes]'), shelf: body.querySelector('[data-shelf]') };
    body.querySelector('[data-add]').addEventListener('click', () => openForm());
    draw();
  };

  const draw = () => {
    if (!ui) return; drawPlan(); drawWishes(); drawShelf();
    if (!ui.plan.hidden) {
      const a = document.createElement('button'); a.className = 'wl-earn'; a.type = 'button';
      a.innerHTML = '<span aria-hidden="true">🧽</span> Earn more with cleaning points <span aria-hidden="true">›</span>';
      a.addEventListener('click', () => { Hub.sfx('tap'); Hub.go('cleaning'); });
      ui.plan.appendChild(a);
    }
  };

  /* "This pay" card */
  const drawPlan = () => {
    const el = ui.plan, list = active(), f = cur(), rec = doneRec(), b = budget();
    const payLine = '<div class="wl-plan-when"><span class="hb-k">This pay · ' + Hub.esc(f.label) + '</span><span class="hb-chip accent">Payday in ' + f.daysLeft + ' day' + (f.daysLeft === 1 ? '' : 's') + '</span></div>';
    if (!list.length) { el.innerHTML = ''; el.hidden = true; return; }
    el.hidden = false;
    if (rec) {
      const rows = Object.entries(rec.split || {}).filter(([id]) => S.items[id]).map(([id, v]) => '<li><span>' + Hub.esc(S.items[id].emoji || '🎁') + ' ' + Hub.esc(S.items[id].name) + '</span><b>' + money(v) + '</b></li>').join('');
      el.innerHTML = '<div class="hb-card accent wl-plan-card is-done">' + payLine +
        '<div class="wl-done-row"><span class="wl-tick" aria-hidden="true">✓</span><div><div class="wl-big">' + money(rec.total) + ' put away</div>' +
        '<p class="hb-note">' + Hub.esc(rec.by || '') + ' did it ' + Hub.esc(shortDate(new Date(rec.at || Date.now()))) + '. See you next payday, ' + Hub.esc(shortDate(f.nextPayday)) + ' 💛</p></div></div>' +
        (rows ? '<ul class="wl-split">' + rows + '</ul>' : '') +
        '<div class="hb-row"><button class="hb-btn ghost sm" data-undo>Undo</button></div></div>';
      el.querySelector('[data-undo]').addEventListener('click', undoPutAway);
      return;
    }
    const tr = Math.ceil(totalRem(list));
    if (tr <= 0) {
      el.innerHTML = '<div class="hb-card accent wl-plan-card">' + payLine + '<div class="wl-big">Everything’s saved! 🎉</div><p class="hb-note">Nothing to put away this pay — mark wishes as bought when you get them.</p></div>';
      return;
    }
    const need = Math.ceil(targetNeed(list));
    let hi = b.ready && b.free > 0 ? Math.max(b.free, need) : Math.max(300, need);
    hi = Math.min(tr, Math.ceil(Math.max(hi, planAmount(list), 5) / 5) * 5);
    el.innerHTML = '<div class="hb-card accent wl-plan-card">' + payLine +
      '<div class="wl-amt-row"><span class="wl-amt-lbl">Put away</span><label class="wl-amt"><span aria-hidden="true">$</span><input class="wl-amt-in" type="text" inputmode="decimal" enterkeyhint="done" aria-label="Amount to put away this pay" data-amt></label></div>' +
      '<div class="wl-slide-row"><button class="hb-btn icon wl-step" data-step="-5" aria-label="5 dollars less">−</button>' +
      '<input class="wl-range" type="range" min="0" step="5" max="' + hi + '" aria-label="Amount to put away this pay" data-range>' +
      '<button class="hb-btn icon wl-step" data-step="5" aria-label="5 dollars more">＋</button></div>' +
      '<p class="wl-budget" data-budget></p>' +
      '<ul class="wl-split" data-split></ul>' +
      '<button class="hb-btn primary big wl-done" data-done>Done — I’ve put it away</button></div>';
    const inp = el.querySelector('[data-amt]'), rng = el.querySelector('[data-range]');
    const sync = (v, fromInput) => {
      draft = v; const a = planAmount(list);
      if (!fromInput) inp.value = String(a);
      rng.value = String(Math.min(a, hi)); rng.style.setProperty('--fill', (hi ? (Math.min(a, hi) / hi) * 100 : 0) + '%');
      fillPlan(a, list, b, need);
    };
    sync(planAmount(list));
    draft = null;
    rng.addEventListener('input', () => { sync(+rng.value); });
    rng.addEventListener('change', () => { const v = +rng.value; draft = null; setPerFortnight(v); Hub.sfx('tick'); });
    inp.addEventListener('input', () => { const v = parseMoney(inp.value); sync(isFinite(v) ? Math.round(v) : 0, true); });
    inp.addEventListener('change', () => { const v = parseMoney(inp.value); draft = null; setPerFortnight(isFinite(v) ? v : 0); });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); });
    inp.addEventListener('focus', () => inp.select());
    el.querySelectorAll('[data-step]').forEach((s) => s.addEventListener('click', () => {
      const v = Math.max(0, Math.min(tr, round5(planAmount(list)) + +s.dataset.step)); draft = null; Hub.sfx('tap'); setPerFortnight(v);
    }));
    el.querySelector('[data-done]').addEventListener('click', putAway);
  };

  const fillPlan = (amt, list, b, need) => {
    const el = ui.plan, f = cur();
    const split = allocate(amt, wantsOf(list), f.index);
    const rows = list.filter((x) => split[x.id] > 0).sort((a, c) => split[c.id] - split[a.id])
      .map((x) => '<li><span>' + Hub.esc(x.emoji || '🎁') + ' ' + Hub.esc(x.name) + '</span><b>' + money(split[x.id]) + '</b></li>').join('');
    el.querySelector('[data-split]').innerHTML = rows || '<li class="wl-split-none">Slide up to start filling your jars.</li>';
    let note;
    if (b.ready) {
      if (b.free <= 0) note = '<span class="wl-dot warn"></span>The budget has no spare room this pay — it’s fine to skip. Your wishes will wait 💛';
      else if (amt > b.free + 0.005) note = '<span class="wl-dot warn"></span>That’s ' + money(amt - b.free) + ' more than the budget has spare (' + money(b.free) + '). Maybe ease off a little?';
      else note = '<span class="wl-dot good"></span>Budget has <b>' + money(b.free) + '</b> spare this pay' + (amt > 0 ? ' — ' + money(Math.max(0, b.free - amt)) + ' left after this.' : '.');
    } else note = '<span class="wl-dot"></span>No budget set up yet — just slide to what you can spare.';
    if (need > 0 && amt + 0.005 < need) note += '<br><span class="wl-dot warn"></span>Wishes with dates need about ' + money(need) + ' this pay to stay on track.';
    el.querySelector('[data-budget]').innerHTML = note;
    el.querySelector('[data-done]').disabled = !(amt > 0);
    // live ETAs on the cards while sliding
    if (ui.wishes) { const fc = forecast(amt, list); ui.wishes.querySelectorAll('[data-eta]').forEach((n) => { const x = list.find((y) => y.id === n.dataset.eta); if (x) n.textContent = etaText(x, fc).t; }); }
  };

  /* Wishes grid */
  const drawWishes = () => {
    const el = ui.wishes, list = active();
    if (!list.length) {
      el.innerHTML = '<div class="wl-empty"><div class="wl-empty-jar">' + jar(22, '✨', 'xl') + '</div><b class="hb-h2">What are you wishing for?</b><p class="hb-note">Add something you’d love — a pram, new runners, a weekend away. We’ll work out a little to put away each payday.</p><button class="hb-btn primary big" data-add-first>Add your first wish</button></div>';
      el.querySelector('[data-add-first]').addEventListener('click', () => openForm());
      return;
    }
    const prev = {}; el.querySelectorAll('[data-open]').forEach((n) => { const j = n.querySelector('.wl-jar-fill'); if (j) prev[n.dataset.open] = j.style.getPropertyValue('--p'); });
    const first = !el.dataset.drawn; el.dataset.drawn = '1';
    const amt = planAmount(list), fc = forecast(amt, list), f = cur(), rec = doneRec();
    const now = rec ? rec.split || {} : allocate(amt, wantsOf(list), f.index);
    const whos = WHO.filter((w) => list.some((x) => (x.who || 'Family') === w));
    if (filter !== 'all' && !whos.includes(filter)) filter = 'all';
    const shown = list.filter((x) => filter === 'all' || (x.who || 'Family') === filter).sort((a, b) =>
      (a.rem <= 0 ? 0 : 1) - (b.rem <= 0 ? 0 : 1) || a.prio - b.prio ||
      ((fc.eta[a.id] === 'ready' ? -1 : fc.eta[a.id] ?? 1e9) - (fc.eta[b.id] === 'ready' ? -1 : fc.eta[b.id] ?? 1e9)) || (a.at || 0) - (b.at || 0));
    const seg = whos.length > 1 ? '<div class="hb-seg wl-filter" role="group" aria-label="Whose wishes">' + ['all'].concat(whos).map((w) => '<button class="hb-seg-b" data-filter="' + w + '" aria-pressed="' + (filter === w) + '">' + (w === 'all' ? 'Everyone' : Hub.esc(w)) + '</button>').join('') + '</div>' : '';
    el.innerHTML = '<div class="wl-sec-head"><h2 class="hb-h2">Wishes <span class="wl-count">' + list.length + '</span></h2><span class="hb-note">' + money(list.reduce((s, x) => s + x.saved, 0)) + ' of ' + money(list.reduce((s, x) => s + x.price, 0)) + ' saved</span></div>' + seg +
      '<div class="wl-grid' + (first ? ' wl-anim' : '') + '">' + shown.map((x) => {
        const p = pctOf(x), e = etaText(x, fc), mine = now[x.id] > 0 && x.rem > 0;
        return '<button class="wl-card' + (x.rem <= 0 ? ' ready' : '') + '" data-open="' + x.id + '">' + jar(p, x.emoji, '', prev[x.id]) +
          '<span class="wl-card-main"><span class="wl-card-t">' + Hub.esc(x.name) + '</span>' +
          '<span class="wl-card-meta">for ' + Hub.esc(x.who || 'Family') + ' · ' + PRIO[x.prio].label + '</span>' +
          '<span class="wl-card-money"><b>' + money(x.saved) + '</b> of ' + money(x.price) + '</span>' +
          '<span class="hb-progress thin"><i style="width:' + p.toFixed(1) + '%"></i></span>' +
          '<span class="wl-card-eta ' + e.cls + '" data-eta="' + x.id + '">' + e.t + '</span>' +
          (bonusTotal(x.id) > 0 ? '<span class="wl-bonus-line">🧽 +' + money(bonusTotal(x.id)) + ' from cleaning</span>' : '') +
          ((mine || x.target) ? '<span class="wl-card-chips">' + (mine ? '<span class="hb-chip accent">' + (rec ? '✓ ' : '+') + money(now[x.id]) + ' this pay</span>' : '') + targetChip(x, fc) + '</span>' : '') +
          '</span></button>';
      }).join('') + '</div>' +
      '<button class="wl-add-tile" data-add-more><span aria-hidden="true">＋</span> Add another wish</button>';
    el.querySelectorAll('[data-filter]').forEach((bt) => bt.addEventListener('click', () => { filter = bt.dataset.filter; Hub.sfx('tap'); drawWishes(); }));
    el.querySelectorAll('[data-open]').forEach((bt) => bt.addEventListener('click', () => openItem(bt.dataset.open)));
    el.querySelector('[data-add-more]').addEventListener('click', () => openForm());
    if (!reduceMotion()) requestAnimationFrame(() => el.querySelectorAll('.wl-jar-fill').forEach((n) => n.classList.add('in')));
    else el.querySelectorAll('.wl-jar-fill').forEach((n) => n.classList.add('in'));
  };

  /* Trophy shelf */
  const drawShelf = () => {
    const el = ui.shelf, list = bought();
    if (!list.length) { el.innerHTML = ''; el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = '<div class="wl-sec-head"><h2 class="hb-h2">🏆 Got it!</h2><span class="hb-note">' + list.length + ' wish' + (list.length === 1 ? '' : 'es') + ' come true</span></div>' +
      '<div class="wl-shelf-row">' + list.map((x) => '<button class="wl-trophy" data-open="' + x.id + '"><span class="wl-trophy-e" aria-hidden="true">' + Hub.esc(x.emoji || '🎁') + '</span><span class="wl-trophy-t">' + Hub.esc(x.name) + '</span><span class="wl-trophy-d">' + Hub.esc(Hub.fmtDate(new Date(x.bought.at || Date.now()), { day: 'numeric', month: 'short' })) + '</span></button>').join('') + '</div>';
    el.querySelectorAll('[data-open]').forEach((bt) => bt.addEventListener('click', () => openItem(bt.dataset.open)));
  };

  const sheet = (title, body) => { const s = Hub.sheet({ title, body }); s.el.classList.add('wl-sheet'); s.el.style.setProperty('--accent', ACCENT); return s; };

  /* ---------- wish detail sheet ---------- */
  const openItem = (id) => {
    const wrap = document.createElement('div'); wrap.className = 'wl-detail';
    const s = sheet('', wrap);
    const h3 = s.el.querySelector('h3');
    const paint = () => {
      const x = itemsList().find((y) => y.id === id);
      if (!x) { s.close(); return; }
      h3.textContent = (x.emoji || '🎁') + ' ' + x.name;
      const p = pctOf(x), list = active(), fc = forecast(planAmount(list), list), e = etaText(x, fc);
      if (x.bought) {
        wrap.innerHTML = '<div class="wl-detail-top">' + jar(100, x.emoji, 'lg') + '<div><div class="wl-big">Got it! 🏆</div><p class="hb-note">Bought ' + Hub.esc(shortDate(new Date(x.bought.at || Date.now()))) + (x.bought.by ? ' · ticked off by ' + Hub.esc(x.bought.by) : '') + '</p><p class="hb-note">' + money(x.price) + ' · for ' + Hub.esc(x.who || 'Family') + '</p></div></div>' +
          '<div class="hb-row big"><button class="hb-btn" data-unbuy>Back to the wishlist</button></div>' +
          '<button class="hb-btn ghost danger" data-del>Remove from shelf</button>';
        wrap.querySelector('[data-unbuy]').addEventListener('click', () => { Hub.store.set('wishlist/items/' + id + '/bought', null); Hub.sfx('swap'); });
        wireDelete(wrap, id, s);
        return;
      }
      wrap.innerHTML = '<div class="wl-detail-top">' + jar(p, x.emoji, 'lg') +
        '<div><div class="wl-big">' + money(x.saved) + ' <span class="wl-of">of ' + money(x.price) + '</span></div>' +
        '<p class="' + (x.rem <= 0 ? 'hb-good' : 'hb-note') + '">' + (x.rem <= 0 ? 'Fully saved!' : money(x.rem) + ' to go') + '</p>' +
        '<p class="wl-detail-eta ' + e.cls + '">' + e.t + '</p>' + targetChip(x, fc) + '</div></div>' +
        '<div class="hb-progress"><i style="width:' + p.toFixed(1) + '%"></i></div>' +
        (x.rem <= 0 ? '<button class="hb-btn primary big" data-buy>🎉 We bought it!</button>' : '') +
        '<div class="wl-move" data-move hidden><label class="hb-field"><span data-move-lbl></span><input class="hb-input" type="text" inputmode="decimal" enterkeyhint="done" placeholder="$0" data-move-in></label><div class="hb-row big"><button class="hb-btn" data-move-cancel>Cancel</button><button class="hb-btn primary" data-move-ok>Save</button></div></div>' +
        '<div class="hb-row big" data-move-btns><button class="hb-btn" data-in>＋ Add money</button><button class="hb-btn" data-out' + (x.saved > 0 ? '' : ' disabled') + '>− Take out</button></div>' +
        (bonusesOf(id).length ? '<div class="wl-bonus"><div class="hb-k">🧽 From cleaning points</div><ul>' + bonusesOf(id).map((bn) => '<li><span>' + (bn.points ? Hub.esc(bn.points) + ' pts' : 'Points') + (bn.by ? ' · ' + Hub.esc(bn.by) : '') + (bn.at ? ' · ' + Hub.esc(Hub.fmtDate(new Date(bn.at), { day: 'numeric', month: 'short' })) : '') + '</span><b>+' + money(bn.amount) + '</b></li>').join('') + '</ul></div>' : '') +
        '<div class="wl-meta"><span>For <b>' + Hub.esc(x.who || 'Family') + '</b> · ' + PRIO[x.prio].label + '</span>' +
        '<span>Added by ' + Hub.esc(x.by || 'someone') + (x.at ? ' · ' + Hub.esc(shortDate(new Date(x.at))) : '') + '</span>' +
        (x.link ? '<a class="wl-link" href="' + Hub.esc(x.link) + '" target="_blank" rel="noopener">Open link ↗</a>' : '') + '</div>' +
        '<div class="hb-row big"><button class="hb-btn" data-edit>Edit</button>' + (x.rem > 0 ? '<button class="hb-btn" data-buy>Bought it</button>' : '') + '</div>' +
        '<button class="hb-btn ghost danger" data-del>Delete wish</button>';
      if (!reduceMotion()) requestAnimationFrame(() => wrap.querySelectorAll('.wl-jar-fill').forEach((n) => n.classList.add('in')));
      else wrap.querySelectorAll('.wl-jar-fill').forEach((n) => n.classList.add('in'));
      wrap.querySelectorAll('[data-buy]').forEach((b) => b.addEventListener('click', () => {
        Hub.store.set('wishlist/items/' + id + '/bought', { by: me(), at: Date.now() });
        Hub.sfx('win'); confetti(); Hub.toast('🏆 ' + x.name + ' is on the trophy shelf!'); s.close();
      }));
      wrap.querySelector('[data-edit]').addEventListener('click', () => { s.close(); setTimeout(() => openForm(id), reduceMotion() ? 0 : 320); });
      const move = wrap.querySelector('[data-move]'), btns = wrap.querySelector('[data-move-btns]'), mi = wrap.querySelector('[data-move-in]');
      let dir = 1;
      const ask = (d) => { dir = d; wrap.querySelector('[data-move-lbl]').textContent = d > 0 ? 'How much did you add? (birthday money, a bonus…)' : 'How much are you taking out?'; move.hidden = false; btns.hidden = true; mi.value = ''; mi.focus(); };
      wrap.querySelector('[data-in]').addEventListener('click', () => ask(1));
      wrap.querySelector('[data-out]').addEventListener('click', () => ask(-1));
      wrap.querySelector('[data-move-cancel]').addEventListener('click', () => { move.hidden = true; btns.hidden = false; });
      const ok = () => {
        let v = parseMoney(mi.value); if (!(v > 0)) { mi.focus(); return; }
        if (dir < 0) v = Math.min(v, x.saved);
        const wasFull = x.rem <= 0;
        addDeposit(id, dir * v);
        if (dir > 0 && !wasFull && v >= x.rem - 0.005) celebrate(x); else { Hub.sfx('tick'); Hub.toast(dir > 0 ? money(v) + ' added to ' + x.name : money(v) + ' taken out'); }
      };
      wrap.querySelector('[data-move-ok]').addEventListener('click', ok);
      mi.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') ok(); });
      wireDelete(wrap, id, s);
    };
    paint();
    const off = Hub.store.on('wishlist', () => { if (!wrap.isConnected) { off(); return; } paint(); }, { now: false });
  };

  const wireDelete = (wrap, id, s) => {
    const del = wrap.querySelector('[data-del]'); let armed = false;
    del.addEventListener('click', () => {
      if (!armed) { armed = true; del.textContent = 'Tap again to delete'; setTimeout(() => { if (del.isConnected) { armed = false; del.textContent = 'Delete wish'; } }, 3000); return; }
      const it = S.items[id]; const patch = {};
      Object.keys(S.deposits || {}).forEach((k) => { if (S.deposits[k] && S.deposits[k][id] != null) patch[k + '/' + id] = null; });
      s.close();
      if (Object.keys(patch).length) Hub.store.update('wishlist/deposits', patch);
      const bp = {}; bonusesOf(id).forEach((bn) => { bp[bn.bid] = null; });
      if (Object.keys(bp).length) Hub.store.update('wishlist/bonus', bp);
      Hub.store.remove('wishlist/items/' + id);
      Hub.toast((it && it.name ? it.name : 'Wish') + ' removed');
    });
  };

  /* ---------- add / edit sheet ---------- */
  const openForm = (id) => {
    const it = id ? S.items[id] : null, saved = id ? savedOf(id) : 0;
    let emoji = it ? it.emoji : '', who = it ? it.who || 'Family' : (WHO.includes(me()) ? me() : 'Family'), prio = it ? +it.prio || 2 : 2, picked = !!it;
    const f = document.createElement('form'); f.className = 'hb-form wl-form'; f.noValidate = true;
    f.innerHTML =
      '<div class="wl-form-top"><button type="button" class="wl-emo-btn" data-emo-cur aria-label="Pick an icon"></button>' +
      '<label class="hb-field wl-grow"><span>What’s the wish?</span><input class="hb-input" name="name" maxlength="60" autocomplete="off" enterkeyhint="next" placeholder="e.g. New runners"></label></div>' +
      '<label class="hb-field"><span>Price</span><span class="wl-price"><span aria-hidden="true">$</span><input class="hb-input" name="price" type="text" inputmode="decimal" enterkeyhint="done" placeholder="0"></span></label>' +
      '<div class="wl-emos" data-emos role="group" aria-label="Icon" hidden>' + EMOJI.map((e) => '<button type="button" class="wl-emo" data-e="' + e + '">' + e + '</button>').join('') + '</div>' +
      '<div class="hb-field"><span>Whose wish?</span><div class="hb-seg" data-who>' + WHO.map((w) => '<button type="button" class="hb-seg-b" data-w="' + w + '">' + w + '</button>').join('') + '</div></div>' +
      '<details class="wl-more"' + (it && (it.target || it.link || +it.prio !== 2 || it.start) ? ' open' : '') + '><summary>More options <span class="hb-note">(priority, date, link)</span></summary><div class="hb-form">' +
      '<div class="hb-field"><span>How much do you want it?</span><div class="hb-seg" data-prio>' + [1, 2, 3].map((p) => '<button type="button" class="hb-seg-b" data-p="' + p + '">' + PRIO[p].label + '</button>').join('') + '</div></div>' +
      '<label class="hb-field"><span>Want it by (optional)</span><input class="hb-input" name="target" type="date" min="' + Hub.today() + '"></label>' +
      '<label class="hb-field"><span>Link (optional)</span><input class="hb-input" name="link" type="url" inputmode="url" autocapitalize="off" autocomplete="off" spellcheck="false" placeholder="https://"></label>' +
      '<label class="hb-field"><span>' + (it ? 'Saved so far' : 'Already saved (optional)') + '</span><span class="wl-price"><span aria-hidden="true">$</span><input class="hb-input" name="saved" type="text" inputmode="decimal" placeholder="0"></span></label>' +
      '</div></details>' +
      '<p class="hb-err" data-err hidden></p>' +
      '<button class="hb-btn primary big" type="submit">' + (it ? 'Save changes' : 'Add to wishlist') + '</button>';
    const $ = (n) => f.querySelector('[name="' + n + '"]');
    if (it) { $('name').value = it.name || ''; $('price').value = it.price != null ? String(it.price) : ''; $('target').value = it.target || ''; $('link').value = it.link || ''; $('saved').value = saved ? String(saved) : ''; }
    const curBtn = f.querySelector('[data-emo-cur]'), emos = f.querySelector('[data-emos]');
    const paintEmo = () => { const e = emoji || guessEmoji($('name').value); curBtn.textContent = e; emos.querySelectorAll('[data-e]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.e === e))); };
    const paintSeg = () => {
      f.querySelectorAll('[data-w]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.w === who)));
      f.querySelectorAll('[data-p]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.p === prio)));
    };
    paintEmo(); paintSeg();
    curBtn.addEventListener('click', () => { emos.hidden = !emos.hidden; Hub.sfx('tap'); });
    emos.addEventListener('click', (ev) => { const b = ev.target.closest('[data-e]'); if (!b) return; emoji = b.dataset.e; picked = true; paintEmo(); emos.hidden = true; Hub.sfx('tap'); });
    $('name').addEventListener('input', () => { if (!picked) { emoji = ''; paintEmo(); } });
    $('name').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); $('price').focus(); } });
    f.querySelectorAll('[data-w]').forEach((b) => b.addEventListener('click', () => { who = b.dataset.w; paintSeg(); }));
    f.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => { prio = +b.dataset.p; paintSeg(); }));
    const s = sheet(it ? 'Edit wish' : '🎁 New wish', f);
    f.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const err = f.querySelector('[data-err]');
      const name = $('name').value.trim(), price = parseMoney($('price').value);
      if (!name) { err.hidden = false; err.textContent = 'Give your wish a name.'; $('name').focus(); return; }
      if (!(price > 0)) { err.hidden = false; err.textContent = 'Add a price (a rough guess is fine).'; $('price').focus(); return; }
      let link = $('link').value.trim(); if (link && !/^https?:\/\//i.test(link)) link = 'https://' + link;
      const want = parseMoney($('saved').value), wantSaved = isFinite(want) ? want : 0;
      const nid = id || Hub.store.id('w_');
      const deps = r2(savedOf(nid) - (it ? +it.start || 0 : 0));
      const obj = { name, price, emoji: emoji || guessEmoji(name), who, prio, target: $('target').value || '', link, start: r2(wantSaved - deps),
        by: it ? it.by || me() : me(), at: it ? it.at || Date.now() : Date.now(), bought: it ? it.bought || null : null };
      if (it) { obj.editedBy = me(); if (it.celebrated && wantSaved >= price) obj.celebrated = it.celebrated; }
      const wasFull = it && savedOf(id) >= (+it.price || 0);
      Hub.store.set('wishlist/items/' + nid, obj);
      s.close();
      if (!it) { Hub.sfx('win'); Hub.toast(obj.emoji + ' ' + name + ' added — happy saving!'); }
      else if (!wasFull && wantSaved >= price) celebrate({ ...obj, id: nid });
      else Hub.toast('Saved');
    });
    if (!it) setTimeout(() => { try { $('name').focus(); } catch (e) { /* ignore */ } }, 350);
  };

  /* ---------- home card ---------- */
  const card = (el) => {
    const list = active();
    if (!list.length) { el.innerHTML = bought().length ? 'All wishes came true 🏆 · <b>add a new one</b>' : '<b>Add your first wish</b> 🎁'; return; }
    const n = list.length + ' wish' + (list.length === 1 ? '' : 'es'), rec = doneRec();
    if (rec) { el.innerHTML = '<b>' + money(rec.total) + ' put away</b> this pay ✓ · ' + n; return; }
    const ready = list.filter((x) => x.rem <= 0).length;
    if (ready === list.length) { el.innerHTML = '<b>Ready to buy!</b> 🎉 · ' + n; return; }
    const a = planAmount(list);
    el.innerHTML = a > 0 ? 'Put away <b>' + money(a) + '</b> this pay · ' + n : n + ' · <b>choose an amount</b> to save';
  };

  Hub.register({
    id: ID, title: 'Wishlist', emoji: '🎁', accent: ACCENT,
    tagline: 'Things we’re saving up for',
    card,
    render,
    onShow() { draft = null; draw(); },
    init() {
      if (!document.querySelector('link[href*="mod-wishlist.css"]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'css/mod-wishlist.css'; document.head.appendChild(l); }
      Hub.store.on('wishlist', (v) => {
        v = v || {};
        S = { items: v.items || {}, deposits: v.deposits || {}, fortnights: v.fortnights || {}, settings: v.settings || {}, bonus: v.bonus || {} };
        draw(); Hub.refreshCard(ID); checkBonusWins();
      });
      // the budget's spare room changes what we suggest
      Hub.store.on('budget', () => { draw(); Hub.refreshCard(ID); }, { now: false });
    }
  });

  // for tests
  Hub._wishlist = { allocate, forecast, wantsOf, active, planAmount, suggestion };
})();
