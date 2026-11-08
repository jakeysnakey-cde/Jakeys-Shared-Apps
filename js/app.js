(() => {
window.MP_BUDGET = 350;
window.MP_SLOTS = ['Breakfast', 'Lunch', 'Dinner'];
window.MP_STORES = [['aldi', 'ALDI'], ['woolworths', 'Woolworths'], ['coles', 'Coles']];
const SLOTS = window.MP_SLOTS, STORES = window.MP_STORES;
window.mp = { view: 'home', day: null, sel: null, plan: null, defaults: null, days: [], labels: {}, ticked: new Set(), ing: new Set(), hideTicked: false, today: null, flip: {}, toast: null, animated: new Set() };
window.mpDays = () => window.mp.days;
window.mpLabel = (k) => window.mp.labels[k] || k;
window.mpIsWorkday = (k) => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(String(window.mpLabel(k)).split(' ')[0]);
window.mpPrevDay = (k) => { const d = window.mp.days; const i = d.indexOf(k); return i > 0 ? d[i - 1] : null; };
window.mpMoney = (v) => (Number(v) < 0 ? '−$' : '$') + Math.abs(Number(v)).toFixed(2);
window.mpRecipes = () => { const d = dash.data('recipes'); return d.status === 'ok' ? d.data : null; };
window.mpById = () => { const r = window.mpRecipes(); return r ? Object.fromEntries(r.map((x) => [x.id, x])) : {}; };

window.mpEnsurePlan = () => {
  if (window.mp.plan) return true;
  const p = dash.data('plan');
  if (p.status !== 'ok') return false;
  window.mp.defaults = Object.fromEntries(p.data.map((r) => [r.slot_id, r.recipe]));
  window.mp.plan = { ...window.mp.defaults };
  const seen = [];
  p.data.forEach((r) => { if (!seen.includes(r.day)) { seen.push(r.day); window.mp.labels[r.day] = r.label; } });
  window.mp.days = seen;
  const n = new Date();
  const iso = n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0');
  const hit = p.data.find((r) => r.date === iso);
  window.mp.today = hit ? hit.day : null;
  if (!window.mp.day) window.mp.day = window.mp.today || seen[0];
  if (window.mpSetTabs) window.mpSetTabs();
  return true;
};

/* Resolve a slot to what's shown: leftovers borrow last night's dinner */
window.mpResolve = (day, slot) => {
  const byId = window.mpById();
  const id = window.mp.plan[day + '-' + slot];
  const r = byId[id];
  if (!r) return null;
  if (id === 'leftovers') {
    const prev = window.mpPrevDay(day);
    const src = prev ? byId[window.mp.plan[prev + '-Dinner']] : null;
    return { ...r, leftoverOf: src, name: src ? 'Leftover ' + src.name.charAt(0).toLowerCase() + src.name.slice(1) : r.name, emoji: src ? src.emoji : r.emoji, tone: src ? src.tone : r.tone };
  }
  return r;
};

/* The shopping basket for the current plan, priced at every store */
window.mpCompute = () => {
  const pr = dash.data('prices');
  const byId = window.mpById();
  if (pr.status !== 'ok' || !window.mpEnsurePlan() || !Object.keys(byId).length) return null;
  const need = {};
  const add = (uses, f) => String(uses || '').split(';').filter(Boolean).forEach((kv) => { const [k, v] = kv.split(':'); need[k] = (need[k] || 0) + Number(v) * f; });
  const days = window.mpDays();
  days.forEach((day) => SLOTS.forEach((slot) => {
    const id = window.mp.plan[day + '-' + slot];
    if (id === 'leftovers') { const prev = window.mpPrevDay(day); const src = prev ? byId[window.mp.plan[prev + '-Dinner']] : null; if (src) add(src.uses, 0.5); }
    else if (byId[id]) add(byId[id].uses, 1);
  }));
  if (byId.snacks) add(byId.snacks.uses, days.length / 7);
  const has = (v) => v !== null && v !== undefined && v !== '';
  const lines = pr.data.filter((p) => need[p.id] > 0).map((p) => {
    const packs = Math.max(1, Math.ceil(need[p.id] - 0.05));
    const line = { ...p, packs };
    STORES.forEach(([k]) => { line['t_' + k] = has(p[k]) ? Math.round(Number(p[k]) * packs * 100) / 100 : null; });
    return line;
  });
  const totals = STORES.map(([k, name]) => {
    const all = lines.filter((l) => l['t_' + k] !== null);
    const shared = lines.filter((l) => STORES.every(([s]) => l['t_' + s] !== null));
    return { key: k, store: name, total: Math.round(all.reduce((a, l) => a + l['t_' + k], 0) * 100) / 100, shared: Math.round(shared.reduce((a, l) => a + l['t_' + k], 0) * 100) / 100, missing: lines.length - all.length, compared: shared.length };
  });
  const complete = totals.filter((t) => t.missing === 0).sort((a, b) => a.total - b.total);
  const best = complete[0] || [...totals].sort((a, b) => a.shared - b.shared)[0];
  const others = totals.filter((t) => t !== best).sort((a, b) => a.shared - b.shared);
  return { lines, totals, best, next: others[0], saving: Math.round((others[0].shared - best.shared) * 100) / 100, left: Math.round((window.MP_BUDGET - best.total) * 100) / 100, perday: Math.round(best.total / Math.max(1, days.length) * 100) / 100 };
};

window.mpRedraw = () => ['stat', 'budget-bar', 'tonight', 'day-meals', 'recipe', 'week-grid', 'checklist', 'trolley-count', 'price-list', 'leaderboard', 'toast', 'plan-code'].forEach((n) => dash.draw(n));

/* Swap a meal: pick from the meal bank, preferring ones not already this week */
window.mpReroll = (day, slot) => {
  const rs = window.mpRecipes();
  if (!rs || !window.mpEnsurePlan()) return;
  const key = day + '-' + slot;
  const cur = window.mp.plan[key];
  const curR = rs.find((r) => r.id === cur);
  if (curR && curR.pinned) return;
  const before = window.mpCompute();
  const used = new Set(Object.values(window.mp.plan));
  const work = slot === 'Lunch' && window.mpIsWorkday(day);
  const pool = rs.filter((r) => r.slot === slot && r.id !== cur && !r.pinned && (!work || r.packable));
  // Prefer meals not already planned that keep the fortnight under budget
  const costWith = (id) => { window.mp.plan[key] = id; const c = window.mpCompute(); window.mp.plan[key] = cur; return c ? c.best.total : Infinity; };
  const scored = pool.map((r) => ({ r, fresh: !used.has(r.id), total: costWith(r.id) }));
  const cheapest = [...scored].sort((x, y) => x.total - y.total).slice(0, 3);
  const tiers = [scored.filter((x) => x.fresh && x.total <= window.MP_BUDGET), scored.filter((x) => x.total <= window.MP_BUDGET), cheapest];
  const tier = tiers.find((t) => t.length) || [];
  const choice = tier[Math.floor(Math.random() * tier.length)];
  const pick = choice && choice.r;
  if (!pick) return;
  if (window.mpAudio) window.mpAudio.sfxPlay('swap');
  window.mp.plan[key] = pick.id;
  window.mp.sel = key;
  window.mp.flip[key] = Date.now();
  const after = window.mpCompute();
  const shown = window.mpResolve(day, slot);
  window.mp.toast = { name: shown ? shown.name : pick.name, store: after.best.store, total: after.best.total, delta: Math.round((after.best.total - before.best.total) * 100) / 100, at: Date.now() };
  clearTimeout(window.mpToastTimer);
  window.mpToastTimer = setTimeout(() => { window.mp.toast = null; dash.draw('toast'); }, 4200);
  window.mpRedraw();
};

/* Views */
const greet = new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening';
document.querySelectorAll('[data-greet]').forEach((s) => { s.hidden = s.dataset.greet !== greet; });
const setTabs = () => document.querySelectorAll('.fq-day').forEach((t) => { t.setAttribute('aria-selected', String(t.dataset.day === window.mp.day)); t.classList.toggle('is-today', t.dataset.day === window.mp.today); });
window.mpSetTabs = setTabs;
setTabs();
const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
window.mpGo = (view) => {
  if (window.mp.view === view) return;
  const from = document.getElementById(window.mp.view), to = document.getElementById(view);
  const dir = view === 'menu' ? 'fwd' : 'back';
  window.mp.view = view;
  const A = window.mpAudio;
  if (A) { if (view === 'menu') { A.sfxPlay('enter'); A.startMusic(); } else { A.sfxPlay('close'); A.stopMusic(); } }
  const top = document.getElementById('top');
  if (top) top.scrollIntoView({ block: 'start', behavior: reduceMotion() ? 'auto' : 'smooth' });
  if (!from || !to) return;
  if (reduceMotion()) { from.hidden = true; to.hidden = false; }
  else {
    document.querySelectorAll('.fq-sweep').forEach((s) => { s.classList.remove('go', 'back'); void s.offsetWidth; s.classList.add(dir === 'fwd' ? 'go' : 'back'); });
    to.hidden = false;
    from.classList.add('fq-leave-' + dir);
    to.classList.add('fq-arrive-' + dir);
    clearTimeout(window.mpGoT);
    window.mpGoT = setTimeout(() => {
      from.hidden = true;
      from.classList.remove('fq-leave-fwd', 'fq-leave-back');
      to.classList.remove('fq-arrive-fwd', 'fq-arrive-back');
    }, 980);
  }
  dash.setLink(view);
  if (window.mpNavSync) window.mpNavSync();
  window.mpRedraw();
};
const cascade = () => document.querySelectorAll('.fq-meals').forEach((m) => { m.classList.remove('cascade'); void m.offsetWidth; m.classList.add('cascade'); clearTimeout(window.mpCascT); window.mpCascT = setTimeout(() => m.classList.remove('cascade'), 900); });
window.mpCascade = cascade;
document.querySelectorAll('.fq-day').forEach((t) => t.addEventListener('click', () => { window.mp.day = t.dataset.day; window.mp.sel = null; setTabs(); cascade(); window.mpRedraw(); }));
document.querySelectorAll('[data-reset-week]').forEach((b) => b.addEventListener('click', () => { if (window.mp.defaults) { window.mp.plan = { ...window.mp.defaults }; window.mp.toast = null; window.mpRedraw(); } }));
document.querySelectorAll('[data-hide-ticked]').forEach((b) => b.addEventListener('click', () => { window.mp.hideTicked = !window.mp.hideTicked; b.setAttribute('aria-pressed', String(window.mp.hideTicked)); dash.draw('checklist'); }));
document.querySelectorAll('[data-copy-plan]').forEach((b) => b.addEventListener('click', () => {
  if (!window.mp.plan) return;
  const code = window.mpDays().map((d) => SLOTS.map((s) => window.mp.plan[d + '-' + s]).join('.')).join('|');
  try { navigator.clipboard.writeText(code).then(() => b.classList.add('copied')); } catch (e) { /* the code stays visible to copy by hand */ }
}));

/* Windows: float in, drift out */
const openWin = (id) => {
  const d = document.getElementById(id);
  if (!d || d.open) return;
  d.classList.remove('closing');
  d.showModal();
  if (window.mpAudio) window.mpAudio.sfxPlay('open');
  dash.draw(id === 'win-week' ? 'week-grid' : id === 'win-trolley' ? 'checklist' : 'price-list');
};
const closeWin = (d) => {
  if (!d || !d.open || d.classList.contains('closing')) return;
  if (window.mpAudio) window.mpAudio.sfxPlay('close');
  if (reduceMotion()) { d.close(); return; }
  d.classList.add('closing');
  setTimeout(() => { d.close(); d.classList.remove('closing'); }, 330);
};
window.mpCloseWin = closeWin;
document.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openWin(b.dataset.open)));
document.querySelectorAll('dialog.fq-win').forEach((d) => {
  d.addEventListener('click', (ev) => { if (ev.target === d) closeWin(d); });
  d.addEventListener('cancel', (ev) => { ev.preventDefault(); closeWin(d); });
  d.querySelectorAll('[data-close]').forEach((x) => x.addEventListener('click', () => closeWin(d)));
});

/* Lofi player + soft sounds */
const A = window.mpAudio;
const syncPlayer = () => {
  document.querySelectorAll('.fq-player').forEach((p) => p.classList.toggle('playing', !!(A && A.playing)));
  document.querySelectorAll('[data-music]').forEach((b) => { b.setAttribute('aria-pressed', String(!!(A && A.musicOn))); b.querySelectorAll('[data-when]').forEach((s) => { s.hidden = (s.dataset.when === 'on') !== !!(A && A.musicOn); }); });
  document.querySelectorAll('[data-sfx]').forEach((b) => { b.setAttribute('aria-pressed', String(!!(A && A.sfxOn))); b.querySelectorAll('[data-when]').forEach((s) => { s.hidden = (s.dataset.when === 'on') !== !!(A && A.sfxOn); }); });
};
if (A) {
  A.onchange = syncPlayer;
  document.querySelectorAll('[data-music]').forEach((b) => b.addEventListener('click', () => { A.musicOn = !A.musicOn; if (A.musicOn && window.mp.view !== 'home') A.startMusic(); else A.stopMusic(); syncPlayer(); }));
  document.querySelectorAll('[data-sfx]').forEach((b) => b.addEventListener('click', () => { A.sfxOn = !A.sfxOn; syncPlayer(); if (A.sfxOn) A.sfxPlay('tap'); }));
  document.querySelectorAll('.fq').forEach((root) => {
    root.addEventListener('change', (ev) => { if (ev.target && ev.target.type === 'checkbox') A.sfxPlay('tick'); });
    root.addEventListener('click', (ev) => { if (ev.target.closest && ev.target.closest('.fq-meal-open, .fq-cell, .fq-day, .fq-left-link, .fq-btn')) A.sfxPlay('tap'); });
  });
}
syncPlayer();
window.mpNavSync = () => document.querySelectorAll('[data-nav]').forEach((b) => b.setAttribute('aria-current', b.dataset.nav === window.mp.view ? 'page' : 'false'));
window.mpNavSync();
})();
