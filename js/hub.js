/* Hub — the main menu, page switching, and small shared helpers that every menu (module) uses.
   A module calls Hub.register({...}) — see MODULES.md for the contract. */
(() => {
  const Hub = (window.Hub = window.Hub || {});
  const modules = [];
  const ORDER = ['home', 'menu'];
  const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pad = (n) => String(n).padStart(2, '0');

  /* ---------- tiny helpers ---------- */
  Hub.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  Hub.money = (n) => (n < 0 ? '−' : '') + '$' + Math.abs(+n || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  Hub.money0 = (n) => (n < 0 ? '−' : '') + '$' + Math.round(Math.abs(+n || 0)).toLocaleString('en-AU');
  Hub.iso = (d) => { d = d ? new Date(d) : new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  Hub.today = () => Hub.iso(Hub.now());
  Hub.now = () => (Hub._fakeNow ? new Date(Hub._fakeNow) : new Date()); // tests can set Hub._fakeNow
  Hub.parse = (iso) => { const [y, m, d] = String(iso).split('-').map(Number); return new Date(y, m - 1, d); };
  Hub.addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  Hub.fmtDate = (d, opts) => (typeof d === 'string' ? Hub.parse(d) : d).toLocaleDateString('en-AU', opts || { weekday: 'short', day: 'numeric', month: 'short' });
  Hub.dayName = (d) => (typeof d === 'string' ? Hub.parse(d) : d).toLocaleDateString('en-AU', { weekday: 'long' });

  /* Pay fortnights: Jacob is paid every second Friday, starting Fri 6 Nov 2026. */
  Hub.PAY_ANCHOR = '2026-11-06';
  Hub.fortnight = (when) => {
    const d = when ? (typeof when === 'string' ? Hub.parse(when) : new Date(when)) : Hub.now();
    d.setHours(0, 0, 0, 0);
    const anchor = Hub.parse(Hub.PAY_ANCHOR);
    const idx = Math.floor(Math.round((d - anchor) / 864e5) / 14);
    const payday = Hub.addDays(anchor, idx * 14);
    const nextPayday = Hub.addDays(payday, 14);
    const daysLeft = Math.round((nextPayday - d) / 864e5);
    return { index: idx, payday, nextPayday, end: Hub.addDays(nextPayday, -1), daysLeft, daysIn: 14 - daysLeft,
      label: Hub.fmtDate(payday, { day: 'numeric', month: 'short' }) + ' – ' + Hub.fmtDate(Hub.addDays(nextPayday, -1), { day: 'numeric', month: 'short' }),
      key: Hub.iso(payday) };
  };

  /* Baby #2 is due Sun 21 Feb 2027 */
  Hub.DUE_DATE = '2027-02-21';
  Hub.dueIn = (when) => { const d = when ? new Date(when) : Hub.now(); d.setHours(0, 0, 0, 0); const days = Math.round((Hub.parse(Hub.DUE_DATE) - d) / 864e5); return { days, weeks: Math.floor(days / 7), pregnancyWeek: 40 - Math.ceil(days / 7) }; };

  /* Who is holding this phone */
  Hub.PEOPLE = ['Jacob', 'Sienna'];
  Hub.me = () => { try { return localStorage.getItem('hub-me') || ''; } catch (e) { return ''; } };
  Hub.setMe = (name) => { try { localStorage.setItem('hub-me', name); } catch (e) { /* ignore */ } document.querySelectorAll('[data-me]').forEach((el) => { el.textContent = name; }); };

  Hub.sfx = (name) => { if (window.mpAudio) window.mpAudio.sfxPlay(name); };

  /* Toast */
  let toastT;
  Hub.toast = (msg) => {
    let t = document.getElementById('hb-toast');
    if (!t) { t = document.createElement('div'); t.id = 'hb-toast'; t.className = 'hb-toast'; t.setAttribute('role', 'status'); t.setAttribute('aria-live', 'polite'); document.querySelector('.fq').appendChild(t); }
    t.textContent = msg; t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600);
  };

  /* Bottom sheet (phone) / centred window (desktop). body: Node or HTML string. Returns {el, body, close}. */
  Hub.sheet = ({ title, body, onClose, wide } = {}) => {
    const d = document.createElement('dialog');
    d.className = 'fq-win hb-sheet hb-sheet-' + Hub.view + (wide ? ' wide' : '');
    const owner = modules.find((m) => m.id === Hub.view);
    if (owner && owner.accent) d.style.setProperty('--accent', owner.accent);
    d.innerHTML = '<div class="fq-win-bar"><h3></h3><button class="fq-x" data-close aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div><div class="fq-win-body"></div>';
    d.querySelector('h3').textContent = title || '';
    const b = d.querySelector('.fq-win-body');
    if (typeof body === 'string') b.innerHTML = body; else if (body) b.appendChild(body);
    document.querySelector('.fq').appendChild(d);
    let closed = false;
    const close = () => {
      if (closed) return; closed = true;
      Hub.sfx('close');
      const done = () => { try { d.close(); } catch (e) { /* ignore */ } d.remove(); if (onClose) onClose(); };
      if (reduceMotion()) done(); else { d.classList.add('closing'); setTimeout(done, 300); }
    };
    d.addEventListener('click', (ev) => { if (ev.target === d) close(); });
    d.addEventListener('cancel', (ev) => { ev.preventDefault(); close(); });
    d.querySelector('[data-close]').addEventListener('click', close);
    d.showModal(); Hub.sfx('open');
    return { el: d, body: b, close };
  };

  /* Slide between two panels inside a module (e.g. summary -> full dashboard). dir: 'fwd' | 'back' */
  Hub.slide = (fromEl, toEl, dir) => {
    if (!fromEl || !toEl || fromEl === toEl) return;
    if (reduceMotion()) { fromEl.hidden = true; toEl.hidden = false; return; }
    toEl.hidden = false;
    fromEl.classList.add('hb-out-' + dir); toEl.classList.add('hb-in-' + dir);
    setTimeout(() => { fromEl.hidden = true; fromEl.classList.remove('hb-out-' + dir); toEl.classList.remove('hb-in-' + dir); }, 420);
    const top = document.getElementById('top'); if (top) top.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  /* ---------- modules ---------- */
  const rendered = new Set();
  Hub.modules = () => modules.slice();
  Hub.register = (mod) => {
    if (!mod || !mod.id || modules.some((m) => m.id === mod.id)) return;
    modules.push(mod);
    ORDER.push(mod.id);
    if (document.readyState !== 'loading') build(mod); else document.addEventListener('DOMContentLoaded', () => build(mod));
  };
  Hub.refreshCard = (id) => {
    const mod = modules.find((m) => m.id === id);
    document.querySelectorAll('[data-hub-card="' + id + '"]').forEach((el) => { if (mod && mod.card) { try { mod.card(el); } catch (err) { console.error('card ' + id, err); } } });
  };

  const build = (mod) => {
    const stage = document.querySelector('.fq-stage');
    if (!stage || document.getElementById(mod.id)) return;
    const sec = document.createElement('section');
    sec.className = 'fq-view hb-mod'; sec.id = mod.id; sec.hidden = true;
    sec.style.setProperty('--accent', mod.accent || 'var(--but)');
    sec.innerHTML = '<div class="hb-head"><button class="fq-back" data-go="home"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>Home</button><span class="hb-sync-pill" data-sync-pill></span></div><div class="hb-body"></div>';
    sec.querySelector('[data-go]').addEventListener('click', () => Hub.go('home'));
    stage.appendChild(sec);
    // home menu card
    const grid = document.querySelector('[data-hub-grid]');
    if (grid) {
      const b = document.createElement('button');
      b.className = 'hb-tile'; b.dataset.go = mod.id; b.style.setProperty('--accent', mod.accent || 'var(--but)');
      b.innerHTML = '<span class="hb-tile-ic" aria-hidden="true"></span><span class="hb-tile-txt"><span class="hb-tile-t"></span><span class="hb-tile-sum" data-hub-card="' + mod.id + '"></span></span><span class="hb-tile-go" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></span>';
      b.querySelector('.hb-tile-ic').textContent = mod.emoji || '•';
      b.querySelector('.hb-tile-t').textContent = mod.title;
      b.querySelector('.hb-tile-sum').textContent = mod.tagline || '';
      b.addEventListener('click', () => Hub.go(mod.id));
      const slot = grid.querySelector('[data-hub-slot="' + mod.id + '"]');
      if (slot) slot.replaceWith(b); else grid.appendChild(b);
    }
    Hub.refreshCard(mod.id);
    if (mod.init) { try { mod.init(); } catch (err) { console.error('init ' + mod.id, err); } }
    syncPills();
    if (location.hash.slice(1) === mod.id) Hub.go(mod.id, { instant: true });
  };

  const renderModule = (id) => {
    const mod = modules.find((m) => m.id === id);
    if (!mod || rendered.has(id)) return;
    rendered.add(id);
    const body = document.querySelector('#' + id + ' .hb-body');
    try { mod.render(body); } catch (err) { console.error('render ' + id, err); body.innerHTML = '<p class="hb-empty">Something went wrong loading this menu.</p>'; }
  };

  /* ---------- page switching (home <-> any menu) ---------- */
  Hub.view = 'home';
  Hub.go = (view, opts) => {
    opts = opts || {};
    const cur = Hub.view;
    if (cur === view) return;
    const from = document.getElementById(cur), to = document.getElementById(view);
    if (!to) return;
    renderModule(view);
    const dir = ORDER.indexOf(view) > ORDER.indexOf(cur) ? 'fwd' : 'back';
    Hub.view = view;
    if (window.mp) window.mp.view = view;
    const A = window.mpAudio;
    if (A && !opts.instant) { A.sfxPlay(view === 'home' ? 'close' : 'enter'); if (view === 'home') A.stopMusic(); else A.startMusic(); }
    const top = document.getElementById('top');
    if (top && !opts.instant) top.scrollIntoView({ block: 'start', behavior: reduceMotion() ? 'auto' : 'smooth' });
    document.querySelectorAll('.fq-view, #home').forEach((s) => { if (s !== from && s !== to) s.hidden = true; });
    if (!from || opts.instant || reduceMotion()) { if (from) from.hidden = true; to.hidden = false; }
    else {
      to.hidden = false;
      from.classList.add('fq-leave-' + dir); to.classList.add('fq-arrive-' + dir);
      clearTimeout(Hub._goT);
      Hub._goT = setTimeout(() => {
        from.hidden = true;
        from.classList.remove('fq-leave-fwd', 'fq-leave-back');
        to.classList.remove('fq-arrive-fwd', 'fq-arrive-back');
      }, 700);
    }
    try { history.replaceState(null, '', view === 'home' ? location.pathname : '#' + view); } catch (e) { /* ignore */ }
    document.querySelectorAll('[data-nav]').forEach((b) => b.setAttribute('aria-current', b.dataset.nav === view ? 'page' : 'false'));
    if (view === 'home') modules.forEach((m) => Hub.refreshCard(m.id));
    const mod = modules.find((m) => m.id === view);
    if (mod && mod.onShow) { try { mod.onShow(); } catch (err) { console.error(err); } }
    if (window.mpRedraw && (view === 'menu' || view === 'home')) window.mpRedraw();
  };

  /* ---------- sync status pill + setup sheet ---------- */
  const PILL = { local: ['On this phone only', 'off'], connecting: ['Connecting…', 'wait'], live: ['Live with Sienna', 'live'], offline: ['Offline — will sync', 'wait'], error: ['Sync problem', 'off'] };
  const syncPills = () => {
    const s = Hub.store ? Hub.store.status() : 'local';
    const other = Hub.me() === 'Sienna' ? 'Jacob' : 'Sienna';
    document.querySelectorAll('[data-sync-pill]').forEach((p) => {
      const [txt, cls] = PILL[s] || PILL.local;
      p.textContent = s === 'live' ? 'Live with ' + other : txt;
      p.className = 'hb-sync-pill ' + cls;
      p.setAttribute('role', 'button'); p.tabIndex = 0;
      if (!p._wired) { p._wired = true; p.addEventListener('click', Hub.openSync); p.addEventListener('keydown', (e) => { if (e.key === 'Enter') Hub.openSync(); }); }
    });
  };
  Hub.syncPills = syncPills;

  Hub.openSync = () => {
    const st = Hub.store, conf = st.config();
    const wrap = document.createElement('div');
    wrap.className = 'hb-stack';
    if (conf) {
      wrap.innerHTML = '<p>This phone is sharing with your household. Changes either of you make show up on the other phone within a second or two.</p>' +
        '<div class="hb-card"><div class="hb-k">Status</div><div class="hb-v sm" data-st></div></div>' +
        '<div class="hb-card"><div class="hb-k">Invite Sienna (or another phone)</div><p class="hb-note">Send this link. Opening it joins the household straight away.</p><code class="hb-code" data-link></code><div class="hb-row"><button class="hb-btn primary" data-copy>Copy invite link</button><button class="hb-btn" data-share hidden>Share…</button></div></div>' +
        '<div class="hb-card"><div class="hb-k">Who is using this phone?</div><div class="hb-seg" data-who></div></div>' +
        '<button class="hb-btn ghost danger" data-leave>Stop sharing on this phone</button>';
      wrap.querySelector('[data-st]').textContent = (PILL[st.status()] || PILL.local)[0];
      wrap.querySelector('[data-link]').textContent = st.joinLink();
      wrap.querySelector('[data-copy]').addEventListener('click', (e) => { try { navigator.clipboard.writeText(st.joinLink()).then(() => { e.target.textContent = 'Copied ✓'; }); } catch (err) { /* visible to copy */ } });
      if (navigator.share) { const sh = wrap.querySelector('[data-share]'); sh.hidden = false; sh.addEventListener('click', () => navigator.share({ title: 'Our household app', url: st.joinLink() }).catch(() => {})); }
      wrap.querySelector('[data-leave]').addEventListener('click', () => { st.disconnect(); s.close(); syncPills(); Hub.toast('This phone has stopped sharing'); });
    } else {
      wrap.innerHTML = '<p>Right now everything is saved on this phone only. Connect a free Firebase database once, then send Sienna the invite link — after that you both see every change live.</p>' +
        '<label class="hb-field"><span>Firebase database address</span><input class="hb-input" type="url" inputmode="url" autocapitalize="off" autocomplete="off" spellcheck="false" placeholder="https://your-app-default-rtdb.firebaseio.com" data-db></label>' +
        '<p class="hb-note">Firebase console → Build → Realtime Database → the address at the top of the Data tab. The README on GitHub has the five-minute setup.</p>' +
        '<p class="hb-err" data-err hidden></p>' +
        '<div class="hb-card"><div class="hb-k">Who is using this phone?</div><div class="hb-seg" data-who></div></div>' +
        '<button class="hb-btn primary" data-go-connect>Connect</button>' +
        '<p class="hb-note">Got an invite link from Jacob? Just open it on this phone instead.</p>';
      wrap.querySelector('[data-go-connect]').addEventListener('click', () => {
        const err = wrap.querySelector('[data-err]');
        try { st.connect(wrap.querySelector('[data-db]').value); s.close(); syncPills(); Hub.toast('Connected — open the sync pill to invite Sienna'); }
        catch (e) { err.hidden = false; err.textContent = e.message; }
      });
    }
    const who = wrap.querySelector('[data-who]');
    Hub.PEOPLE.forEach((n) => { const b = document.createElement('button'); b.className = 'hb-seg-b'; b.textContent = n; b.setAttribute('aria-pressed', String(Hub.me() === n)); b.addEventListener('click', () => { Hub.setMe(n); who.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); syncPills(); }); who.appendChild(b); });
    const s = Hub.sheet({ title: '🔄 Sharing with your household', body: wrap });
  };

  /* First run: ask who is holding the phone */
  const askWho = () => {
    if (Hub.me()) return;
    const wrap = document.createElement('div');
    wrap.className = 'hb-stack';
    wrap.innerHTML = '<p>So we can say hello properly and show who added what.</p><div class="hb-row big"></div>';
    const row = wrap.querySelector('.hb-row');
    Hub.PEOPLE.forEach((n) => { const b = document.createElement('button'); b.className = 'hb-btn primary big'; b.textContent = 'I’m ' + n; b.addEventListener('click', () => { Hub.setMe(n); s.close(); greet(); syncPills(); }); row.appendChild(b); });
    const s = Hub.sheet({ title: '👋 Who’s this phone for?', body: wrap });
  };

  const greet = () => {
    const h = Hub.now().getHours();
    const part = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    document.querySelectorAll('[data-hub-greet]').forEach((el) => { el.textContent = part + (Hub.me() ? ', ' + Hub.me() : ''); });
    document.querySelectorAll('[data-hub-date]').forEach((el) => { const f = Hub.fortnight(); el.textContent = Hub.fmtDate(Hub.now(), { weekday: 'long', day: 'numeric', month: 'long' }) + ' · payday in ' + f.daysLeft + ' day' + (f.daysLeft === 1 ? '' : 's'); });
  };
  Hub.greet = greet;

  document.addEventListener('DOMContentLoaded', () => {
    greet();
    document.querySelectorAll('[data-go]').forEach((b) => { if (!b._hubGo) { b._hubGo = true; b.addEventListener('click', () => Hub.go(b.dataset.go)); } });
    if (Hub.store) Hub.store.onStatus(syncPills);
    syncPills();
    if (Hub.store && Hub.store.justJoined) Hub.toast('Joined your household — changes now sync live');
    setTimeout(askWho, 600);
    const named = location.hash.slice(1);
    if (named === 'menu') Hub.go('menu', { instant: true });
  });
  window.mpGo = (v) => Hub.go(v);
})();
