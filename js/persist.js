/* Meals: meal swaps and trolley ticks are shared household data (Hub.store, synced live between phones).
   Sound settings and "hide ticked" stay on this phone. */
(() => {
  const OLD = 'family-feast-v1', LOCAL = 'family-feast-local-v2';
  const planKey = () => { const p = dash.data('plan').data; return p.length ? p[0].date : ''; };
  const readLocal = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const saveLocal = () => {
    const A = window.mpAudio;
    try { localStorage.setItem(LOCAL, JSON.stringify({ hideTicked: !!(window.mp && window.mp.hideTicked), musicOn: A ? A.musicOn : true, sfxOn: A ? A.sfxOn : true })); } catch (e) { /* private mode */ }
  };

  let base = '', synced = { swaps: {}, ticked: {} }, applying = false;
  const current = () => {
    const mp = window.mp, swaps = {}, ticked = {};
    if (mp.plan && mp.defaults) Object.keys(mp.plan).forEach((s) => { if (mp.plan[s] !== mp.defaults[s]) swaps[s] = mp.plan[s]; });
    mp.ticked.forEach((t) => { ticked[t] = true; });
    return { swaps, ticked };
  };
  const push = () => {
    if (!base || applying || !window.Hub || !Hub.store) return;
    const cur = current();
    ['swaps', 'ticked'].forEach((kind) => {
      const keys = new Set([...Object.keys(cur[kind]), ...Object.keys(synced[kind])]);
      keys.forEach((k) => { if (cur[kind][k] !== synced[kind][k]) Hub.store.set(base + '/' + kind + '/' + k, cur[kind][k] == null ? null : cur[kind][k]); });
    });
    synced = cur;
  };

  const redraw = window.mpRedraw;
  const apply = (remote) => {
    const mp = window.mp;
    if (!mp.defaults) return;
    remote = remote || {};
    const byId = Object.fromEntries(dash.data('recipes').data.map((r) => [r.id, r]));
    const plan = { ...mp.defaults };
    Object.entries(remote.swaps || {}).forEach(([slot, id]) => { const def = byId[mp.defaults[slot]]; if (slot in plan && byId[id] && !(def && def.pinned)) plan[slot] = id; });
    mp.plan = plan;
    mp.ticked = new Set(Object.keys(remote.ticked || {}));
    synced = current();
    applying = true; try { redraw(); } finally { applying = false; }
  };

  window.addEventListener('dash-ready', () => {
    if (!window.mpEnsurePlan()) return;
    base = 'meals/' + planKey();
    const local = readLocal(LOCAL) || readLocal(OLD) || {};
    window.mp.hideTicked = !!local.hideTicked;
    document.querySelectorAll('[data-hide-ticked]').forEach((b) => b.setAttribute('aria-pressed', String(window.mp.hideTicked)));
    if (window.mpAudio) {
      if (local.musicOn === false) window.mpAudio.musicOn = false;
      if (local.sfxOn === false) window.mpAudio.sfxOn = false;
      if (window.mpAudio.onchange) window.mpAudio.onchange();
    }
    // One-off move of swaps/ticks saved by the older version of the app into the shared store
    const old = readLocal(OLD);
    if (old && !Hub.store.get(base) && old.planId && old.planId.indexOf(planKey()) === 0) {
      Object.entries(old.plan || {}).forEach(([s, id]) => { if (window.mp.defaults[s] !== id) window.mp.plan[s] = id; });
      (old.ticked || []).forEach((t) => window.mp.ticked.add(t));
      push();
    }
    try { localStorage.removeItem(OLD); } catch (e) { /* ignore */ }
    Hub.store.on(base, apply);
  });

  window.mpRedraw = () => { redraw(); push(); saveLocal(); };
  document.addEventListener('change', () => setTimeout(() => { push(); saveLocal(); }, 0));
  document.addEventListener('click', () => setTimeout(() => { push(); saveLocal(); }, 0));
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveLocal(); });
})();
