(() => {
const SLOTS = window.MP_SLOTS, STORES = window.MP_STORES;
const el2 = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined && text !== null) e.textContent = text; return e; };
const none2 = (e) => { e.replaceChildren(); e.textContent = '—'; };

dash.draw('trolley-count', (e) => {
  const c = window.mpCompute();
  if (!c) return none2(e);
  const done = c.lines.filter((l) => window.mp.ticked.has(l.id)).length;
  e.textContent = done + ' of ' + c.lines.length + ' items in the trolley';
});

dash.draw('checklist', (e) => {
  const c = window.mpCompute();
  if (!c) return none2(e);
  const k = 't_' + c.best.key;
  const t = window.mp.ticked;
  const done = c.lines.filter((l) => t.has(l.id));
  const left = c.lines.filter((l) => !t.has(l.id)).reduce((a, l) => a + (l[k] || 0), 0);
  const prog = el2('div', 'fq-prog');
  const bar = el2('div', 'fq-bar'); const fill = el2('i'); fill.style.width = (c.lines.length ? done.length / c.lines.length * 100 : 0) + '%'; bar.append(fill);
  prog.append(el2('div', 'fq-note', done.length + ' of ' + c.lines.length + ' items in the trolley · ' + window.mpMoney(left) + ' still to grab at ' + c.best.store), bar);
  const cols = el2('div', 'fq-cols');
  let aisle = null;
  c.lines.forEach((l) => {
    if (window.mp.hideTicked && t.has(l.id)) return;
    if (l.aisle !== aisle) { aisle = l.aisle; cols.append(el2('div', 'fq-aisle', aisle)); }
    const lab = el2('label', 'fq-li' + (t.has(l.id) ? ' done' : ''));
    const cb = el2('input'); cb.type = 'checkbox'; cb.checked = t.has(l.id);
    cb.addEventListener('change', () => { cb.checked ? t.add(l.id) : t.delete(l.id); dash.draw('checklist'); dash.draw('trolley-count'); });
    const nm = el2('span', 'nm', (l.packs > 1 ? l.packs + ' × ' : '') + l.item); nm.append(el2('span', 'amt', l.buy));
    lab.append(cb, nm, el2('span', 'pr', l[k] === null ? '—' : window.mpMoney(l[k])));
    cols.append(lab);
  });
  const out = [prog, cols];
  if (window.mp.hideTicked && done.length === c.lines.length && c.lines.length) out.push(el2('p', 'fq-note', 'All done. Everything is in the trolley 🎉'));
  e.replaceChildren(...out);
});

dash.draw('plan-code', (e) => {
  if (!window.mpEnsurePlan()) return none2(e);
  e.textContent = window.mpDays().map((d) => SLOTS.map((s) => window.mp.plan[d + '-' + s]).join('.')).join('|');
});

dash.draw('price-list', (e) => {
  const c = window.mpCompute();
  if (!c) return none2(e);
  const tbl = el2('table', 'fq-table');
  const hr = el2('tr');
  ['Item', 'Qty'].forEach((h) => hr.append(el2('th', null, h)));
  STORES.forEach(([, n]) => hr.append(el2('th', 'num', n)));
  hr.append(el2('th', 'nt', 'Notes'));
  const thead = el2('thead'); thead.append(hr);
  const tb = el2('tbody');
  c.lines.forEach((l) => {
    const tr = el2('tr');
    const vals = STORES.map(([k]) => l['t_' + k]);
    const min = Math.min(...vals.filter((v) => v !== null));
    const nm = el2('td', null, l.item);
    tr.append(nm, el2('td', null, l.packs + ' × ' + l.buy));
    vals.forEach((v) => tr.append(el2('td', 'num' + (v === null ? ' miss' : v === min ? ' best' : ''), v === null ? '—' : window.mpMoney(v))));
    tr.append(el2('td', 'nt', l.note || ''));
    tb.append(tr);
  });
  const tot = el2('tr', 'tot');
  tot.append(el2('td', null, 'Total'), el2('td', null, c.lines.length + ' items'));
  c.totals.forEach((t) => tot.append(el2('td', 'num' + (t === c.best ? ' best' : ''), window.mpMoney(t.total) + (t.missing ? ' *' : ''))));
  tot.append(el2('td', 'nt', c.totals.some((t) => t.missing) ? '* missing ' + c.totals.filter((t) => t.missing).map((t) => t.store + ' ' + t.missing).join(', ') + ' item(s)' : ''));
  tb.append(tot);
  tbl.append(thead, tb);
  e.replaceChildren(tbl);
});

dash.draw('leaderboard', (e) => {
  const c = window.mpCompute();
  e.replaceChildren();
  if (!c) return;
  const rows = [...c.totals].sort((a, b) => a.shared - b.shared);
  const max = Math.max(...rows.map((r) => r.shared)) || 1;
  const wrap = el2('div', 'fq-lb');
  const fills = [];
  rows.forEach((r) => {
    const row = el2('div', 'fq-lb-row' + (r === c.best ? ' win' : ''));
    const name = el2('div', 'fq-lb-name', (r === c.best ? '🏆 ' : '') + r.store);
    name.append(el2('span', 'fq-lb-sub', r.missing ? r.missing + ' item not stocked' : 'Whole list ' + window.mpMoney(r.total)));
    const track = el2('div', 'fq-lb-track'); const fill = el2('div', 'fq-lb-fill'); track.append(fill);
    fills.push([fill, Math.max(2, r.shared / max * 100)]);
    row.append(name, track, el2('div', 'fq-lb-val', window.mpMoney(r.shared)));
    wrap.append(row);
  });
  e.append(wrap);
  requestAnimationFrame(() => requestAnimationFrame(() => fills.forEach(([f, w], i) => { f.style.transitionDelay = (i * 0.12) + 's'; f.style.width = w + '%'; })));
});

dash.draw('toast', (e) => {
  const t = window.mp.toast;
  e.classList.toggle('show', !!t);
  if (!t) { e.replaceChildren(); return; }
  const d = t.delta;
  e.replaceChildren(el2('span', null, '🔄 Swapped in ' + t.name + '.'), el2('span', d > 0 ? 'up' : 'down', t.store + ' total ' + window.mpMoney(t.total) + (d === 0 ? ' (no change)' : ' (' + (d > 0 ? '+' : '−') + window.mpMoney(Math.abs(d)) + ')')));
});
})();
