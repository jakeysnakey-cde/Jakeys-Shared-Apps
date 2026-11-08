(() => {
const SLOTS = window.MP_SLOTS;
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined && text !== null) e.textContent = text; return e; };
const plate = (r, size) => { const p = el('div', 'fq-plate ' + size, r.emoji); p.style.background = r.tone; p.setAttribute('aria-hidden', 'true'); return p; };
const svgIcon = (d) => { const ns = 'http://www.w3.org/2000/svg'; const s = document.createElementNS(ns, 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2.4'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true'); d.forEach((x) => { const p = document.createElementNS(ns, 'path'); p.setAttribute('d', x); s.append(p); }); return s; };
const PIN = ['M12 17v5', 'M9 3h6l-1 6 3 3v2H7v-2l3-3z'];
const ROLL = ['M20 11a8 8 0 0 0-14.6-4.5L4 8', 'M4 3v5h5', 'M4 13a8 8 0 0 0 14.6 4.5L20 16', 'M20 21v-5h-5'];
const none = (e) => { e.replaceChildren(); e.textContent = '—'; };

dash.draw('stat', (e) => {
  const c = window.mpCompute();
  if (!c) return none(e);
  const k = e.dataset.stat;
  const val = { total: c.best.total, left: c.left, saving: c.saving, perday: c.perday }[k];
  if (k === 'store') { e.textContent = c.best.store; return; }
  if (val === undefined) return none(e);
  if (k === 'left') e.classList.toggle('over', val < 0);
  const key = k + (e.closest('#home') ? 'h' : 'm');
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (window.mp.animated.has(key) || reduce) { e.textContent = window.mpMoney(val); return; }
  window.mp.animated.add(key);
  const t0 = performance.now(), dur = 1100;
  const step = (t) => { const p = Math.min(1, (t - t0) / dur); const ease = 1 - Math.pow(1 - p, 3); e.textContent = window.mpMoney(val * ease); if (p < 1) requestAnimationFrame(step); else e.textContent = window.mpMoney(val); };
  requestAnimationFrame(step);
});

dash.draw('budget-bar', (e) => {
  const c = window.mpCompute();
  e.replaceChildren();
  if (!c) return;
  const i = el('i'); i.style.width = '0%'; e.append(i);
  requestAnimationFrame(() => requestAnimationFrame(() => { i.style.width = Math.max(0, Math.min(100, c.left / window.MP_BUDGET * 100)) + '%'; }));
});

dash.draw('tonight', (e) => {
  if (!window.mpRecipes() || !window.mpEnsurePlan()) return none(e);
  const din = window.mpResolve(window.mp.today || window.mp.day, 'Dinner');
  if (!din) return none(e);
  const row = el('div', 'fq-tn');
  const txt = el('div');
  txt.append(el('div', 'fq-tn-name', din.name), el('div', 'fq-tn-meta', '⏱ ' + din.mins + ' min · ready for 2 adults and Dexter'));
  row.append(plate(din, 'xl'), txt);
  const chips = el('div', 'fq-today');
  ['Breakfast', 'Lunch'].forEach((s) => { const r = window.mpResolve(window.mp.today || window.mp.day, s); if (r) { const c = el('span', 'fq-chip'); c.append(plate(r, 'sm'), el('span', null, s + ': ' + r.name)); chips.append(c); } });
  e.replaceChildren(row, chips);
});

dash.draw('tonight-name', (e) => {
  if (!window.mpRecipes() || !window.mpEnsurePlan()) return;
  const din = window.mpResolve(window.mp.today || window.mp.day, 'Dinner');
  e.textContent = din ? din.name : '—';
});

dash.draw('day-meals', (e) => {
  if (!window.mpRecipes() || !window.mpEnsurePlan()) return none(e);
  const day = window.mp.day;
  if (!window.mp.sel || !window.mp.sel.startsWith(day)) window.mp.sel = day + '-Dinner';
  e.replaceChildren(...SLOTS.map((slot) => {
    const key = day + '-' + slot;
    const r = window.mpResolve(day, slot);
    const card = el('div', 'fq-meal' + (window.mp.sel === key ? ' on' : '') + (Date.now() - (window.mp.flip[key] || 0) < 700 ? ' flip' : ''));
    if (!r) return card;
    const open = el('button', 'fq-meal-open');
    const txt = el('div');
    txt.append(el('div', 'fq-meal-slot', slot + (day === window.mp.today ? ' · today' : '') + (r.pinned ? ' · every week' : '') + (slot === 'Lunch' && window.mpIsWorkday(day) ? ' · 🎒 office lunch' : '')), el('div', 'fq-meal-name', r.name), el('div', 'fq-meal-time', '⏱ ' + r.mins + ' min'));
    open.append(plate(r, 'md'), txt);
    open.addEventListener('click', () => { window.mp.sel = key; dash.draw('day-meals'); dash.draw('recipe'); });
    if (r.pinned) {
      const pin = el('span', 'fq-pin');
      pin.title = 'Always on the menu';
      pin.setAttribute('aria-label', 'Always on the menu');
      pin.append(svgIcon(PIN));
      card.append(open, pin);
    } else {
      const roll = el('button', 'fq-roll');
      roll.setAttribute('aria-label', 'Swap ' + slot.toLowerCase() + ' for another meal');
      roll.title = 'Swap for another meal';
      roll.append(svgIcon(ROLL));
      roll.addEventListener('click', () => window.mpReroll(day, slot));
      card.append(open, roll);
    }
    return card;
  }));
});

dash.draw('recipe', (e) => {
  if (!window.mpRecipes() || !window.mpEnsurePlan()) return none(e);
  const [day, slot] = (window.mp.sel || (window.mp.day + '-Dinner')).split('-');
  const r = window.mpResolve(day, slot);
  if (!r) return none(e);
  e.classList.toggle('flip', Date.now() - (window.mp.flip[day + '-' + slot] || 0) < 700);
  const head = el('div', 'fq-rhead');
  const info = el('div');
  const badges = el('div', 'fq-badges');
  badges.append(el('span', 'fq-badge', window.mpLabel(day) + ' ' + slot.toLowerCase()), el('span', 'fq-badge', '⏱ ' + r.mins + ' min'), el('span', 'fq-badge', '👨‍👩‍👦 2 adults + Dexter'));
  if (r.packable) badges.append(el('span', 'fq-badge fq-badge-pack', '🎒 Office-friendly'));
  info.append(el('h3', 'fq-rname', r.name), badges);
  head.append(plate(r, 'lg'), info);
  const body = el('div', 'fq-rbody');
  const ingBox = el('div'); ingBox.append(el('h4', 'fq-h4', 'Ingredients'));
  const ul = el('ul', 'fq-ul');
  const src = r.leftoverOf || r;
  const ingList = r.leftoverOf ? ['Leftovers of last night\'s ' + r.leftoverOf.name.toLowerCase()] : String(r.ingredients).split('|');
  ingList.forEach((t, i) => {
    const k = src.id + ':' + day + slot + ':' + i;
    const li = el('li'); const lab = el('label', 'fq-chk' + (window.mp.ing.has(k) ? ' done' : ''));
    const cb = el('input'); cb.type = 'checkbox'; cb.checked = window.mp.ing.has(k);
    cb.addEventListener('change', () => { cb.checked ? window.mp.ing.add(k) : window.mp.ing.delete(k); lab.classList.toggle('done', cb.checked); });
    lab.append(cb, el('span', null, t)); li.append(lab); ul.append(li);
  });
  ingBox.append(ul);
  const mBox = el('div'); mBox.append(el('h4', 'fq-h4', 'Method'));
  const ol = el('ol', 'fq-ol');
  String(r.method).split('|').forEach((t) => ol.append(el('li', null, t)));
  mBox.append(ol);
  body.append(ingBox, mBox);
  const dex = el('div', 'fq-dex'); const tx = el('div');
  tx.append(el('b', null, 'For Dexter: '), document.createTextNode(r.dexter));
  dex.append(el('span', 'em', '👶'), tx);
  const out = [head, body, dex];
  if (r.packable && r.pack) { const pk = el('div', 'fq-pack'); const pt = el('div'); pt.append(el('b', null, 'Packing for work: '), document.createTextNode(r.pack)); pk.append(el('span', 'em', '🎒'), pt); out.push(pk); }
  if (r.leftoverOf) {
    const prev = window.mpPrevDay(day);
    const b = el('button', 'fq-left-link', 'See last night\'s recipe');
    b.addEventListener('click', () => { window.mp.day = prev; window.mp.sel = prev + '-Dinner'; window.mpSetTabs(); window.mpRedraw(); });
    out.push(b);
  }
  e.replaceChildren(...out);
});

dash.draw('week-grid', (e) => {
  if (!window.mpRecipes() || !window.mpEnsurePlan()) return none(e);
  const days = window.mpDays();
  const weeks = [];
  for (let w = 0; w < days.length; w += 7) weeks.push(days.slice(w, w + 7));
  if (window.mp.gridWeek === undefined) {
    const anchor = window.mp.today || window.mp.day || days[0];
    window.mp.gridWeek = Math.max(0, weeks.findIndex((wk) => wk.includes(anchor)));
  }
  const wi = Math.min(window.mp.gridWeek, weeks.length - 1);
  const todayIdx = days.indexOf(window.mp.today);
  const open = (day, slot) => {
    const win = document.getElementById('win-week'); if (win && win.open && window.mpCloseWin) window.mpCloseWin(win);
    window.mp.day = day; window.mp.sel = day + '-' + slot; window.mpSetTabs();
    if (window.mp.view !== 'menu') window.mpGo('menu');
    window.mpRedraw();
    setTimeout(() => { const rc = document.getElementById('recipe'); if (rc) rc.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 360);
  };

  // Week switcher
  const seg = el('div', 'fq-seg');
  seg.setAttribute('role', 'tablist');
  weeks.forEach((wk, k) => {
    const first = window.mpLabel(wk[0]), last = window.mpLabel(wk[wk.length - 1]);
    const b = el('button', 'fq-seg-b');
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(k === wi));
    b.append(el('span', 'fq-seg-t', 'Week ' + (k + 1)), el('span', 'fq-seg-s', first.split(' ')[1] + '–' + last.split(' ')[1] + ' Nov'));
    b.addEventListener('click', () => { window.mp.gridWeek = k; dash.draw('week-grid'); });
    seg.append(b);
  });

  // One row per day: dinner first, breakfast and lunch underneath
  const list = el('ol', 'fq-agenda');
  weeks[wi].forEach((day) => {
    const idx = days.indexOf(day);
    const li = el('li', 'fq-ag' + (day === window.mp.today ? ' is-today' : '') + (todayIdx >= 0 && idx < todayIdx ? ' is-past' : ''));
    const [wd, dn] = window.mpLabel(day).split(' ');
    const date = el('div', 'fq-ag-date');
    date.append(el('span', 'wd', wd), el('span', 'dn', dn));
    if (day === window.mp.today) date.append(el('span', 'tag', 'Today'));
    const body = el('div', 'fq-ag-body');
    const din = window.mpResolve(day, 'Dinner');
    if (din) {
      const b = el('button', 'fq-ag-dinner');
      const t = el('span', 'txt');
      t.append(el('span', 'k', 'Dinner' + (din.pinned ? ' · 📌 every week' : '')), el('span', 'n', din.name));
      b.append(plate(din, 'md'), t, el('span', 'mins', din.mins + ' min'));
      b.addEventListener('click', () => open(day, 'Dinner'));
      body.append(b);
    }
    const small = el('div', 'fq-ag-small');
    ['Breakfast', 'Lunch'].forEach((slot) => {
      const r = window.mpResolve(day, slot);
      if (!r) return;
      const c = el('button', 'fq-ag-chip' + (r.leftoverOf ? ' left' : ''));
      const t = el('span', 'txt');
      t.append(el('span', 'k', slot + (slot === 'Lunch' && window.mpIsWorkday(day) && r.packable ? ' · 🎒' : '')), el('span', 'n', r.leftoverOf ? 'Leftovers from last night' : r.name));
      c.append(plate(r, 'sm'), t);
      c.addEventListener('click', () => open(day, slot));
      small.append(c);
    });
    body.append(small);
    li.append(date, body);
    list.append(li);
  });
  e.replaceChildren(seg, list);
});
})();
