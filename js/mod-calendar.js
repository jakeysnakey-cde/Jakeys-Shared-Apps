/* Calendar — shared family calendar: events, reminders and appointments for Jacob, Sienna & Dexter.
   Store (all under calendar/):
     events/<id>            {title, date, time?, end?, who, kind, notes?, repeat, by, at, editedBy?, editedAt?}
     done/<id>/<YYYY-MM-DD> {by, at}         reminder ticked for that day (works for repeating ones too)
     skip/<id>/<YYYY-MM-DD> {by, at}         one repeat skipped
     ack/<id>/<person>      {at, msg?}       "👍 Got it" (+ optional short note) from that person
   Paydays are generated from Hub.fortnight(), never stored. "Last looked" is per phone, in localStorage. */
(() => {
  const ID = 'calendar';
  const H = window.Hub;
  if (!H) return;

  /* ---------- constants ---------- */
  const WHO = {
    Family: { label: 'Family', ini: '🏡', col: '#8BD17C' },
    Jacob: { label: 'Jacob', ini: 'J', col: '#7FB8FF' },
    Sienna: { label: 'Sienna', ini: 'S', col: '#FF9FC0' },
    Dexter: { label: 'Dexter', ini: 'D', col: '#FFD36E' }
  };
  const WHO_ORDER = ['Family', 'Jacob', 'Sienna', 'Dexter'];
  const KINDS = { event: { label: 'Event', ic: '📌' }, reminder: { label: 'Reminder', ic: '✅' }, appt: { label: 'Appointment', ic: '🩺' } };
  const REPEATS = { none: 'Doesn’t repeat', weekly: 'Every week', fortnightly: 'Every fortnight', monthly: 'Every month', yearly: 'Every year' };
  const REPEAT_SHORT = { weekly: 'weekly', fortnightly: 'fortnightly', monthly: 'monthly', yearly: 'yearly' };
  const SEEN_KEY = () => 'ca-seen'; // per phone
  const VIEW_KEY = 'ca-view';

  /* ---------- tiny utils ---------- */
  const esc = H.esc;
  const pad = (n) => String(n).padStart(2, '0');
  const me = () => H.me() || 'Someone';
  const other = () => (H.me() === 'Sienna' ? 'Jacob' : 'Sienna');
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } };
  const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dayDiff = (a, b) => Math.round((H.parse(b) - H.parse(a)) / 864e5); // b - a, in days
  const addIso = (iso, n) => H.iso(H.addDays(H.parse(iso), n));
  const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
  const fmtTime = (t) => {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    const hh = ((h + 11) % 12) + 1;
    return hh + (m ? ':' + pad(m) : '') + (h < 12 ? 'am' : 'pm');
  };
  const dShort = (iso) => H.fmtDate(iso, { weekday: 'short', day: 'numeric', month: 'short' }); // "Tue 10 Nov"
  const dTiny = (iso) => H.fmtDate(iso, { weekday: 'short', day: 'numeric' });                   // "Tue 10"
  const relDay = (iso) => {
    const n = dayDiff(H.today(), iso);
    if (n === 0) return 'Today';
    if (n === 1) return 'Tomorrow';
    if (n === -1) return 'Yesterday';
    return dTiny(iso);
  };
  const ago = (ts) => {
    if (!ts) return '';
    const s = Math.max(0, (H.now() - ts) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' hr ago';
    const d = Math.round(s / 86400);
    return d === 1 ? 'yesterday' : d + ' days ago';
  };
  const nextSat = () => { // the coming Saturday (or next week's if today is Sat)
    const t = H.parse(H.today());
    const n = ((6 - t.getDay() + 7) % 7) || 7;
    return H.iso(H.addDays(t, n));
  };

  /* ---------- data ---------- */
  let data = {};
  const events = () => (data && data.events) || {};
  const doneMap = () => (data && data.done) || {};
  const skipMap = () => (data && data.skip) || {};
  const ackMap = () => (data && data.ack) || {};
  const isDone = (id, date) => !!(doneMap()[id] && doneMap()[id][date]);

  /* Dates an event happens on, within [from, to] (ISO strings, inclusive). */
  const occurrences = (ev, from, to) => {
    const out = [];
    if (!ev || !ev.date) return out;
    const start = ev.date;
    const rep = ev.repeat || 'none';
    const skips = skipMap()[ev._id] || {};
    const push = (iso) => { if (iso >= from && iso <= to && iso >= start && !skips[iso]) out.push(iso); };
    if (rep === 'none') { push(start); return out; }
    if (rep === 'weekly' || rep === 'fortnightly') {
      const step = rep === 'weekly' ? 7 : 14;
      let k = Math.max(0, Math.ceil(dayDiff(start, from) / step));
      for (let iso = addIso(start, k * step); iso <= to; k++, iso = addIso(start, k * step)) push(iso);
      return out;
    }
    const s = H.parse(start);
    const sd = s.getDate();
    if (rep === 'monthly') {
      const f = H.parse(from);
      let y = f.getFullYear(), m = f.getMonth() - 1; // start one month early to be safe
      for (let i = 0; i < 40; i++, m++) {
        const yy = y + Math.floor(m / 12), mm = ((m % 12) + 12) % 12;
        const iso = yy + '-' + pad(mm + 1) + '-' + pad(Math.min(sd, daysInMonth(yy, mm)));
        if (iso > to) break;
        push(iso);
      }
      return out;
    }
    if (rep === 'yearly') {
      const fy = H.parse(from).getFullYear(), ty = H.parse(to).getFullYear();
      for (let y = fy; y <= ty; y++) {
        const mm = s.getMonth();
        push(y + '-' + pad(mm + 1) + '-' + pad(Math.min(sd, daysInMonth(y, mm))));
      }
    }
    return out;
  };

  /* Paydays: every second Friday, from Hub.fortnight() (generated, read-only). */
  const paydays = (from, to) => {
    const out = [];
    let d = H.fortnight(from).payday;
    for (let i = 0; i < 60; i++) {
      const iso = H.iso(d);
      if (iso > to) break;
      if (iso >= from) out.push(iso);
      d = H.addDays(d, 14);
    }
    return out;
  };

  /* All items (occurrences) in a range, sorted. Each: {key, id, date, ev, builtin?} */
  const itemsIn = (from, to, opts) => {
    const list = [];
    Object.entries(events()).forEach(([id, ev]) => {
      if (!ev || typeof ev !== 'object') return;
      ev._id = id;
      occurrences(ev, from, to).forEach((date) => list.push({ key: id + '@' + date, id, date, ev }));
    });
    if (!opts || opts.paydays !== false) {
      paydays(from, to).forEach((date) => list.push({ key: 'pay@' + date, id: 'pay', date, builtin: true,
        ev: { title: 'Payday', who: 'Jacob', kind: 'event', icon: '💰', note: 'Jacob gets paid — new fortnight starts' } }));
      const due = H.DUE_DATE;
      if (due && due >= from && due <= to) list.push({ key: 'due@' + due, id: 'due', date: due, builtin: true, due: true,
        ev: { title: 'Baby due', who: 'Sienna', kind: 'event', icon: '👶', note: 'Sienna’s due date — baby #2 💛' } });
    }
    return list.sort(sortItems);
  };
  const sortItems = (a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (!!a.builtin !== !!b.builtin) return a.builtin ? -1 : 1;
    const ta = a.ev.time || '', tb = b.ev.time || '';
    if (ta !== tb) return ta < tb ? -1 : 1; // all-day first
    return String(a.ev.title).localeCompare(String(b.ev.title));
  };

  /* ---------- "new since you last looked" (per phone) ---------- */
  let seenAt = +lsGet(SEEN_KEY(), 0) || 0;      // what we highlight against while the page is open
  const storedSeen = () => +lsGet(SEEN_KEY(), 0) || 0;
  const markSeen = () => lsSet(SEEN_KEY(), String(Date.now()));
  const stamp = (ev) => Math.max(ev.at || 0, ev.editedAt || 0);
  const changer = (ev) => (ev.editedAt && ev.editedAt >= (ev.at || 0) ? ev.editedBy : ev.by);
  const isNewFor = (ev, since) => {
    if (!ev || !since) return false; // very first visit: nothing is "new", avoids a wall of badges
    return stamp(ev) > since && changer(ev) && changer(ev) !== H.me();
  };
  const newList = (since) => Object.entries(events()).filter(([, ev]) => isNewFor(ev, since)).map(([id, ev]) => Object.assign({ _id: id }, ev));
  const newAcks = (since) => {
    const out = [];
    if (!since) return out;
    Object.entries(ackMap()).forEach(([id, per]) => Object.entries(per || {}).forEach(([who, a]) => {
      if (who !== H.me() && a && a.at > since && events()[id]) out.push({ id, who, a, ev: events()[id] });
    }));
    return out.sort((x, y) => y.a.at - x.a.at);
  };

  /* ---------- writes ---------- */
  const saveEvent = (id, ev) => H.store.set('calendar/events/' + id, ev);
  const deleteEvent = (id) => {
    H.store.remove('calendar/events/' + id);
    H.store.remove('calendar/done/' + id);
    H.store.remove('calendar/skip/' + id);
    H.store.remove('calendar/ack/' + id);
  };
  const setDone = (id, date, on) => H.store.set('calendar/done/' + id + '/' + date, on ? { by: me(), at: Date.now() } : null);
  const skipOne = (id, date) => H.store.set('calendar/skip/' + id + '/' + date, { by: me(), at: Date.now() });
  const setAck = (id, val) => { if (!H.me()) { H.toast('Pick who you are first (tap the sync pill)'); return; } H.store.set('calendar/ack/' + id + '/' + H.me(), val); };

  /* ---------- .ics export (how real iPhone alerts happen) ---------- */
  const icsEsc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
  const icsFold = (line) => { const out = []; while (line.length > 74) { out.push(line.slice(0, 74)); line = ' ' + line.slice(74); } out.push(line); return out.join('\r\n'); };
  const buildIcs = (ev, id) => {
    const ymd = (iso) => iso.replace(/-/g, '');
    const hm = (t) => t.replace(':', '') + '00';
    const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Team Dexter HQ//Calendar//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT'];
    const now = new Date();
    L.push('UID:' + id + '@team-dexter-hq');
    L.push('DTSTAMP:' + now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, ''));
    if (ev.time) {
      L.push('DTSTART:' + ymd(ev.date) + 'T' + hm(ev.time)); // floating local time = the phone's own time zone (Adelaide)
      let end = ev.end && ev.end > ev.time ? ev.end : null;
      if (!end) { const [h, m] = ev.time.split(':').map(Number); const e = Math.min(23 * 60 + 59, h * 60 + m + 60); end = pad(Math.floor(e / 60)) + ':' + pad(e % 60); }
      L.push('DTEND:' + ymd(ev.date) + 'T' + hm(end));
    } else {
      L.push('DTSTART;VALUE=DATE:' + ymd(ev.date));
      L.push('DTEND;VALUE=DATE:' + ymd(addIso(ev.date, 1)));
    }
    const rr = { weekly: 'FREQ=WEEKLY', fortnightly: 'FREQ=WEEKLY;INTERVAL=2', monthly: 'FREQ=MONTHLY', yearly: 'FREQ=YEARLY' }[ev.repeat];
    if (rr) L.push('RRULE:' + rr);
    const who = ev.who && ev.who !== 'Family' ? ev.who + ': ' : '';
    L.push(icsFold('SUMMARY:' + icsEsc(who + ev.title)));
    const desc = [ev.notes, 'Added by ' + (ev.by || 'us') + ' in Team Dexter HQ'].filter(Boolean).join('\n');
    L.push(icsFold('DESCRIPTION:' + icsEsc(desc)));
    // Alert: 1 hour before timed things; 9am on the day for all-day things
    L.push('BEGIN:VALARM', 'ACTION:DISPLAY', icsFold('DESCRIPTION:' + icsEsc(ev.title)), ev.time ? 'TRIGGER:-PT1H' : 'TRIGGER:PT9H', 'END:VALARM');
    L.push('END:VEVENT', 'END:VCALENDAR');
    return L.join('\r\n') + '\r\n';
  };
  const downloadIcs = (ev, id) => {
    const text = buildIcs(ev, id);
    const name = (String(ev.title || 'event').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 40) || 'event') + '.ics';
    try {
      const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) {
      location.href = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(text);
    }
    H.toast('Opening in your Calendar app…');
  };
  H._calIcs = buildIcs; // exposed for tests
  H._calOcc = (ev, from, to) => occurrences(Object.assign({ _id: 'test' }, ev), from, to);

  /* ---------- UI state ---------- */
  let root = null, view = lsGet(VIEW_KEY, 'agenda') === 'month' ? 'month' : 'agenda';
  let monthCursor = null;         // Date: first of the shown month
  let selDay = null;              // ISO selected in month view
  let showAllLater = false;

  const whoBadge = (who, extra) => {
    const w = WHO[who] || WHO.Family;
    return '<span class="ca-who' + (extra ? ' ' + extra : '') + '" style="--who:' + w.col + '" aria-hidden="true">' + esc(w.ini) + '</span>';
  };
  const metaLine = (it) => {
    const ev = it.ev;
    if (it.builtin) return esc(ev.note);
    const bits = [];
    const w = WHO[ev.who] || WHO.Family;
    bits.push(ev.who === 'Family' || !ev.who ? 'Family' : 'For ' + w.label);
    if (ev.kind === 'appt') bits.push('Appointment');
    if (REPEAT_SHORT[ev.repeat]) bits.push('↻ ' + REPEAT_SHORT[ev.repeat]);
    bits.push(ev.by === H.me() ? 'you added' : 'added by ' + esc(ev.by || 'someone'));
    return bits.join(' · ');
  };
  const ackChips = (id) => {
    const per = ackMap()[id] || {};
    return Object.keys(per).map((p) => '<span class="ca-ack-chip" title="' + esc(p) + ' saw this">👍 ' + esc(p) + '</span>').join('');
  };

  const rowHtml = (it, opts) => {
    const ev = it.ev;
    const showDay = opts && opts.showDay;
    const isRem = ev.kind === 'reminder' && !it.builtin;
    const done = isRem && isDone(it.id, it.date);
    const fresh = !it.builtin && isNewFor(Object.assign({}, ev), seenAt);
    const w = WHO[ev.who] || WHO.Family;
    const when = (showDay ? '<b>' + esc(relDay(it.date)) + '</b>' : '') + '<span>' + (ev.time ? esc(fmtTime(ev.time)) : (showDay ? '' : 'All day')) + '</span>';
    const lead = isRem
      ? '<label class="ca-tick" style="--who:' + w.col + '"><input type="checkbox" class="hb-check" data-tick="' + esc(it.id) + '" data-date="' + it.date + '"' + (done ? ' checked' : '') + ' aria-label="Done: ' + esc(ev.title) + '"></label>'
      : (it.builtin ? '<span class="ca-who ca-who-pay" aria-hidden="true">' + ev.icon + '</span>' : whoBadge(ev.who));
    return '<li class="ca-row' + (done ? ' done' : '') + (fresh ? ' fresh' : '') + (it.builtin ? ' builtin' : '') + (it.due ? ' due' : '') + '" style="--who:' + w.col + '">' +
      lead +
      '<button class="ca-row-main" data-open="' + esc(it.id) + '" data-date="' + it.date + '">' +
        '<span class="ca-row-t">' + (ev.kind === 'appt' ? '🩺 ' : '') + esc(ev.title) + (fresh ? ' <span class="ca-new">New</span>' : '') + '</span>' +
        '<span class="ca-row-s">' + metaLine(it) + '</span>' +
        (it.builtin ? '' : '<span class="ca-acks">' + ackChips(it.id) + '</span>') +
      '</button>' +
      '<span class="ca-when">' + when + '</span>' +
    '</li>';
  };

  /* ---------- page skeleton ---------- */
  const render = (body) => {
    root = document.createElement('div');
    root.className = 'ca';
    root.innerHTML =
      '<header class="ca-top">' +
        '<div><h1 class="hb-h1">Calendar</h1><p class="hb-sub" data-ca-sub></p></div>' +
        '<button class="hb-btn primary ca-add-top" data-add>＋ Add</button>' +
      '</header>' +
      '<div class="ca-news" data-news hidden></div>' +
      '<div class="hb-seg ca-seg" role="tablist" aria-label="Calendar view">' +
        '<button class="hb-seg-b" role="tab" data-view="agenda">☰ Agenda</button>' +
        '<button class="hb-seg-b" role="tab" data-view="month">▦ Month</button>' +
      '</div>' +
      '<div class="hb-panels ca-panels">' +
        '<section class="ca-agenda" data-panel="agenda"></section>' +
        '<section class="ca-month" data-panel="month" hidden></section>' +
      '</div>' +
      '<p class="hb-note ca-foot">📲 iPhones don’t let home-screen apps send alerts — so open anything and tap <b>Add to iPhone Calendar</b>, and your phone will remind you.</p>' +
      '<button class="hb-fab ca-fab" data-add aria-label="Add to calendar">＋</button>';
    body.appendChild(root);

    root.addEventListener('click', onClick);
    root.addEventListener('change', onChange);
    wireSwipe();
    const p = root.querySelector('[data-panel="' + view + '"]');
    root.querySelectorAll('[data-panel]').forEach((x) => { x.hidden = x !== p; });
    draw();
  };

  const onClick = (e) => {
    const t = e.target.closest('button, [data-day]');
    if (!t || !root.contains(t)) return;
    if (t.dataset.add != null) { H.sfx('tap'); openEditor(null, { date: view === 'month' && selDay ? selDay : H.today() }); return; }
    if (t.dataset.view) { switchView(t.dataset.view); return; }
    if (t.dataset.open) { openDetail(t.dataset.open, t.dataset.date); return; }
    if (t.dataset.day) { selDay = t.dataset.day; H.sfx('tap'); drawMonth(); return; }
    if (t.dataset.mnav) {
      const n = +t.dataset.mnav;
      if (n === 0) { monthCursor = firstOfMonth(H.parse(H.today())); selDay = H.today(); } else monthCursor = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + n, 1);
      H.sfx('swap'); drawMonth(n); return;
    }
    if (t.dataset.more != null) { showAllLater = !showAllLater; drawAgenda(); return; }
    if (t.dataset.seen != null) { seenAt = Date.now(); markSeen(); H.sfx('tick'); draw(); H.refreshCard(ID); return; }
    if (t.dataset.addDay) { openEditor(null, { date: t.dataset.addDay }); }
  };
  const onChange = (e) => {
    const c = e.target;
    if (c.dataset && c.dataset.tick) {
      setDone(c.dataset.tick, c.dataset.date, c.checked);
      if (c.checked) { H.sfx('tick'); const row = c.closest('.ca-row'); if (row) { row.classList.add('done', 'pop'); } } else H.sfx('tap');
    }
  };

  const switchView = (v) => {
    if (v === view) return;
    const from = root.querySelector('[data-panel="' + view + '"]'), to = root.querySelector('[data-panel="' + v + '"]');
    const dir = v === 'month' ? 'fwd' : 'back';
    view = v; lsSet(VIEW_KEY, v);
    H.sfx('swap');
    if (v === 'month' && !selDay) selDay = H.today();
    draw();
    H.slide(from, to, dir);
  };

  /* ---------- draw ---------- */
  const draw = () => {
    if (!root) return;
    root.querySelectorAll('[data-view]').forEach((b) => { const on = b.dataset.view === view; b.setAttribute('aria-pressed', String(on)); b.setAttribute('aria-selected', String(on)); });
    const sub = root.querySelector('[data-ca-sub]');
    const live = H.store && H.store.status && H.store.status() === 'live';
    sub.textContent = live ? 'Shared live with ' + other() : 'Shared with ' + other() + ' once you’re both connected';
    drawNews();
    if (view === 'agenda') drawAgenda(); else drawMonth();
  };

  const drawNews = () => {
    const box = root.querySelector('[data-news]');
    const fresh = newList(seenAt), acks = newAcks(seenAt);
    if (!fresh.length && !acks.length) { box.hidden = true; box.innerHTML = ''; return; }
    const people = [...new Set(fresh.map(changer))];
    const bits = [];
    if (fresh.length) bits.push('<b>' + fresh.length + ' new</b> from ' + esc(people.join(' & ')));
    if (acks.length) bits.push('👍 ' + esc(acks[0].who) + ' saw “' + esc(acks[0].ev.title) + '”' + (acks[0].a.msg ? ': ' + esc(acks[0].a.msg) : '') + (acks.length > 1 ? ' +' + (acks.length - 1) : ''));
    box.hidden = false;
    box.innerHTML = '<span class="ca-news-ic" aria-hidden="true">✨</span><span class="ca-news-t">' + bits.join('<br>') + '</span><button class="hb-btn sm" data-seen>Got it</button>';
  };

  const group = (title, items, opts) => {
    if (!items.length && !(opts && opts.empty)) return '';
    return '<div class="ca-group' + (opts && opts.cls ? ' ' + opts.cls : '') + '"><h2 class="ca-gh">' + title + (opts && opts.side ? '<span>' + opts.side + '</span>' : '') + '</h2>' +
      (items.length ? '<ul class="ca-list">' + items.map((it) => rowHtml(it, opts)).join('') + '</ul>' : '<p class="ca-quiet">' + opts.empty + '</p>') + '</div>';
  };

  const drawAgenda = () => {
    const box = root.querySelector('[data-panel="agenda"]');
    const today = H.today();
    const tomorrow = addIso(today, 1);
    const weekEnd = addIso(today, 7);
    const laterEnd = addIso(today, 90);
    const all = itemsIn(addIso(today, -7), laterEnd);
    const hasOwn = Object.keys(events()).length > 0;

    // gently surface reminders from the last week that weren't ticked (latest one per reminder only)
    const seenRem = new Set();
    const missed = all.filter((it) => it.date < today && it.ev.kind === 'reminder' && !it.builtin && !isDone(it.id, it.date))
      .reverse().filter((it) => (seenRem.has(it.id) ? false : (seenRem.add(it.id), true))).reverse();

    const tdy = all.filter((it) => it.date === today);
    const tmr = all.filter((it) => it.date === tomorrow);
    const wk = all.filter((it) => it.date > tomorrow && it.date <= weekEnd);
    // Later: just the next time each repeating thing comes round (keeps the list short and calm)
    const seenSeries = new Set();
    let later = all.filter((it) => it.date > weekEnd).filter((it) => {
      const rep = it.builtin || (it.ev.repeat && it.ev.repeat !== 'none');
      if (!rep) return true;
      if (seenSeries.has(it.id)) return false;
      seenSeries.add(it.id); return true;
    });
    const laterTotal = later.length;
    if (!showAllLater) later = later.slice(0, 8);

    let html = '';
    const t = dueText();
    if (t) html += '<button class="ca-baby" data-open="due" data-date="' + H.DUE_DATE + '"><span class="ca-baby-ic" aria-hidden="true">👶</span><span class="ca-baby-t"><b>' + esc(t.main) + '</b><span>' + esc(t.when) + (t.days > 0 && t.week > 0 && t.week <= 42 ? ' · week ' + t.week + ' · go gently' : '') + '</span></span></button>';
    if (!hasOwn) {
      html += '<div class="hb-empty ca-empty"><b>Your shared calendar is ready</b>Add check-ups, birthdays, bin night, Dexter’s swim — anything you both need to know about.<div><button class="hb-btn primary big" data-add>＋ Add the first thing</button></div></div>';
    }
    html += group('Still to tick', missed, { showDay: true, cls: 'ca-missed', side: 'no rush' });
    html += group('Today <small>' + esc(H.fmtDate(today, { weekday: 'long', day: 'numeric', month: 'short' })) + '</small>', tdy, { empty: 'Nothing on today — enjoy the quiet ☕' });
    html += group('Tomorrow', tmr, { empty: 'Nothing planned yet.' });
    html += group('This week', wk, { showDay: true, empty: 'A clear week ahead.' });
    if (laterTotal) {
      html += group('Later', later, { showDay: true });
      if (laterTotal > 8) html += '<button class="hb-btn ghost ca-more" data-more>' + (showAllLater ? 'Show less' : 'Show ' + (laterTotal - 8) + ' more') + '</button>';
    }
    box.innerHTML = html;
  };

  /* ---------- month view ---------- */
  const firstOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
  const drawMonth = (animDir) => {
    const box = root.querySelector('[data-panel="month"]');
    if (!monthCursor) monthCursor = firstOfMonth(H.parse(H.today()));
    if (!selDay) selDay = H.today();
    const y = monthCursor.getFullYear(), m = monthCursor.getMonth();
    const first = new Date(y, m, 1);
    const lead = (first.getDay() + 6) % 7; // Monday first
    const gridStart = H.addDays(first, -lead);
    const cells = Math.ceil((lead + daysInMonth(y, m)) / 7) * 7;
    const from = H.iso(gridStart), to = H.iso(H.addDays(gridStart, cells - 1));
    const items = itemsIn(from, to);
    const byDay = {};
    items.forEach((it) => { (byDay[it.date] = byDay[it.date] || []).push(it); });
    const today = H.today();

    let g = '';
    for (let i = 0; i < cells; i++) {
      const iso = H.iso(H.addDays(gridStart, i));
      const inM = H.parse(iso).getMonth() === m;
      const list = byDay[iso] || [];
      const dots = list.slice(0, 4).map((it) => it.due ? '<i class="due"></i>' : it.builtin ? '<i class="pay"></i>' : '<i style="--who:' + (WHO[it.ev.who] || WHO.Family).col + '"></i>').join('');
      const fresh = list.some((it) => !it.builtin && isNewFor(it.ev, seenAt));
      g += '<button class="ca-cell' + (inM ? '' : ' out') + (iso === today ? ' today' : '') + (iso === selDay ? ' sel' : '') + (fresh ? ' fresh' : '') + '" data-day="' + iso + '" aria-label="' + esc(dShort(iso)) + (list.length ? ', ' + list.length + ' thing' + (list.length > 1 ? 's' : '') : '') + '"' + (iso === selDay ? ' aria-pressed="true"' : '') + '>' +
        '<span class="ca-num">' + H.parse(iso).getDate() + '</span><span class="ca-dots">' + dots + (list.length > 4 ? '<em>+</em>' : '') + '</span></button>';
    }
    const dayItems = selDay >= from && selDay <= to ? (byDay[selDay] || []) : itemsIn(selDay, selDay);
    const monthName = first.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
    const isThisMonth = y === H.parse(today).getFullYear() && m === H.parse(today).getMonth();
    box.innerHTML =
      '<div class="ca-mhead">' +
        '<button class="hb-btn icon ca-mnav" data-mnav="-1" aria-label="Previous month">‹</button>' +
        '<h2 class="hb-h2 ca-mtitle">' + esc(monthName) + '</h2>' +
        '<button class="hb-btn icon ca-mnav" data-mnav="1" aria-label="Next month">›</button>' +
        (isThisMonth ? '' : '<button class="hb-btn sm ca-mtoday" data-mnav="0">Today</button>') +
      '</div>' +
      '<div class="ca-grid-wrap"><div class="ca-dow">' + ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => '<span>' + d + '</span>').join('') + '</div>' +
      '<div class="ca-grid' + (animDir ? ' slide-' + (animDir > 0 ? 'fwd' : 'back') : '') + '">' + g + '</div></div>' +
      '<div class="ca-legend">' + WHO_ORDER.map((k) => '<span><i style="--who:' + WHO[k].col + '"></i>' + WHO[k].label + '</span>').join('') + '<span><i class="pay"></i>Payday</span><span><i class="due"></i>Baby due</span></div>' +
      '<div class="ca-dayview">' +
        '<div class="ca-dayhead"><h2 class="ca-gh">' + esc(relDay(selDay) === dTiny(selDay) ? H.fmtDate(selDay, { weekday: 'long', day: 'numeric', month: 'long' }) : relDay(selDay) + ' · ' + dShort(selDay)) + '</h2>' +
        '<button class="hb-btn sm primary" data-add-day="' + selDay + '">＋ Add</button></div>' +
        (dayItems.length ? '<ul class="ca-list">' + dayItems.map((it) => rowHtml(it)).join('') + '</ul>' : '<p class="ca-quiet">Nothing on this day. Tap ＋ Add to pop something in.</p>') +
      '</div>';
  };

  const wireSwipe = () => {
    let x0 = null, y0 = 0;
    root.addEventListener('touchstart', (e) => { if (view !== 'month' || !e.target.closest('.ca-grid')) { x0 = null; return; } x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    root.addEventListener('touchend', (e) => {
      if (x0 == null) return;
      const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      x0 = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        const n = dx < 0 ? 1 : -1;
        monthCursor = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + n, 1);
        H.sfx('swap'); drawMonth(n);
      }
    }, { passive: true });
  };

  /* ---------- detail sheet ---------- */
  const dueText = () => {
    if (!H.DUE_DATE || !H.dueIn) return null;
    const d = H.dueIn();
    if (d.days < -14) return null;
    const when = H.fmtDate(H.DUE_DATE, { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '');
    let main;
    if (d.days < 0) main = 'Baby #2’s due date has been and gone 💛';
    else if (d.days === 0) main = 'Baby #2 is due today 💛';
    else if (d.days < 21) main = 'Baby #2 due in ' + d.days + ' day' + (d.days === 1 ? '' : 's');
    else main = 'Baby #2 due in ' + d.weeks + ' weeks';
    return { main, when, short: d.days < 0 ? 'Baby #2 due date passed' : d.days === 0 ? '👶 Baby due today' : '👶 ' + main.replace('Baby #2 due', 'Baby due'), week: d.pregnancyWeek, days: d.days };
  };
  const openDetail = (id, date) => {
    if (id === 'due') {
      const t = dueText();
      H.sfx('tap');
      H.sheet({ title: '👶 Baby due', body: '<div class="hb-stack ca-detail"><p class="ca-d-when">' + esc(H.fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })) + '</p>' +
        (t ? '<p>' + esc(t.main) + (t.days > 0 && t.week > 0 && t.week <= 42 ? ' — Sienna is around week ' + t.week + '.' : '') + '</p>' : '') +
        '<p class="hb-note">Sienna’s due date, added automatically. Babies keep their own schedule — this is just a guide 💛</p></div>' });
      return;
    }
    if (id === 'pay') {
      const f = H.fortnight(date);
      H.sfx('tap');
      H.sheet({ title: '💰 Payday', body: '<div class="hb-stack ca-detail"><p class="ca-d-when">' + esc(H.fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long' })) + '</p><p>Jacob gets paid every second Friday. This starts the <b>' + esc(f.label) + '</b> fortnight.</p><p class="hb-note">Paydays are added automatically — no need to enter them.</p></div>' });
      return;
    }
    const ev = events()[id];
    if (!ev) return;
    H.sfx('tap');
    const wrap = document.createElement('div');
    wrap.className = 'hb-stack ca-detail';
    let sheet;
    const paint = () => {
      const cur = events()[id];
      if (!cur) { sheet.close(); return; }
      const w = WHO[cur.who] || WHO.Family;
      const acks = ackMap()[id] || {};
      const mine = H.me() && acks[H.me()];
      const isRem = cur.kind === 'reminder';
      const done = isRem && isDone(id, date);
      const doneBy = done ? doneMap()[id][date].by : '';
      wrap.style.setProperty('--who', w.col);
      wrap.innerHTML =
        '<div class="ca-d-head">' + whoBadge(cur.who, 'lg') + '<div><p class="ca-d-when">' + esc(H.fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long' })) +
          (cur.time ? ' · ' + esc(fmtTime(cur.time)) + (cur.end ? '–' + esc(fmtTime(cur.end)) : '') : ' · all day') + '</p>' +
          '<p class="ca-d-sub">' + esc(KINDS[cur.kind] ? KINDS[cur.kind].label : 'Event') + ' · ' + (cur.who === 'Family' ? 'Whole family' : 'For ' + esc(w.label)) +
          (REPEAT_SHORT[cur.repeat] ? ' · ↻ ' + esc(REPEATS[cur.repeat].toLowerCase()) : '') + '</p></div></div>' +
        (cur.notes ? '<p class="ca-d-notes">' + esc(cur.notes).replace(/\n/g, '<br>') + '</p>' : '') +
        (isRem ? '<label class="ca-d-tick"><input type="checkbox" class="hb-check" data-d-tick' + (done ? ' checked' : '') + '><span>' + (done ? 'Done' + (doneBy ? ' — ticked by ' + esc(doneBy) : '') : 'Tick when it’s done') + '</span></label>' : '') +
        '<div class="ca-d-acks">' +
          (Object.keys(acks).length ? Object.entries(acks).map(([p, a]) => '<p class="ca-d-ack"><b>👍 ' + esc(p) + '</b>' + (a.msg ? ' “' + esc(a.msg) + '”' : ' got it') + ' <span>' + esc(ago(a.at)) + '</span></p>').join('') : '') +
          (mine
            ? '<button class="hb-btn sm ghost" data-unack>Undo my 👍</button>'
            : cur.by === H.me() ? (Object.keys(acks).length ? '' : '<p class="hb-note">' + esc(other()) + ' can tap 👍 to say ' + (other() === 'Sienna' ? 'she' : 'he') + '’s seen it.</p>')
            : '<div class="ca-ackrow"><input class="hb-input" data-ackmsg maxlength="80" placeholder="Add a note (optional)" aria-label="Note for ' + esc(other()) + '"><button class="hb-btn" data-ack>👍 Got it</button></div>') +
        '</div>' +
        '<p class="hb-note">Added by ' + esc(cur.by === H.me() ? 'you' : (cur.by || 'someone')) + ' ' + esc(ago(cur.at)) + (cur.editedAt && cur.editedAt > (cur.at || 0) + 1000 ? ' · edited by ' + esc(cur.editedBy === H.me() ? 'you' : cur.editedBy) + ' ' + esc(ago(cur.editedAt)) : '') + '</p>' +
        '<button class="hb-btn ca-ics" data-ics>📲 Add to iPhone Calendar</button>' +
        '<p class="hb-note ca-ics-note">This app can’t buzz your phone, but your iPhone Calendar can — it’ll alert you ' + (cur.time ? '1 hour before' : 'at 9am on the day') + '.</p>' +
        '<div class="hb-row big"><button class="hb-btn" data-edit>✏️ Edit</button><button class="hb-btn ghost danger" data-del>Delete</button></div>';
    };
    sheet = H.sheet({ title: (KINDS[ev.kind] || KINDS.event).ic + ' ' + ev.title, body: wrap, onClose: () => off && off() });
    paint();
    const off = H.store.on('calendar', () => { setTimeout(paint, 0); });
    wrap.addEventListener('change', (e) => {
      if (e.target.dataset.dTick != null) { setDone(id, date, e.target.checked); if (e.target.checked) { H.sfx('tick'); H.toast('Ticked off ✓'); } }
    });
    wrap.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const cur = events()[id]; if (!cur) return;
      if (b.dataset.ack != null) { const msg = (wrap.querySelector('[data-ackmsg]').value || '').trim().slice(0, 80); setAck(id, msg ? { at: Date.now(), msg } : { at: Date.now() }); H.sfx('tick'); H.toast(other() + ' will see your 👍'); }
      else if (b.dataset.unack != null) { setAck(id, null); }
      else if (b.dataset.ics != null) { downloadIcs(cur, id); }
      else if (b.dataset.edit != null) { sheet.close(); setTimeout(() => openEditor(id), reduceMotion() ? 0 : 320); }
      else if (b.dataset.del != null) { confirmDelete(id, date, sheet); }
    });
  };

  const confirmDelete = (id, date, parent) => {
    const ev = events()[id]; if (!ev) return;
    const rep = ev.repeat && ev.repeat !== 'none';
    const wrap = document.createElement('div');
    wrap.className = 'hb-stack';
    wrap.innerHTML = '<p>Remove <b>' + esc(ev.title) + '</b> from both phones?</p>' +
      (rep ? '<button class="hb-btn big" data-one>Just ' + esc(dShort(date)) + '</button><button class="hb-btn big danger" data-all>Every repeat</button>' : '<button class="hb-btn big danger" data-all>Yes, delete it</button>') +
      '<button class="hb-btn ghost" data-no>Keep it</button>';
    const s = H.sheet({ title: 'Delete?', body: wrap });
    wrap.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.one != null) { skipOne(id, date); s.close(); parent.close(); H.toast('Skipped ' + dShort(date)); }
      else if (b.dataset.all != null) { deleteEvent(id); s.close(); parent.close(); H.toast('Deleted'); }
      else s.close();
    });
  };

  /* ---------- add / edit sheet ---------- */
  const openEditor = (id, preset) => {
    const old = id ? events()[id] : null;
    const st = old ? Object.assign({}, old) : Object.assign({ title: '', date: H.today(), time: '', end: '', who: 'Family', kind: 'event', repeat: 'none', notes: '' }, preset || {});
    const f = document.createElement('form');
    f.className = 'hb-form ca-form';
    f.noValidate = true;
    const quick = [['Today', H.today()], ['Tomorrow', addIso(H.today(), 1)], [dTiny(nextSat()), nextSat()]];
    f.innerHTML =
      '<label class="hb-field"><span>What’s on?</span><input class="hb-input ca-title-in" name="title" maxlength="80" autocomplete="off" enterkeyhint="done" placeholder="e.g. Dexter’s swim, bin night, midwife"></label>' +
      '<div class="hb-field"><span>Type</span><div class="hb-seg ca-kind">' + Object.entries(KINDS).map(([k, v]) => '<button type="button" class="hb-seg-b" data-kind="' + k + '">' + v.ic + ' ' + v.label.replace('Appointment', 'Appt') + '</button>').join('') + '</div></div>' +
      '<div class="hb-field"><span>When</span><div class="ca-chips" data-quick>' + quick.map(([l, iso]) => '<button type="button" class="ca-chip" data-qd="' + iso + '">' + esc(l) + '</button>').join('') +
        '<input type="date" class="hb-input ca-date-in" name="date" aria-label="Pick a date"></div><p class="ca-date-say" data-say></p></div>' +
      '<div class="hb-field"><span>Time</span><div class="ca-chips"><button type="button" class="ca-chip" data-allday>All day</button>' +
        '<input type="time" class="hb-input ca-time-in" name="time" aria-label="Start time" step="300"><span class="ca-to" data-to-wrap>to <input type="time" class="hb-input ca-time-in" name="end" aria-label="End time (optional)" step="300"></span></div></div>' +
      '<div class="hb-field"><span>Who’s it for?</span><div class="ca-chips ca-whos">' + WHO_ORDER.map((k) => '<button type="button" class="ca-chip ca-whochip" style="--who:' + WHO[k].col + '" data-who="' + k + '">' + whoBadge(k, 'sm') + esc(WHO[k].label) + '</button>').join('') + '</div></div>' +
      '<div class="hb-field"><span>Repeat</span><div class="ca-chips">' + Object.entries(REPEATS).map(([k, v]) => '<button type="button" class="ca-chip" data-rep="' + k + '">' + (k === 'none' ? 'Once' : esc(v.replace('Every ', 'Every '))) + '</button>').join('') + '</div></div>' +
      '<details class="ca-notes"' + (st.notes ? ' open' : '') + '><summary>＋ Add a note</summary><label class="hb-field"><textarea name="notes" maxlength="400" placeholder="Address, what to bring…"></textarea></label></details>' +
      '<p class="hb-err" data-err hidden></p>' +
      '<button class="hb-btn primary big" type="submit">' + (old ? 'Save changes' : 'Add to calendar') + '</button>' +
      (old && old.repeat && old.repeat !== 'none' ? '<p class="hb-note">Changes apply to every repeat.</p>' : '') +
      '<p class="hb-note ca-share-note">' + esc(other()) + ' will see this on ' + (other() === 'Sienna' ? 'her' : 'his') + ' phone straight away.</p>';
    const $ = (s) => f.querySelector(s);
    $('[name=title]').value = st.title || '';
    $('[name=date]').value = st.date;
    $('[name=time]').value = st.time || '';
    $('[name=end]').value = st.end || '';
    $('[name=notes]').value = st.notes || '';

    const paint = () => {
      f.querySelectorAll('[data-kind]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.kind === st.kind)));
      f.querySelectorAll('[data-qd]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.qd === st.date)));
      f.querySelectorAll('[data-who]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.who === st.who)));
      f.querySelectorAll('[data-rep]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.rep === (st.repeat || 'none'))));
      $('[data-allday]').setAttribute('aria-pressed', String(!st.time));
      $('[data-to-wrap]').hidden = !st.time;
      $('[data-say]').textContent = st.date ? H.fmtDate(st.date, { weekday: 'long', day: 'numeric', month: 'long', year: H.parse(st.date).getFullYear() !== H.parse(H.today()).getFullYear() ? 'numeric' : undefined }) : '';
    };
    f.addEventListener('click', (e) => {
      const b = e.target.closest('button[type=button]'); if (!b) return;
      if (b.dataset.kind) st.kind = b.dataset.kind;
      else if (b.dataset.qd) { st.date = b.dataset.qd; $('[name=date]').value = st.date; }
      else if (b.dataset.who) st.who = b.dataset.who;
      else if (b.dataset.rep) st.repeat = b.dataset.rep;
      else if (b.dataset.allday != null) { st.time = ''; st.end = ''; $('[name=time]').value = ''; $('[name=end]').value = ''; }
      H.sfx('tap'); paint();
    });
    f.addEventListener('input', (e) => {
      const n = e.target.name;
      if (n === 'date' && e.target.value) st.date = e.target.value;
      if (n === 'time') st.time = e.target.value;
      if (n === 'end') st.end = e.target.value;
      if (n === 'date' || n === 'time') paint();
    });
    f.addEventListener('change', (e) => { if (e.target.name === 'date' && e.target.value) { st.date = e.target.value; paint(); } if (e.target.name === 'time') { st.time = e.target.value; paint(); } });
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const err = $('[data-err]');
      const title = $('[name=title]').value.trim();
      if (!title) { err.hidden = false; err.textContent = 'Give it a short name first.'; $('[name=title]').focus(); return; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(st.date || '')) { err.hidden = false; err.textContent = 'Pick a day.'; return; }
      const ev = {
        title, date: st.date, who: WHO[st.who] ? st.who : 'Family', kind: KINDS[st.kind] ? st.kind : 'event',
        repeat: REPEATS[st.repeat] ? st.repeat : 'none',
        by: old ? old.by || me() : me(), at: old ? old.at || Date.now() : Date.now()
      };
      const time = $('[name=time]').value, end = $('[name=end]').value;
      if (time) ev.time = time;
      if (time && end && end > time) ev.end = end;
      const notes = $('[name=notes]').value.trim();
      if (notes) ev.notes = notes;
      if (old) { ev.editedBy = me(); ev.editedAt = Date.now(); }
      const nid = id || H.store.id('ev_');
      saveEvent(nid, ev);
      H.sfx(old ? 'tick' : 'win');
      sheet.close();
      H.toast(old ? 'Saved ✓' : 'Added — ' + other() + ' can see it too');
      // bring the new thing into view
      if (view === 'month') { selDay = ev.date; monthCursor = firstOfMonth(H.parse(ev.date)); }
    });
    paint();
    const sheet = H.sheet({ title: old ? '✏️ Edit' : '📅 Add to the calendar', body: f });
    // On desktop focus the title straight away; on phones too (iOS opens keyboard only on user gesture, which this is)
    setTimeout(() => { if (!old) { try { $('[name=title]').focus({ preventScroll: true }); } catch (e) { /* ignore */ } } }, 60);
  };

  /* ---------- home card ---------- */
  const card = (el) => {
    const today = H.today();
    const up = itemsIn(today, addIso(today, 60), { paydays: false }).filter((it) => !(it.ev.kind === 'reminder' && isDone(it.id, it.date)));
    const nowHM = pad(H.now().getHours()) + ':' + pad(H.now().getMinutes());
    const next = up.find((it) => !(it.date === today && it.ev.time && (it.ev.end || it.ev.time) < nowHM));
    const since = storedSeen();
    const fresh = newList(since);
    const acks = newAcks(since);
    let l1;
    if (next) l1 = 'Next: <b>' + esc(next.ev.title) + '</b> · ' + esc(relDay(next.date)) + (next.ev.time ? ' ' + esc(fmtTime(next.ev.time)) : '');
    else l1 = Object.keys(events()).length ? 'Nothing coming up — all clear' : 'Add events &amp; reminders you both can see';
    let l2 = '';
    if (fresh.length) l2 = '<span class="ca-card-new">' + fresh.length + ' new from ' + esc([...new Set(fresh.map(changer))].join(' & ')) + '</span>';
    else if (acks.length) l2 = '<span class="ca-card-new">👍 ' + esc(acks[0].who) + ' saw ' + esc(acks[0].ev.title) + '</span>';
    else { const t = dueText(); if (t) l2 = esc(t.short); }
    el.innerHTML = l1 + (l2 ? '<br>' + l2 : '');
  };

  /* ---------- register ---------- */
  let shown = false;
  H.register({
    id: ID,
    title: 'Calendar',
    emoji: '📅',
    accent: '#7FB8FF',
    tagline: 'Events & reminders for all of us',
    card,
    render,
    init() {
      if (!lsGet(SEEN_KEY(), '')) markSeen(); // first run on this phone: start counting "new" from now
      seenAt = storedSeen();
      if (!H.store) return;
      H.store.on('calendar', (v) => {
        data = v || {};
        Object.entries(events()).forEach(([id, ev]) => { if (ev && typeof ev === 'object') ev._id = id; });
        if (root) draw();
        H.refreshCard(ID);
        // Anything that arrives while the calendar is open counts as seen (but stays highlighted this visit)
        if (shown && H.view === ID) markSeen();
      });
      if (H.store.onStatus) H.store.onStatus(() => { if (root) draw(); });
    },
    onShow() {
      shown = true;
      seenAt = storedSeen();      // highlight things changed since the last visit…
      markSeen();                 // …and clear the home-card badge for next time
      showAllLater = false;
      if (root) draw();
    }
  });
})();
