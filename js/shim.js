/* Tiny stand-in for the dashboard runtime: loads the data files and redraws parts of the page */
(() => {
  const DATA = {}, STATUS = {}, draws = {};
  const run = (name) => {
    const fn = draws[name];
    if (!fn) return;
    document.querySelectorAll('[data-draw="' + name + '"]').forEach((el) => {
      try { fn(el); } catch (err) { console.error('draw ' + name, err); }
    });
  };
  window.dash = {
    data: (id) => ({ status: STATUS[id] || 'loading', data: DATA[id] || [] }),
    draw: (name, fn) => { if (fn) draws[name] = fn; run(name); },
    setLink: (name) => { try { history.replaceState(null, '', '#' + name); } catch (e) { /* ignore */ } },
    colors: ['#8BD17C', '#FF6A4D', '#FFD36E', '#8A5CF6']
  };
  const load = (id) => fetch('data/' + id + '.json', { cache: 'no-cache' })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((d) => { DATA[id] = d; STATUS[id] = 'ok'; })
    .catch(() => { STATUS[id] = 'error'; });
  Promise.all(['prices', 'recipes', 'plan'].map(load)).then(() => {
    window.dispatchEvent(new Event('dash-ready'));
    Object.keys(draws).forEach(run);
  });
  let t;
  window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => run('leaderboard'), 150); });
})();
