/* Hub.store — one shared tree of household data.
   Saved on this phone (localStorage) and, once connected, kept in sync live through
   a Firebase Realtime Database using its REST API (PUT/PATCH + EventSource streaming).
   Paths are slash-separated: "calendar/events/e123". Values are JSON. null deletes. */
(() => {
  const TREE = 'hub-tree-v1', CONF = 'hub-sync-v1', QUEUE = 'hub-queue-v1';
  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const keep = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } };

  let tree = load(TREE, {});
  let queue = load(QUEUE, []);           // writes made while offline: [{path, value}]
  let conf = load(CONF, null);            // {db, hid}
  let status = conf ? 'connecting' : 'local';
  let es = null, retry = 0, retryT = null;
  const listeners = new Set();            // {path, cb}
  const statusCbs = new Set();

  const split = (p) => String(p || '').split('/').filter(Boolean);
  const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
  const getAt = (root, parts) => { let n = root; for (const k of parts) { if (n == null || typeof n !== 'object') return undefined; n = n[k]; } return n; };
  const prune = (root, parts) => { // drop empty parents left behind by deletes
    for (let i = parts.length - 1; i > 0; i--) { const parent = getAt(root, parts.slice(0, i)); if (parent && typeof parent === 'object' && !Object.keys(parent).length) { const gp = i > 1 ? getAt(root, parts.slice(0, i - 1)) : root; if (gp) delete gp[parts[i - 1]]; } else break; }
  };
  const setAt = (parts, value) => {
    if (!parts.length) { tree = value && typeof value === 'object' ? value : {}; return; }
    let n = tree;
    for (let i = 0; i < parts.length - 1; i++) { if (n[parts[i]] == null || typeof n[parts[i]] !== 'object') n[parts[i]] = {}; n = n[parts[i]]; }
    const last = parts[parts.length - 1];
    if (value === null || value === undefined) { delete n[last]; prune(tree, parts); } else n[last] = value;
  };

  let pending = new Set(), flushT = null;
  const notify = (path) => {
    pending.add(split(path).join('/'));
    if (flushT) return;
    flushT = setTimeout(() => {
      flushT = null;
      const changed = [...pending]; pending = new Set();
      keep(TREE, tree);
      listeners.forEach((l) => {
        const hit = changed.some((c) => c === '' || l.path === '' || c === l.path || c.startsWith(l.path + '/') || l.path.startsWith(c + '/'));
        if (hit) { try { l.cb(clone(getAt(tree, split(l.path)))); } catch (err) { console.error('store listener', l.path, err); } }
      });
    }, 0);
  };

  const url = (path) => conf.db.replace(/\/+$/, '') + '/households/' + encodeURIComponent(conf.hid) + (path ? '/' + split(path).map(encodeURIComponent).join('/') : '') + '.json';
  const setStatus = (s) => { if (s === status) return; status = s; statusCbs.forEach((cb) => { try { cb(s); } catch (e) { /* ignore */ } }); };

  const send = (w) => fetch(url(w.path), w.value === null
    ? { method: 'DELETE' }
    : { method: w.patch ? 'PATCH' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(w.value) })
    .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); });

  let flushing = false;
  const flushQueue = async () => {
    if (!conf || flushing) return;
    flushing = true;
    try {
      while (queue.length) { await send(queue[0]); queue.shift(); keep(QUEUE, queue); }
    } catch (e) { setStatus('offline'); scheduleReconnect(); }
    flushing = false;
  };

  const push = (w) => { if (!conf) return; queue.push(w); keep(QUEUE, queue); flushQueue(); };

  const scheduleReconnect = () => {
    clearTimeout(retryT);
    retryT = setTimeout(connect, Math.min(30000, 1000 * Math.pow(2, retry++)));
  };

  const applyRemote = (path, data, patch) => {
    const parts = split(path);
    if (patch && data && typeof data === 'object') Object.entries(data).forEach(([k, v]) => setAt(parts.concat(split(k)), v));
    else setAt(parts, data);
    notify(path);
  };

  const connect = async () => {
    if (!conf) return;
    if (es) { es.close(); es = null; }
    setStatus('connecting');
    await flushQueue();               // offline edits go up before we take the server's copy
    if (queue.length) return;          // still offline; flushQueue scheduled a retry
    let first = true;
    try { es = new EventSource(url('')); } catch (e) { setStatus('offline'); scheduleReconnect(); return; }
    es.addEventListener('put', (ev) => {
      let msg; try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (first && msg.path === '/') {
        first = false;
        if (msg.data == null && Object.keys(tree).length) { send({ path: '', value: tree }).catch(() => {}); } // first phone: upload what's here
        else applyRemote('', msg.data || {}, false);
        retry = 0; setStatus('live');
        return;
      }
      applyRemote(msg.path, msg.data, false);
    });
    es.addEventListener('patch', (ev) => { let msg; try { msg = JSON.parse(ev.data); } catch (e) { return; } applyRemote(msg.path, msg.data, true); });
    ['cancel', 'auth_revoked'].forEach((t) => es.addEventListener(t, () => { setStatus('error'); }));
    es.onerror = () => { if (es && es.readyState === 2) { es = null; setStatus('offline'); scheduleReconnect(); } else if (status === 'live') setStatus('connecting'); };
  };

  const randomId = (n = 20) => { const a = new Uint8Array(n); (self.crypto || window.crypto).getRandomValues(a); return Array.from(a, (b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join(''); };

  const store = {
    get: (path) => clone(getAt(tree, split(path))),
    set: (path, value) => { setAt(split(path), clone(value)); notify(path); push({ path: split(path).join('/'), value: value === undefined ? null : clone(value) }); },
    update: (path, obj) => { Object.entries(obj || {}).forEach(([k, v]) => setAt(split(path).concat(split(k)), clone(v))); notify(path); push({ path: split(path).join('/'), value: clone(obj), patch: true }); },
    remove: (path) => store.set(path, null),
    on: (path, cb, opts) => { const l = { path: split(path).join('/'), cb }; listeners.add(l); if (!opts || opts.now !== false) { try { cb(clone(getAt(tree, split(path)))); } catch (e) { console.error(e); } } return () => listeners.delete(l); },
    status: () => status,
    onStatus: (cb) => { statusCbs.add(cb); return () => statusCbs.delete(cb); },
    config: () => (conf ? { ...conf } : null),
    connect: (db, hid) => {
      db = String(db || '').trim().replace(/\/+$/, '');
      if (!/^https:\/\/[a-z0-9.-]+\.(firebaseio\.com|firebasedatabase\.app)$/i.test(db) && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(db)) throw new Error('That doesn’t look like a Firebase database address.');
      conf = { db, hid: hid || randomId() };
      keep(CONF, conf); retry = 0; connect();
      return { ...conf };
    },
    disconnect: () => { if (es) es.close(); es = null; conf = null; localStorage.removeItem(CONF); queue = []; keep(QUEUE, queue); setStatus('local'); },
    joinLink: () => (conf ? location.origin + location.pathname + '#join=' + encodeURIComponent(conf.db) + '~' + conf.hid : ''),
    id: (prefix) => (prefix || '') + Date.now().toString(36) + randomId(4)
  };

  // A join link (#join=<db>~<household>) connects this phone to the household.
  const m = location.hash.match(/^#join=([^~]+)~([a-z0-9]{12,})$/i);
  if (m) {
    try { store.connect(decodeURIComponent(m[1]), m[2]); store.justJoined = true; } catch (e) { console.warn(e); }
    try { history.replaceState(null, '', location.pathname); } catch (e) { /* ignore */ }
  } else if (conf) connect();

  window.addEventListener('online', () => { if (conf && status !== 'live') { retry = 0; connect(); } });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && conf && status !== 'live') { retry = 0; connect(); } });

  window.Hub = window.Hub || {};
  window.Hub.store = store;
})();
