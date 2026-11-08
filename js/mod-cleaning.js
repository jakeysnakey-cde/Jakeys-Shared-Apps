/* Cleaning — Jacob's weekly cleaning rhythm.
   Every-day jobs, short "break bursts" on WFH days (Mon/Wed/Thu/Fri), a light office day (Tue),
   and the big weekly clean split across Sat + Sun. ADHD-friendly: one obvious next step, short timers, no guilt.
   Store (only the household's changes live there; the default list ships here):
     cleaning/done/<YYYY-MM-DD>/<taskId> = { by, at }            ticked off (either person)
     cleaning/done/<YYYY-MM-DD>/free_<n> = { by, at, name }      a "just 5 minutes" tidy
     cleaning/tasks/<taskId>             = { ...changed fields }  edits to a default task, or a whole custom task ({custom:true,...})
     cleaning/hidden/<taskId>            = { by, at }            hidden from the schedule */
(() => {
  const ID = 'cleaning';
  const ACCENT = '#8BD17C';
  const P = (p) => ID + '/' + p;

  /* ---------- 1. task library ---------- */
  // days: string of JS weekday digits (0 = Sun … 6 = Sat). when: am | any | pm (order within the day).
  const EVERY = '0123456';
  const WFH = '1345';          // Mon, Wed, Thu, Fri
  const OFFICE = '2';          // Tue
  const WEEKEND = '06';
  const ROOMS = {
    Kitchen: '🍽️', Living: '🛋️', Bathroom: '🛁', Toilet: '🚽', Bedrooms: '🛏️', Laundry: '🧺', Dexter: '🧸', 'Whole house': '🏠', Outside: '🗑️'
  };
  const DEFAULTS = [
    // Every day (~21 min, mostly fits around meals)
    { id: 'dish_unload', name: 'Unload the dishwasher', room: 'Kitchen', min: 5, days: EVERY, when: 'am', how: 'Start it while the kettle boils — it’s nearly done before the kettle is.' },
    { id: 'highchair', name: 'Wipe Dexter’s high chair + the floor under it', room: 'Dexter', min: 3, days: EVERY, when: 'any', how: 'Tray into the sink to soak, warm cloth over the seat and straps, quick sweep underneath.' },
    { id: 'benches', name: 'Wipe kitchen benches & stovetop', room: 'Kitchen', min: 3, days: EVERY, when: 'pm', how: 'Clear, spray, then wipe in one direction towards the sink. Done beats perfect.' },
    { id: 'dish_load', name: 'Load & run the dishwasher', room: 'Kitchen', min: 5, days: EVERY, when: 'pm', how: 'After dinner. Anything that won’t fit gets a 1-minute hand wash.' },
    { id: 'reset', name: '5-minute toy & lounge reset', room: 'Living', min: 5, days: EVERY, when: 'pm', how: 'Toys into the basket, cushions back, cups to the kitchen. Stop when the 5 minutes are up.' },

    // Tuesday — office day: everyday jobs + the nappy bin. Bins go out Thursday night (Friday pickup).
    { id: 'bins_out', name: 'Bins out to the kerb', room: 'Outside', min: 3, days: '4', when: 'pm', how: 'Thursday night, ready for Friday morning pickup. Check which bin week it is (recycling or green).' },
    { id: 'nappy_bin', name: 'Empty the nappy bin', room: 'Dexter', min: 2, days: '25', when: 'pm', how: 'Tie off the bag, straight to the outside bin, fresh liner in.' },

    // WFH break bursts (2–10 min each)
    { id: 'wash_start', name: 'Laundry: start a load', room: 'Laundry', min: 3, days: '135', when: 'am', how: 'Mon: Dexter’s clothes · Wed: our clothes · Fri: Dexter’s clothes + bibs & cloths. Start it on your first break.' },
    { id: 'wash_hang', name: 'Laundry: hang it out (or dryer)', room: 'Laundry', min: 8, days: '135', when: 'any', how: 'A podcast episode’s worth. Shake each piece out first — less ironing, never.' },
    { id: 'wash_fold', name: 'Laundry: fold & put away', room: 'Laundry', min: 10, days: '135', when: 'pm', how: 'Fold straight into piles per drawer, then one trip per room.' },
    { id: 'fridge_clear', name: 'Fridge clear-out: old leftovers', room: 'Kitchen', min: 5, days: '1', when: 'any', how: 'Anything from before the weekend goes. Containers straight into the dishwasher.' },
    { id: 'bath_sink', name: 'Wipe the bathroom sink & mirror', room: 'Bathroom', min: 4, days: '1', when: 'any', how: 'One spray, one cloth, mirror last with a dry corner of the cloth.' },
    { id: 'toilet_quick', name: 'Quick toilet clean (bowl + seat)', room: 'Toilet', min: 5, days: '3', when: 'any', how: 'Toilet gel under the rim, wipe the seat and handle while it sits, brush, flush.' },
    { id: 'sweep_kitchen', name: 'Sweep the kitchen floor', room: 'Kitchen', min: 5, days: '3', when: 'any', how: 'Mostly the high-chair zone and in front of the stove.' },
    { id: 'vac_lounge', name: 'Vacuum the lounge (just the middle)', room: 'Living', min: 8, days: '4', when: 'any', how: 'Only the walk-through bits and Dexter’s play area. Edges can wait for Sunday.' },
    { id: 'switches', name: 'Wipe light switches & door handles', room: 'Whole house', min: 4, days: '4', when: 'any', how: 'Walk one lap of the house with a damp cloth. Great for keeping bugs down before the baby.' },
    { id: 'teethers', name: 'Wash Dexter’s teethers & bath toys', room: 'Dexter', min: 5, days: '4', when: 'any', how: 'Hot soapy water in the sink, rinse, leave upside down on a tea towel to dry.' },
    { id: 'microwave', name: 'Wipe out the microwave', room: 'Kitchen', min: 4, days: '4', when: 'any', how: 'Bowl of water + a lemon slice, 2 minutes on high, then everything wipes straight off.' },
    { id: 'small_bins', name: 'Empty the small bins into the big one', room: 'Whole house', min: 5, days: '5', when: 'any', how: 'Bathroom, bedrooms, office. Fresh bag in each as you go.' },
    { id: 'sink_shine', name: 'Shine the kitchen sink & tap', room: 'Kitchen', min: 3, days: '5', when: 'any', how: 'A shiny sink makes the whole kitchen look done. Dry the tap with a tea towel.' },
    { id: 'towels_swap', name: 'Swap hand towels & tea towels', room: 'Laundry', min: 2, days: '5', when: 'any', how: 'Old ones straight into today’s washing load.' },

    // Saturday — wet rooms + kitchen (~74 min). Do it in two sessions.
    { id: 'sat_shower', name: 'Scrub the shower / bath', room: 'Bathroom', min: 15, days: '6', when: 'any', how: 'Spray it first, then go clean the toilet while it soaks — the spray does half the work.' },
    { id: 'sat_toilet', name: 'Clean the toilet properly', room: 'Toilet', min: 10, days: '6', when: 'any', how: 'Inside, seat both sides, outside of the bowl, the base and behind it. Top to bottom.' },
    { id: 'sat_vanity', name: 'Vanity, sink & mirror', room: 'Bathroom', min: 6, days: '6', when: 'any', how: 'Clear the bench into a basket first, wipe, put back only what you use.' },
    { id: 'sat_wetfloor', name: 'Mop bathroom & toilet floors', room: 'Bathroom', min: 8, days: '6', when: 'any', how: 'Last job in the bathroom. Start at the far corner, mop towards the door.' },
    { id: 'sat_strip', name: 'Strip the beds & start the sheets wash', room: 'Bedrooms', min: 5, days: '6', when: 'am', how: 'Do this first thing so the sheets are dry by the afternoon. Dexter’s cot too.' },
    { id: 'sat_beds', name: 'Make the beds with fresh sheets', room: 'Bedrooms', min: 10, days: '6', when: 'pm', how: 'Use the spare set if the first lot isn’t dry yet.' },
    { id: 'sat_stove', name: 'Deep-clean the stovetop & oven door', room: 'Kitchen', min: 12, days: '6', when: 'any', how: 'Hot soapy cloth, let it sit a minute on the stuck bits, then scrape gently.' },
    { id: 'sat_fronts', name: 'Wipe cupboard fronts & appliances', room: 'Kitchen', min: 8, days: '6', when: 'any', how: 'Handles and the bits at toddler height get the most grubby.' },

    // Sunday — floors, dust + reset for the week (~73 min)
    { id: 'sun_vac', name: 'Vacuum the whole house', room: 'Whole house', min: 20, days: '0', when: 'am', how: 'Pick up anything on the floor first (2 minutes, fast), then one room at a time, ending at the door.' },
    { id: 'sun_mop', name: 'Mop the kitchen & living floors', room: 'Whole house', min: 15, days: '0', when: 'any', how: 'After vacuuming. Do it while Dexter is napping or out, so it can dry.' },
    { id: 'sun_dust', name: 'Dust surfaces, TV unit & window sills', room: 'Living', min: 10, days: '0', when: 'any', how: 'Top to bottom, a microfibre cloth is all you need.' },
    { id: 'sun_toys', name: 'Toy sort: wipe & rotate Dexter’s toys', room: 'Dexter', min: 10, days: '0', when: 'any', how: 'Put half the toys away in a tub and swap next week — fewer out means less mess and more interest.' },
    { id: 'sun_towels', name: 'Wash towels & bath mats', room: 'Laundry', min: 5, days: '0', when: 'am', how: 'Hot wash. Start it early so they dry today.' },
    { id: 'sun_towels_fold', name: 'Fold & put the towels away', room: 'Laundry', min: 8, days: '0', when: 'pm', how: 'Roll them — quicker than folding and they fit better.' },
    { id: 'sun_binlids', name: 'Wipe the kitchen bin & bin lids', room: 'Outside', min: 5, days: '0', when: 'any', how: 'Spray, wipe, done. Stops the smell before it starts.' }
  ];
  const DEF = Object.fromEntries(DEFAULTS.map((t) => [t.id, t]));
  const FIELDS = ['name', 'room', 'min', 'days', 'when', 'how'];
  const WHEN_ORDER = { am: 0, any: 1, pm: 2 };
  const WEEK = [1, 2, 3, 4, 5, 6, 0]; // Mon … Sun
  const DSHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const IDEAS = [
    ['Body-double', 'FaceTime a mate (or sit near Sienna) while you each do a 10-minute job. Company makes starting easy.'],
    ['Podcast only while cleaning', 'Save one favourite podcast just for cleaning time, so the jobs come with a treat.'],
    ['One song, one job', 'Race a single song. When it ends, you can stop — no matter what.'],
    ['Caddies where the mess is', 'A small spray + cloth kit in the bathroom and kitchen, so there’s no “go find the stuff” step.'],
    ['Stack it on a habit', 'Wipe the bench while the kettle boils; unload the dishwasher while the coffee brews.'],
    ['Weekend reward', 'Pick a treat for when the big clean is done — a café coffee, a game, a nap. Decide it on Saturday morning.'],
    ['Before & after photo', 'Snap a quick photo of a messy spot before and after. Seeing the change is the reward.'],
    ['Points → wishlist', 'Each job earns a point towards something on the Wishlist. (We could build this.)'],
    ['Nesting list for the baby', 'A one-off list for before the baby arrives: wash the newborn clothes, set up the bassinet, car seat in.'],
    ['Outsource the worst one', 'A robot vacuum or a one-off cleaner for the shower in the last weeks of pregnancy.'],
    ['Work-break reminders', 'A gentle phone reminder at your usual break times that opens “Got 5 minutes?”.']
  ];

  /* ---------- nesting list (one-off, baby #2) ---------- */
  // by: days before the due date (Hub.DUE_DATE). Everything is Jacob's — Sienna rests.
  const NEST = [
    { id: 'n_restkit', name: 'Put together a “Sienna rest kit” by the couch', min: 20, by: 77, how: 'Water bottle, snacks, phone charger, blanket, remote, a pillow for her back. Refill it each weekend.' },
    { id: 'n_pram', name: 'Check the pram & sort the double-pram plan', min: 30, by: 70, how: 'Does the pram still work well? Decide: double pram, a toddler board, or a carrier for the baby.' },
    { id: 'n_dexseat', name: 'Check Dexter’s car seat (size, harness height)', min: 20, by: 70, how: 'He may need the next harness slot or a bigger seat. Make sure both seats fit in the car together.' },
    { id: 'n_cot', name: 'Set up the cot (or plan Dexter’s move to a bed)', min: 60, by: 63, how: 'If Dexter is moving out of the cot, do it well before the baby so it doesn’t feel like a swap.' },
    { id: 'n_book', name: 'Get a big-brother book for Dexter', min: 15, by: 63, how: 'Read it often. Point at babies when you’re out — “you’ll have one of those soon”.' },
    { id: 'n_carer', name: 'Line up who minds Dexter when labour starts', min: 15, by: 63, how: 'A first choice and a back-up, day and night. Save their numbers as favourites.' },
    { id: 'n_nappies', name: 'Stock up on newborn nappies & wipes', min: 20, by: 52, how: 'Watch for half-price weeks. A box of newborn size plus size 1 is plenty to start.' },
    { id: 'n_fridge', name: 'Clean out the fridge & freezer (make room)', min: 30, by: 42, how: 'Use up the freezer so there’s space for the freezer meals.' },
    { id: 'n_routine', name: 'Write down Dexter’s routine for the carer', min: 30, by: 42, how: 'Meals, naps, bedtime, comfort things, favourite songs. One page, stuck on the fridge.' },
    { id: 'n_clothes', name: 'Wash & fold newborn clothes and wraps', min: 45, by: 35, how: 'Gentle wash, no fabric softener. Sort into 0000 and 000 piles.' },
    { id: 'n_nursery', name: 'Deep-clean the nursery corner', min: 45, by: 35, how: 'Vacuum under and behind everything, wipe surfaces, wash the curtains if you can.' },
    { id: 'n_capsule', name: 'Install & check the baby capsule (by 36 weeks)', min: 30, by: 28, how: 'Book a professional fitting check — many are free or cheap. Practise the buckles.' },
    { id: 'n_bag', name: 'Pack the hospital bag (by 36 weeks)', min: 30, by: 28, how: 'Ask Sienna what she wants in it, then you do the packing. Leave it by the front door.' },
    { id: 'n_numbers', name: 'Save hospital & midwife numbers, drive the route', min: 30, by: 28, how: 'Do a practice drive, find the parking and the right entrance at night.' },
    { id: 'n_bassinet', name: 'Set up the bassinet', min: 30, by: 21, how: 'Next to Sienna’s side of the bed. Fitted sheets washed and ready.' },
    { id: 'n_change', name: 'Set up the change table & a nappy caddy', min: 30, by: 21, how: 'One caddy downstairs too: nappies, wipes, cream, a spare onesie.' },
    { id: 'n_freeze', name: 'Cook & freeze 8–10 easy meals', min: 120, by: 14, how: 'Double a few dinners from the meal plan over a couple of weeks and freeze the spare half.' },
    { id: 'n_car', name: 'Clean the car inside & fit both seats', min: 45, by: 14, how: 'Vacuum, clear the boot for the pram, wipes and a spare change of clothes in the glovebox.' }
  ];
  const NEST_DEF = Object.fromEntries(NEST.map((t) => [t.id, t]));
  const dueDate = () => Hub.parse(Hub.DUE_DATE || '2027-02-21');
  const byIso = (daysBefore) => Hub.iso(Hub.addDays(dueDate(), -daysBefore));

  /* ---------- schedule logic ---------- */
  let S = { tasks: {}, hidden: {}, done: {} };
  const read = () => {
    S.tasks = Hub.store.get(P('tasks')) || {};
    S.hidden = Hub.store.get(P('hidden')) || {};
    S.done = Hub.store.get(P('done')) || {};
    S.nest = Hub.store.get(P('nest')) || {};
    S.nestDone = Hub.store.get(P('nestDone')) || {};
    S.rate = +Hub.store.get(P('settings/pointsPerDollar')) || 20;
    S.bonus = Hub.store.get('wishlist/bonus') || {};
  };
  const nestJobs = () => {
    const out = NEST.map((d) => ({ ...d, due: byIso(d.by), ...(S.nest[d.id] || {}), id: d.id, edited: !!S.nest[d.id] }));
    Object.entries(S.nest).forEach(([id, t]) => { if (!NEST_DEF[id] && t && t.custom) out.push({ ...t, id }); });
    return out.filter((t) => !t.removed).map((t) => ({ ...t, min: Math.max(1, Math.round(+t.min || 15)), due: t.due || byIso(14) }))
      .sort((a, b) => a.due.localeCompare(b.due) || a.name.localeCompare(b.name));
  };
  /* points: 1 point per minute of a job (stored on the tick so later edits don't rewrite history) */
  const pointsOf = (id, v) => (v && +v.pts) || (String(id).startsWith('free_') ? 5 : ((task(id) || {}).min || 5));
  const ptsOnDay = (iso) => Object.entries(doneOn(iso)).reduce((n, [id, v]) => n + pointsOf(id, v), 0);
  const points = () => {
    let earned = 0;
    Object.keys(S.done).forEach((iso) => { earned += ptsOnDay(iso); });
    Object.entries(S.nestDone).forEach(([id, v]) => { earned += (v && +v.pts) || (nestJobs().find((t) => t.id === id) || {}).min || 15; });
    const cashed = Object.values(S.bonus).filter((b) => b && b.from === 'cleaning').reduce((n, b) => n + (+b.points || 0), 0);
    return { earned, cashed, balance: Math.max(0, earned - cashed) };
  };
  const dollars = (pts) => Math.floor(pts / S.rate * 100) / 100;
  const norm = (t) => ({ ...t, min: Math.max(1, Math.round(+t.min || 5)), days: String(t.days || '').replace(/[^0-6]/g, ''), when: WHEN_ORDER[t.when] != null ? t.when : 'any', room: ROOMS[t.room] ? t.room : (t.room || 'Whole house') });
  const allTasks = () => {
    const out = DEFAULTS.map((d) => norm({ ...d, ...(S.tasks[d.id] || {}), id: d.id, edited: !!S.tasks[d.id] }));
    Object.entries(S.tasks).forEach(([id, t]) => { if (!DEF[id] && t && t.custom) out.push(norm({ ...t, id })); });
    return out.map((t) => ({ ...t, hidden: !!S.hidden[t.id] }));
  };
  const task = (id) => allTasks().find((t) => t.id === id);
  const dayKind = (wd) => (wd === 0 || wd === 6 ? 'weekend' : wd === 2 ? 'office' : 'wfh');
  const tasksOn = (iso) => {
    const wd = Hub.parse(iso).getDay();
    return allTasks().filter((t) => !t.hidden && t.days.includes(String(wd)))
      .sort((a, b) => (WHEN_ORDER[a.when] - WHEN_ORDER[b.when]) || defIdx(a) - defIdx(b));
  };
  const defIdx = (t) => { const i = DEFAULTS.findIndex((d) => d.id === t.id); return i < 0 ? 999 : i; };
  const doneOn = (iso) => S.done[iso] || {};
  const isDaily = (t) => t.days.length === 7;
  const dayStats = (iso) => {
    const list = tasksOn(iso), d = doneOn(iso);
    const left = list.filter((t) => !d[t.id]);
    return { list, total: list.length, done: list.length - left.length, left, minLeft: left.reduce((s, t) => s + t.min, 0), minTotal: list.reduce((s, t) => s + t.min, 0) };
  };
  const weekDates = () => { // Mon … Sun of the current week
    const now = Hub.now(); const wd = now.getDay();
    const mon = Hub.addDays(now, wd === 0 ? -6 : 1 - wd);
    return WEEK.map((_, i) => Hub.iso(Hub.addDays(mon, i)));
  };
  // Forgiving streak: consecutive days with at least one job done; a single missed day never breaks it.
  const streak = () => {
    const has = (iso) => Object.keys(doneOn(iso)).length > 0;
    let d = Hub.now(), n = 0, miss = 0;
    if (!has(Hub.iso(d))) d = Hub.addDays(d, -1);
    for (let i = 0; i < 400; i++) {
      if (has(Hub.iso(d))) { n++; miss = 0; } else if (++miss > 1) break;
      d = Hub.addDays(d, -1);
    }
    return n;
  };
  const weekWins = () => weekDates().reduce((s, iso) => s + Object.keys(doneOn(iso)).length, 0);

  const me = () => Hub.me() || 'Someone';
  const tick = (iso, id, on) => {
    if (on) Hub.store.set(P('done/' + iso + '/' + id), { by: me(), at: Date.now(), pts: (task(id) || {}).min || 5 });
    else Hub.store.remove(P('done/' + iso + '/' + id));
  };
  const fmtMin = (m) => (m >= 60 ? Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + (m % 60) + ' min' : '') : m + ' min');
  const fmtTime = (ms) => new Date(ms).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }).replace(' ', ' ');
  const daysLabel = (days) => {
    if (days.length === 7) return 'Every day';
    if (days === WFH) return 'WFH days';
    if (days === WEEKEND || days === '60') return 'Weekends';
    return WEEK.filter((w) => days.includes(String(w))).map((w) => DSHORT[w]).join(' · ') || 'No days';
  };
  const PRAISE = ['Nice. One less thing.', 'Done — that counts.', 'Look at you go.', 'Tick! Small wins add up.', 'Sorted.', 'That’s the hard part — starting. Done.'];
  const praise = () => PRAISE[Math.floor(Math.random() * PRAISE.length)];

  /* ---------- home card ---------- */
  const card = (el) => {
    read();
    const iso = Hub.today(), st = dayStats(iso), kind = dayKind(Hub.now().getDay());
    if (!st.total) { el.textContent = 'Nothing scheduled today'; return; }
    if (!st.left.length) { el.innerHTML = '<b>All done today ✓</b> · nice work'; return; }
    if (kind === 'weekend') {
      const big = st.left.filter((t) => !isDaily(t)).reduce((n, t) => n + t.min, 0);
      el.innerHTML = big ? 'Big clean: <b>' + fmtMin(big) + ' left</b>' + (st.done ? ' · ' + st.done + ' done' : '') : 'Big clean done ✓ · <b>' + st.left.length + ' everyday job' + (st.left.length === 1 ? '' : 's') + '</b> left';
    } else if (kind === 'office') {
      const extra = st.left.filter((t) => !isDaily(t)).length;
      el.innerHTML = 'Office day · just the basics' + (extra ? ' + <b>' + extra + ' tiny job' + (extra === 1 ? '' : 's') + '</b> tonight' : '');
    } else {
      el.innerHTML = '<b>' + st.left.length + ' quick job' + (st.left.length === 1 ? '' : 's') + '</b> today' + (st.done ? ' · ' + st.done + ' done' : '');
    }
  };

  /* ---------- page ---------- */
  let goTab = () => {};
  let root = null, tab = 'today', openDay = null, openTip = null, lastIso = null, justTicked = null;
  const panels = {};

  const render = (body) => {
    root = body;
    body.classList.add('cl-root');
    body.innerHTML =
      '<div class="hb-seg cl-tabs" role="tablist">' +
      '<button class="hb-seg-b" role="tab" data-tab="today" aria-selected="true">Today</button>' +
      '<button class="hb-seg-b" role="tab" data-tab="week" aria-selected="false">This week</button>' +
      '<button class="hb-seg-b" role="tab" data-tab="nest" aria-selected="false">Nesting</button>' +
      '<button class="hb-seg-b" role="tab" data-tab="tasks" aria-selected="false">All jobs</button></div>' +
      '<div class="hb-panels"><div class="cl-panel" data-panel="today"></div><div class="cl-panel" data-panel="week" hidden></div><div class="cl-panel" data-panel="nest" hidden></div><div class="cl-panel" data-panel="tasks" hidden></div></div>';
    body.querySelectorAll('[data-panel]').forEach((p) => { panels[p.dataset.panel] = p; });
    const order = ['today', 'week', 'nest', 'tasks'];
    body.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => goTab(b.dataset.tab)));
    goTab = (to) => {
      if (to === tab) return;
      const b = body.querySelector('[data-tab="' + to + '"]');
      Hub.sfx('swap');
      const dir = order.indexOf(to) > order.indexOf(tab) ? 'fwd' : 'back';
      body.querySelectorAll('[data-tab]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
      const from = panels[tab]; tab = to; draw(to);
      Hub.slide(from, panels[to], dir);
    };
    lastIso = Hub.today();
    draw('today');
  };

  const draw = (which) => {
    if (!root) return;
    read();
    if (which === 'today' || !which) drawToday();
    if (which === 'week' || !which) drawWeek();
    if (which === 'nest' || !which) drawNest();
    if (which === 'tasks' || !which) drawTasks();
  };
  const redrawVisible = () => { if (root) { read(); ({ today: drawToday, week: drawWeek, nest: drawNest, tasks: drawTasks })[tab](); } };

  /* one task row (shared by Today and Week) */
  const rowHTML = (t, iso, opts) => {
    const d = doneOn(iso)[t.id];
    const tipOpen = openTip === iso + t.id;
    const who = d ? '<span class="cl-who">✓ ' + Hub.esc(d.by || '') + (d.at ? ' · ' + fmtTime(d.at) : '') + '</span>' : '';
    return '<li class="hb-item cl-item' + (d ? ' done' : '') + (d && justTicked === iso + t.id ? ' cl-pop' : '') + '" data-id="' + t.id + '" data-iso="' + iso + '">' +
      '<input type="checkbox" class="hb-check cl-check" aria-label="' + Hub.esc(t.name) + '"' + (d ? ' checked' : '') + '>' +
      '<button class="cl-name" data-tip aria-expanded="' + tipOpen + '"><span class="hb-item-t">' + Hub.esc(t.name) + '</span>' +
      '<span class="hb-item-s">' + (opts && opts.room ? '' : ROOMS[t.room] ? ROOMS[t.room] + ' ' + Hub.esc(t.room) + ' · ' : '') + t.min + ' min' + (who ? ' ' + who : '') + '</span></button>' +
      (opts && opts.edit ? '<button class="hb-btn sm ghost cl-edit" data-edit aria-label="Edit ' + Hub.esc(t.name) + '">Edit</button>' : '<span class="cl-min" aria-hidden="true">' + t.min + 'm</span>') +
      (tipOpen && t.how ? '<p class="cl-tip">💡 ' + Hub.esc(t.how) + '</p>' : '') +
      '</li>';
  };
  const wireRows = (el) => {
    el.querySelectorAll('.cl-item').forEach((li) => {
      const id = li.dataset.id, iso = li.dataset.iso;
      li.querySelector('.cl-check').addEventListener('change', (e) => {
        const on = e.target.checked;
        li.classList.toggle('done', on);
        if (on) li.classList.add('cl-pop');
        const before = dayStats(iso);
        justTicked = on ? iso + id : null;
        setTimeout(() => { if (justTicked === iso + id) justTicked = null; }, 700);
        tick(iso, id, on);
        if (on) {
          if (before.left.length === 1 && iso === Hub.today()) { Hub.sfx('win'); Hub.toast('Everything’s done for today 🎉 Feet up.'); }
          else Hub.sfx('tick');
        }
      });
      li.querySelector('[data-tip]').addEventListener('click', () => { openTip = openTip === iso + id ? null : iso + id; redrawVisible(); });
      const ed = li.querySelector('[data-edit]'); if (ed) ed.addEventListener('click', () => editTask(id));
    });
  };

  /* ---------- 2. Today ---------- */
  const DAYCOPY = {
    wfh: ['WFH day', 'Short bursts between work — one job per break is plenty.'],
    office: ['Office day', 'Just the essentials tonight. That’s it.'],
    weekend: ['Big clean day', 'Split it into two or three sessions. Stop for snacks.']
  };
  const drawToday = () => {
    const p = panels.today, iso = Hub.today(), now = Hub.now(), wd = now.getDay(), kind = dayKind(wd);
    const st = dayStats(iso), pct = st.total ? Math.round(st.done / st.total * 100) : 0;
    const daily = st.list.filter(isDaily), jobs = st.list.filter((t) => !isDaily(t));
    const sk = streak(), wins = weekWins();
    const extra = Object.entries(doneOn(iso)).filter(([k]) => k.startsWith('free_'));
    let h = '';
    h += '<div class="cl-hero"><div><div class="hb-k">' + DAYCOPY[kind][0] + (kind === 'weekend' ? ' · ' + (wd === 6 ? 'part 1 of 2' : 'part 2 of 2') : '') + '</div>' +
      '<h2 class="hb-h1">' + Hub.esc(Hub.dayName(now)) + '</h2><p class="hb-sub">' + DAYCOPY[kind][1] + '</p></div></div>';
    // progress + the one obvious next step
    h += '<div class="hb-card accent cl-prog"><div class="hb-row between"><div><div class="hb-v sm">' +
      (st.left.length ? st.done + ' of ' + st.total + ' done' : 'All done ✓') + '</div><div class="hb-note">' +
      (st.left.length ? 'About ' + fmtMin(st.minLeft) + ' left' + (kind === 'weekend' ? ' · split over the day' : '') : 'Nothing left today. Go enjoy your people.') +
      '</div></div><div class="cl-pct" aria-hidden="true">' + pct + '%</div></div>' +
      '<div class="hb-progress"><i style="width:' + pct + '%"></i></div>';
    if (st.left.length) {
      h += kind === 'wfh'
        ? '<button class="hb-btn primary big cl-go" data-burst>☕ Got 5 minutes?</button>'
        : kind === 'weekend'
          ? '<button class="hb-btn primary big cl-go" data-burst>✨ Pick a job for me</button>'
          : '<button class="hb-btn primary big cl-go" data-burst>🌙 Start the tiny jobs</button>';
    } else {
      h += '<button class="hb-btn big cl-go" data-free>⏱️ Feeling keen? Just 5 minutes</button>';
    }
    h += '</div>';
    // stats (only positive)
    const pt = points();
    {
      h += '<div class="cl-stats">' + '<button class="hb-chip cl-coin" data-cash>🪙 ' + pt.balance + ' point' + (pt.balance === 1 ? '' : 's') + (pt.balance >= S.rate ? ' · cash in' : '') + '</button>' +
        (wins ? '<span class="hb-chip good">🏆 ' + wins + ' job' + (wins === 1 ? '' : 's') + ' this week</span>' : '') +
        (sk >= 2 ? '<span class="hb-chip accent">🔥 ' + sk + '-day streak</span>' : '') + '</div>';
    }
    // lists
    if (kind === 'weekend') {
      const rooms = {};
      jobs.forEach((t) => { (rooms[t.room] = rooms[t.room] || []).push(t); });
      h += '<section class="cl-sec"><div class="hb-row between"><h3 class="hb-h2">Big clean</h3><span class="hb-note">' + fmtMin(jobs.reduce((s, t) => s + t.min, 0)) + ' total</span></div>';
      Object.keys(rooms).forEach((r) => {
        const list = rooms[r], left = list.filter((t) => !doneOn(iso)[t.id]).reduce((s, t) => s + t.min, 0);
        h += '<div class="cl-room"><div class="cl-room-h"><span>' + (ROOMS[r] || '•') + ' ' + Hub.esc(r) + '</span><span class="hb-note">' + (left ? fmtMin(left) + ' left' : 'done ✓') + '</span></div>' +
          '<ul class="hb-list">' + list.map((t) => rowHTML(t, iso, { room: true })).join('') + '</ul></div>';
      });
      h += '</section>';
    } else if (jobs.length) {
      h += '<section class="cl-sec"><div class="hb-row between"><h3 class="hb-h2">' + (kind === 'office' ? 'Tonight' : 'Break bursts') + '</h3><span class="hb-note">' +
        (kind === 'office' ? 'tiny ones' : '2–10 min each') + '</span></div><ul class="hb-list">' + jobs.map((t) => rowHTML(t, iso)).join('') + '</ul></section>';
    }
    if (daily.length) {
      h += '<section class="cl-sec"><div class="hb-row between"><h3 class="hb-h2">Every day</h3><span class="hb-note">' + fmtMin(daily.reduce((s, t) => s + t.min, 0)) + '</span></div>' +
        '<ul class="hb-list">' + daily.map((t) => rowHTML(t, iso)).join('') + '</ul></section>';
    }
    if (extra.length) {
      h += '<section class="cl-sec"><h3 class="hb-h2">Bonus wins</h3><ul class="hb-list">' + extra.map(([, v]) =>
        '<li class="hb-item done cl-bonus"><span>⭐</span><span class="hb-item-t">' + Hub.esc(v.name || '5-minute tidy') + '<span class="hb-item-s">' + Hub.esc(v.by || '') + (v.at ? ' · ' + fmtTime(v.at) : '') + '</span></span><span></span></li>').join('') + '</ul></section>';
    }
    const nx = nestJobs().find((t) => !S.nestDone[t.id]);
    if (nx) {
      h += '<button class="hb-card tap cl-nextnest" data-gonest><span class="cl-nn-ic" aria-hidden="true">🍼</span><span><span class="hb-k">Next for the baby · whenever suits</span><span class="cl-nn-t">' + Hub.esc(nx.name) + '</span><span class="hb-note">' + nx.min + ' min · by ' + Hub.fmtDate(nx.due, { weekday: 'short', day: 'numeric', month: 'short' }) + '</span></span></button>';
    }
    h += '<p class="hb-note cl-hint">Tap a job for a quick how-to. Either of you can tick it off.</p>';
    h += '<details class="hb-card cl-ideas"><summary><span>💡 Ideas to try</span><span class="hb-note">' + IDEAS.length + ' ideas</span></summary><ul>' +
      IDEAS.map(([t, d]) => '<li><b>' + Hub.esc(t) + '</b> — ' + Hub.esc(d) + '</li>').join('') + '</ul><p class="hb-note">Tell Claude which ones you like and they can be built in.</p></details>';
    const ideasOpen = p.querySelector('.cl-ideas') && p.querySelector('.cl-ideas').open;
    p.innerHTML = h;
    if (ideasOpen) p.querySelector('.cl-ideas').open = true;
    wireRows(p);
    p.querySelector('[data-cash]').addEventListener('click', cashIn);
    const gn = p.querySelector('[data-gonest]'); if (gn) gn.addEventListener('click', () => goTab('nest'));
    const b = p.querySelector('[data-burst]'); if (b) b.addEventListener('click', () => burst(kind === 'wfh' ? 5 : kind === 'weekend' ? 20 : 0));
    const f = p.querySelector('[data-free]'); if (f) f.addEventListener('click', () => burst(5, true));
  };

  /* ---------- the burst / pick-one flow with a gentle timer ---------- */
  let timerT = null;
  const stopTimer = () => { clearInterval(timerT); timerT = null; };
  const burst = (startMin, freeMode) => {
    const iso = Hub.today();
    let budget = startMin || 0;  // 0 = any length
    let skipped = new Set(), cur = null, mode = freeMode ? 'free' : 'pick', tally = 0;
    const wrap = document.createElement('div');
    wrap.className = 'cl-burst';
    const sh = Hub.sheet({ title: freeMode ? '⏱️ Just 5 minutes' : '☕ One job at a time', body: wrap, onClose: () => { stopTimer(); } });
    sh.el.style.setProperty('--accent', ACCENT);
    const pool = () => { read(); return dayStats(iso).left.filter((t) => (!budget || t.min <= budget)).sort((a, b) => isDaily(a) - isDaily(b)); };
    const choose = () => {
      const all = pool(), fresh = all.filter((t) => !skipped.has(t.id));
      const list = fresh.length ? fresh : all;
      if (!fresh.length) skipped = new Set();
      // prefer jobs that fit nicely; light randomness so it doesn't feel like a list
      cur = list.length ? list[Math.floor(Math.random() * Math.min(list.length, 3))] : null;
      if (cur && list.length > 3 && Math.random() < 0.35) cur = list[Math.floor(Math.random() * list.length)];
    };
    const ring = (frac) => { const C = 2 * Math.PI * 52; return '<svg class="cl-ring" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="52" class="cl-ring-bg"/><circle cx="60" cy="60" r="52" class="cl-ring-fg" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + (C * (1 - frac)).toFixed(1) + '"/></svg>'; };
    const musicBtn = () => { const A = window.mpAudio; return A ? '<button class="hb-btn sm ghost" data-music-cl aria-pressed="' + !!A.playing + '">' + (A.playing ? '🎧 Lofi on' : '🎧 Lofi off') + '</button>' : ''; };
    const runTimer = (mins, label) => {
      stopTimer();
      const end = Date.now() + mins * 60000, total = mins * 60000;
      const t = wrap.querySelector('[data-timer]');
      const upd = () => {
        const left = Math.max(0, end - Date.now());
        const s = Math.ceil(left / 1000);
        t.innerHTML = ring(1 - left / total) + '<div class="cl-ring-t"><b>' + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') + '</b><span>' + label + '</span></div>';
        if (!left) { stopTimer(); Hub.sfx('tick'); t.classList.add('cl-timeup'); t.querySelector('span').textContent = 'Time’s up — stop or keep going, both are fine'; }
      };
      upd(); timerT = setInterval(upd, 250);
    };
    const chips = () => '<div class="hb-seg cl-fit" role="group" aria-label="How long have you got?">' +
      [[2, '2 min'], [5, '5 min'], [10, '10 min'], [20, '20 min'], [0, 'Any']].map(([v, l]) => '<button class="hb-seg-b" data-fit="' + v + '" aria-pressed="' + (budget === v) + '">' + l + '</button>').join('') + '</div>';
    const show = () => {
      stopTimer();
      if (mode === 'free') {
        wrap.innerHTML = '<p class="cl-lead">Set a 5-minute timer and tidy <b>anything</b>. When it rings you’re allowed to stop.</p>' +
          '<div class="cl-timer" data-timer></div>' +
          '<div class="hb-row big"><button class="hb-btn primary big" data-free-done>I did a thing ✓</button></div>' +
          '<div class="hb-row between">' + musicBtn() + '<button class="hb-btn sm ghost" data-close-cl>Not now</button></div>';
        runTimer(5, 'just 5 minutes');
      } else if (mode === 'done') {
        wrap.innerHTML = '<div class="cl-yay"><div class="cl-yay-ic" aria-hidden="true">✓</div><p class="hb-h2">' + praise() + '</p><p class="hb-note">' + tally + ' job' + (tally === 1 ? '' : 's') + ' this break.</p></div>' +
          '<div class="hb-row big"><button class="hb-btn big" data-close-cl>Back to work</button><button class="hb-btn primary big" data-next>Another one</button></div>';
      } else {
        choose();
        if (!cur) {
          const anyLeft = (read(), dayStats(iso).left.length);
          wrap.innerHTML = chips() + '<div class="cl-yay"><div class="cl-yay-ic" aria-hidden="true">✨</div><p class="hb-h2">' +
            (anyLeft ? 'Nothing that short left' : 'You’re all done today') + '</p><p class="hb-note">' + (anyLeft ? 'Pick a longer time above, or have a break — you’ve earned it.' : 'Seriously, nice work.') + '</p></div>' +
            '<div class="hb-row big"><button class="hb-btn big" data-free-go>⏱️ Just 5 minutes anyway</button></div>';
        } else {
          wrap.innerHTML = chips() +
            '<div class="cl-job"><div class="hb-k">' + (ROOMS[cur.room] || '') + ' ' + Hub.esc(cur.room) + ' · ' + cur.min + ' min</div><div class="cl-job-t">' + Hub.esc(cur.name) + '</div>' +
            (cur.how ? '<p class="cl-job-how">💡 ' + Hub.esc(cur.how) + '</p>' : '') + '</div>' +
            '<div class="cl-timer" data-timer hidden></div>' +
            '<div class="hb-row big"><button class="hb-btn big" data-start>▶ Start ' + cur.min + '-min timer</button><button class="hb-btn primary big" data-done>Done ✓</button></div>' +
            '<div class="hb-row between"><button class="hb-btn sm ghost" data-skip>↻ Different one</button>' + musicBtn() + '</div>';
        }
      }
      wire();
    };
    const wire = () => {
      wrap.querySelectorAll('[data-fit]').forEach((b) => b.addEventListener('click', () => { budget = +b.dataset.fit; skipped = new Set(); Hub.sfx('tap'); show(); }));
      const on = (sel, fn) => { const el = wrap.querySelector(sel); if (el) el.addEventListener('click', fn); };
      on('[data-start]', (e) => { const t = wrap.querySelector('[data-timer]'); t.hidden = false; e.currentTarget.hidden = true; runTimer(cur.min, 'no rush'); Hub.sfx('tap'); });
      on('[data-done]', () => { tick(iso, cur.id, true); tally++; read(); if (!dayStats(iso).left.length) { Hub.sfx('win'); } else Hub.sfx('tick'); mode = 'done'; show(); });
      on('[data-skip]', () => { skipped.add(cur.id); Hub.sfx('swap'); show(); });
      on('[data-next]', () => { mode = 'pick'; show(); });
      on('[data-free-go]', () => { mode = 'free'; show(); });
      on('[data-free-done]', () => { Hub.store.set(P('done/' + iso + '/free_' + Date.now().toString(36)), { by: me(), at: Date.now(), name: '5-minute tidy', pts: 5 }); tally++; Hub.sfx('win'); mode = 'done'; show(); });
      on('[data-close-cl]', () => sh.close());
      on('[data-music-cl]', (e) => {
        const A = window.mpAudio; if (!A) return;
        if (A.playing) A.stopMusic(); else { A.musicOn = true; A.startMusic(); }
        e.currentTarget.textContent = A.playing ? '🎧 Lofi on' : '🎧 Lofi off'; e.currentTarget.setAttribute('aria-pressed', String(!!A.playing));
      });
    };
    show();
  };

  /* ---------- 3. Week ---------- */
  const drawWeek = () => {
    const p = panels.week, dates = weekDates(), today = Hub.today();
    const KIND = { wfh: 'WFH · bursts', office: 'Office day', weekend: 'Big clean' };
    let tot = 0, dn = 0;
    const cards = dates.map((iso) => {
      const st = dayStats(iso), wd = Hub.parse(iso).getDay(), open = openDay === iso;
      tot += st.total; dn += st.done;
      const pct = st.total ? Math.round(st.done / st.total * 100) : 0;
      const past = iso < today;
      return '<div class="hb-card cl-day' + (iso === today ? ' is-today' : '') + (past ? ' is-past' : '') + (open ? ' open' : '') + '" data-day="' + iso + '">' +
        '<button class="cl-day-h" aria-expanded="' + open + '"><span class="cl-day-n"><b>' + DSHORT[wd] + '</b><span>' + Hub.parse(iso).getDate() + '</span></span>' +
        '<span class="cl-day-m"><span class="cl-day-k">' + KIND[dayKind(wd)] + (iso === today ? ' · today' : '') + '</span>' +
        '<span class="hb-progress thin"><i style="width:' + pct + '%"></i></span>' +
        '<span class="hb-note">' + (st.total ? (st.done === st.total ? 'All ' + st.total + ' done ✓' : st.done + '/' + st.total + ' done · ' + fmtMin(st.minLeft) + ' left') : 'Nothing planned') + '</span></span>' +
        '<svg class="cl-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>' +
        (open ? '<ul class="hb-list cl-day-list">' + st.list.map((t) => rowHTML(t, iso, { edit: true })).join('') + '</ul><button class="hb-btn sm ghost cl-add-day" data-add-day="' + wd + '">＋ Add a job to ' + Hub.dayName(iso) + '</button>' : '') +
        '</div>';
    }).join('');
    p.innerHTML = '<div class="cl-hero"><div><div class="hb-k">Week of ' + Hub.fmtDate(dates[0], { day: 'numeric', month: 'short' }) + '</div><h2 class="hb-h1">This week</h2>' +
      '<p class="hb-sub">' + dn + ' of ' + tot + ' jobs done. Fresh start every Monday.</p></div></div>' +
      '<div class="cl-stats"><span class="hb-chip good">🪙 ' + dates.reduce((n, iso) => n + ptsOnDay(iso), 0) + ' points this week</span><button class="hb-chip cl-coin" data-cash>Balance ' + points().balance + ' · cash in</button></div>' +
      '<div class="cl-week">' + cards + '</div>';
    p.querySelectorAll('.cl-day-h').forEach((b) => b.addEventListener('click', () => { const iso = b.parentElement.dataset.day; openDay = openDay === iso ? null : iso; Hub.sfx('tap'); drawWeek(); }));
    wireRows(p);
    p.querySelector('[data-cash]').addEventListener('click', cashIn);
    p.querySelectorAll('[data-add-day]').forEach((b) => b.addEventListener('click', () => editTask(null, b.dataset.addDay)));
  };

  /* ---------- All jobs + editing ---------- */
  const drawTasks = () => {
    const p = panels.tasks, all = allTasks();
    const groups = [['Every day', (t) => isDaily(t)], ['Weekdays', (t) => !isDaily(t) && /[1-5]/.test(t.days) && !/[06]/.test(t.days)], ['Weekend big clean', (t) => !isDaily(t) && !/[1-5]/.test(t.days)], ['Mixed days', (t) => !isDaily(t) && /[1-5]/.test(t.days) && /[06]/.test(t.days)]];
    const vis = all.filter((t) => !t.hidden), hid = all.filter((t) => t.hidden);
    let h = '<div class="cl-hero"><div><h2 class="hb-h1">All jobs</h2><p class="hb-sub">Change anything — days, times, names. Only your changes are saved, so you can always restore a job.</p></div></div>' +
      '<button class="hb-btn primary big" data-add>＋ Add a job</button>' +
      '<div class="hb-card cl-rate"><div class="hb-row between"><div><div class="hb-k">Points → wishlist</div><div class="hb-note">1 point per minute of cleaning. ' + S.rate + ' points = $1.</div></div>' +
      '<label class="cl-rate-f"><span class="hb-note">points per $1</span><input class="hb-input" type="number" inputmode="numeric" min="1" max="1000" step="1" value="' + S.rate + '" data-rate aria-label="Points per dollar"></label></div></div>';
    groups.forEach(([label, fn]) => {
      const list = vis.filter(fn).sort((a, b) => a.days.localeCompare(b.days) || a.name.localeCompare(b.name));
      const ord = (t) => Math.min(...t.days.split('').map((d) => WEEK.indexOf(+d)));
      list.sort((a, b) => ord(a) - ord(b) || WHEN_ORDER[a.when] - WHEN_ORDER[b.when]);
      if (!list.length) return;
      h += '<section class="cl-sec"><div class="hb-row between"><h3 class="hb-h2">' + label + '</h3><span class="hb-note">' + list.length + ' job' + (list.length === 1 ? '' : 's') + '</span></div><ul class="hb-list">' +
        list.map((t) => '<li class="hb-item cl-trow"><span class="cl-trow-ic" aria-hidden="true">' + (ROOMS[t.room] || '•') + '</span><span class="hb-item-t">' + Hub.esc(t.name) +
          '<span class="hb-item-s">' + daysLabel(t.days) + ' · ' + t.min + ' min' + (t.edited ? ' · edited' : '') + (t.custom ? ' · added by ' + Hub.esc(t.by || '') : '') + '</span></span>' +
          '<button class="hb-btn sm" data-edit="' + t.id + '">Edit</button></li>').join('') + '</ul></section>';
    });
    if (hid.length) {
      h += '<section class="cl-sec"><div class="hb-row between"><h3 class="hb-h2">Hidden</h3><span class="hb-note">not on the schedule</span></div><ul class="hb-list">' +
        hid.map((t) => '<li class="hb-item cl-trow done"><span class="cl-trow-ic" aria-hidden="true">' + (ROOMS[t.room] || '•') + '</span><span class="hb-item-t">' + Hub.esc(t.name) + '<span class="hb-item-s">' + daysLabel(t.days) + '</span></span>' +
          '<button class="hb-btn sm" data-unhide="' + t.id + '">Show again</button></li>').join('') + '</ul></section>';
    }
    p.innerHTML = h;
    p.querySelector('[data-add]').addEventListener('click', () => editTask(null));
    p.querySelector('[data-rate]').addEventListener('change', (e) => {
      const v = Math.round(+e.target.value);
      if (v >= 1 && v <= 1000) { Hub.store.set(P('settings/pointsPerDollar'), v); Hub.toast(v + ' points = $1'); } else e.target.value = S.rate;
    });
    p.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => editTask(b.dataset.edit)));
    p.querySelectorAll('[data-unhide]').forEach((b) => b.addEventListener('click', () => { Hub.store.remove(P('hidden/' + b.dataset.unhide)); Hub.sfx('tick'); Hub.toast('Back on the schedule'); }));
  };

  const editTask = (id, dayHint) => {
    read();
    const t = id ? task(id) : null;
    const isDef = !!(t && DEF[t.id]);
    const v = t ? { ...t } : { name: '', room: 'Kitchen', min: 5, days: dayHint != null ? String(dayHint) : '', when: 'any', how: '' };
    const f = document.createElement('form');
    f.className = 'hb-form cl-form';
    f.innerHTML =
      '<label class="hb-field"><span>Job</span><input class="hb-input" name="name" maxlength="80" required placeholder="e.g. Wipe the oven door"></label>' +
      '<div class="cl-2"><label class="hb-field"><span>Room</span><select name="room">' + Object.keys(ROOMS).map((r) => '<option>' + Hub.esc(r) + '</option>').join('') + '</select></label>' +
      '<label class="hb-field"><span>Minutes</span><select name="min">' + [2, 3, 4, 5, 8, 10, 12, 15, 20, 30, 45, 60].map((m) => '<option value="' + m + '">' + m + ' min</option>').join('') + '</select></label></div>' +
      '<div class="hb-field"><span>Which days</span><div class="cl-days" role="group" aria-label="Days">' + WEEK.map((w) => '<button type="button" class="cl-dayb" data-d="' + w + '">' + DSHORT[w] + '</button>').join('') + '</div>' +
      '<div class="hb-row cl-presets"><button type="button" class="hb-btn sm ghost" data-pre="' + EVERY + '">Every day</button><button type="button" class="hb-btn sm ghost" data-pre="' + WFH + '">WFH days</button><button type="button" class="hb-btn sm ghost" data-pre="' + WEEKEND + '">Weekend</button></div></div>' +
      '<div class="hb-field"><span>When</span><div class="hb-seg" data-when>' + [['am', 'Morning'], ['any', 'Any time'], ['pm', 'Evening']].map(([k, l]) => '<button type="button" class="hb-seg-b" data-w="' + k + '">' + l + '</button>').join('') + '</div></div>' +
      '<label class="hb-field"><span>Quick how-to (optional)</span><textarea name="how" maxlength="240" placeholder="One line that makes it easier to start"></textarea></label>' +
      '<p class="hb-err" data-err hidden></p>' +
      '<button class="hb-btn primary big" type="submit">' + (t ? 'Save' : 'Add job') + '</button>' +
      (t ? '<div class="hb-row between">' + (isDef ? '<button type="button" class="hb-btn sm ghost" data-hide>Hide from schedule</button>' : '<button type="button" class="hb-btn sm ghost danger" data-del>Delete job</button>') +
        (isDef && t.edited ? '<button type="button" class="hb-btn sm ghost" data-restore>Restore original</button>' : '') + '</div>' : '');
    f.name.value = v.name; f.room.value = ROOMS[v.room] ? v.room : 'Whole house';
    if (![...f.min.options].some((o) => +o.value === v.min)) { const o = document.createElement('option'); o.value = v.min; o.textContent = v.min + ' min'; f.min.appendChild(o); }
    f.min.value = String(v.min); f.how.value = v.how || '';
    let days = v.days, when = v.when;
    const paint = () => {
      f.querySelectorAll('[data-d]').forEach((b) => b.setAttribute('aria-pressed', String(days.includes(b.dataset.d))));
      f.querySelectorAll('[data-w]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.w === when)));
    };
    f.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => { const d = b.dataset.d; days = days.includes(d) ? days.replace(d, '') : days + d; Hub.sfx('tap'); paint(); }));
    f.querySelectorAll('[data-pre]').forEach((b) => b.addEventListener('click', () => { days = b.dataset.pre; Hub.sfx('tap'); paint(); }));
    f.querySelectorAll('[data-w]').forEach((b) => b.addEventListener('click', () => { when = b.dataset.w; paint(); }));
    paint();
    const sh = Hub.sheet({ title: t ? 'Edit job' : 'Add a job', body: f });
    sh.el.style.setProperty('--accent', ACCENT);
    const sortDays = (s) => s.split('').sort().join('');
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const err = f.querySelector('[data-err]');
      const nv = { name: f.name.value.trim(), room: f.room.value, min: +f.min.value, days: sortDays(days), when, how: f.how.value.trim() };
      if (!nv.name) { err.hidden = false; err.textContent = 'Give the job a name.'; return; }
      if (!nv.days) { err.hidden = false; err.textContent = 'Pick at least one day.'; return; }
      if (isDef) {
        const d = DEF[t.id], diff = {};
        FIELDS.forEach((k) => { const a = k === 'days' ? sortDays(d[k]) : d[k]; if (String(nv[k]) !== String(a)) diff[k] = nv[k]; });
        if (Object.keys(diff).length) Hub.store.set(P('tasks/' + t.id), { ...diff, by: me(), at: Date.now() });
        else Hub.store.remove(P('tasks/' + t.id));
      } else if (t) {
        Hub.store.set(P('tasks/' + t.id), { ...nv, custom: true, by: t.by || me(), at: t.at || Date.now(), editedBy: me() });
      } else {
        Hub.store.set(P('tasks/' + Hub.store.id('t_')), { ...nv, custom: true, by: me(), at: Date.now() });
      }
      Hub.sfx('tick'); Hub.toast(t ? 'Saved' : 'Added to ' + daysLabel(nv.days)); sh.close();
    });
    const on = (sel, fn) => { const el = f.querySelector(sel); if (el) el.addEventListener('click', fn); };
    on('[data-hide]', () => { Hub.store.set(P('hidden/' + t.id), { by: me(), at: Date.now() }); Hub.toast('Hidden — find it under All jobs › Hidden'); sh.close(); });
    on('[data-del]', () => { Hub.store.remove(P('tasks/' + t.id)); Hub.toast('Deleted'); sh.close(); });
    on('[data-restore]', () => { Hub.store.remove(P('tasks/' + t.id)); Hub.toast('Restored the original'); sh.close(); });
  };

  /* ---------- Nesting tab ---------- */
  const nestGroup = (iso) => { const m = +iso.slice(5, 7); const y = +iso.slice(0, 4); return y < 2027 ? 'Now – December' : m === 1 ? 'January' : 'February (early)'; };
  const drawNest = () => {
    const p = panels.nest, list = nestJobs(), today = Hub.today();
    const di = Hub.dueIn ? Hub.dueIn() : { days: Math.round((dueDate() - Hub.parse(today)) / 864e5) };
    const done = list.filter((t) => S.nestDone[t.id]).length, pct = list.length ? Math.round(done / list.length * 100) : 0;
    const left = list.filter((t) => !S.nestDone[t.id]);
    const nextId = left.length ? left[0].id : null;
    const due = di.days > 13 ? 'Baby due in ' + Math.floor(di.days / 7) + ' weeks' : di.days > 0 ? 'Baby due in ' + di.days + ' day' + (di.days === 1 ? '' : 's') : di.days === 0 ? 'Baby due today' : 'Baby’s here (or very nearly)';
    let h = '<div class="cl-hero"><div><div class="hb-k">Nesting · one-off jobs</div><h2 class="hb-h1">' + due + '</h2><p class="hb-sub">Due ' + Hub.fmtDate(dueDate(), { weekday: 'short', day: 'numeric', month: 'short' }) + '. All yours, Jacob — Sienna’s job is resting.</p></div></div>' +
      '<div class="hb-card accent"><div class="hb-row between"><div class="hb-v sm">' + done + ' of ' + list.length + ' done</div><div class="cl-pct">' + pct + '%</div></div><div class="hb-progress"><i style="width:' + pct + '%"></i></div>' +
      '<div class="hb-note">Do-by dates are just a guide. Each job earns its minutes in points.</div></div>';
    const groups = {};
    list.forEach((t) => { (groups[nestGroup(t.due)] = groups[nestGroup(t.due)] || []).push(t); });
    Object.entries(groups).forEach(([g, items]) => {
      const gd = items.filter((t) => S.nestDone[t.id]).length;
      h += '<section class="cl-sec"><div class="hb-row between"><h3 class="hb-h2">' + g + '</h3><span class="hb-note">' + gd + '/' + items.length + ' done</span></div><ul class="hb-list">' +
        items.map((t) => {
          const d = S.nestDone[t.id], tipOpen = openTip === 'nest' + t.id;
          return '<li class="hb-item cl-item cl-nest' + (d ? ' done' : '') + '" data-nid="' + t.id + '">' +
            '<input type="checkbox" class="hb-check cl-ncheck" aria-label="' + Hub.esc(t.name) + '"' + (d ? ' checked' : '') + '>' +
            '<button class="cl-name" data-ntip aria-expanded="' + tipOpen + '"><span class="hb-item-t">' + Hub.esc(t.name) + '</span><span class="hb-item-s">' +
            (d ? '<span class="cl-who">✓ ' + Hub.esc(d.by || '') + (d.at ? ' · ' + Hub.fmtDate(new Date(d.at), { day: 'numeric', month: 'short' }) : '') + '</span>'
              : 'by ' + Hub.fmtDate(t.due, { weekday: 'short', day: 'numeric', month: 'short' }) + ' · ' + t.min + ' min' + (t.id === nextId ? ' <span class="hb-chip accent">next up</span>' : '')) +
            '</span></button><button class="hb-btn sm ghost cl-edit" data-nedit aria-label="Edit ' + Hub.esc(t.name) + '">Edit</button>' +
            (tipOpen && t.how ? '<p class="cl-tip">💡 ' + Hub.esc(t.how) + '</p>' : '') + '</li>';
        }).join('') + '</ul></section>';
    });
    const removed = NEST.filter((d) => S.nest[d.id] && S.nest[d.id].removed).length;
    h += '<button class="hb-btn big" data-nadd>＋ Add a nesting job</button>' +
      (removed ? '<button class="hb-btn sm ghost" data-nrestore>Bring back ' + removed + ' removed job' + (removed === 1 ? '' : 's') + '</button>' : '');
    p.innerHTML = h;
    p.querySelectorAll('.cl-nest').forEach((li) => {
      const id = li.dataset.nid;
      li.querySelector('.cl-ncheck').addEventListener('change', (e) => {
        const on = e.target.checked; li.classList.toggle('done', on);
        if (on) {
          const t = list.find((x) => x.id === id);
          Hub.store.set(P('nestDone/' + id), { by: me(), at: Date.now(), pts: t ? t.min : 15 });
          if (left.length === 1) { Hub.sfx('win'); Hub.toast('Nest is ready 🍼 Amazing work.'); } else { Hub.sfx('tick'); Hub.toast(praise() + ' +' + (t ? t.min : 15) + ' points'); }
        } else Hub.store.remove(P('nestDone/' + id));
      });
      li.querySelector('[data-ntip]').addEventListener('click', () => { openTip = openTip === 'nest' + id ? null : 'nest' + id; drawNest(); });
      li.querySelector('[data-nedit]').addEventListener('click', () => editNest(id));
    });
    p.querySelector('[data-nadd]').addEventListener('click', () => editNest(null));
    const rb = p.querySelector('[data-nrestore]');
    if (rb) rb.addEventListener('click', () => { NEST.forEach((d) => { if (S.nest[d.id] && S.nest[d.id].removed) Hub.store.remove(P('nest/' + d.id)); }); Hub.toast('Brought back'); });
  };

  const editNest = (id) => {
    read();
    const t = id ? nestJobs().find((x) => x.id === id) : null;
    const isDef = !!(t && NEST_DEF[t.id]);
    const f = document.createElement('form');
    f.className = 'hb-form cl-form';
    f.innerHTML = '<label class="hb-field"><span>Job</span><input class="hb-input" name="name" maxlength="90" required placeholder="e.g. Fit the stair gate"></label>' +
      '<div class="cl-2"><label class="hb-field"><span>Do by</span><input class="hb-input" type="date" name="due" required></label>' +
      '<label class="hb-field"><span>Minutes</span><input class="hb-input" type="number" name="min" inputmode="numeric" min="1" max="600" required></label></div>' +
      '<label class="hb-field"><span>Quick how-to (optional)</span><textarea name="how" maxlength="240"></textarea></label>' +
      '<p class="hb-err" data-err hidden></p><button class="hb-btn primary big" type="submit">' + (t ? 'Save' : 'Add job') + '</button>' +
      (t ? '<div class="hb-row between"><button type="button" class="hb-btn sm ghost danger" data-nrm>Remove job</button>' + (isDef && t.edited ? '<button type="button" class="hb-btn sm ghost" data-nres>Restore original</button>' : '') + '</div>' : '');
    f.name.value = t ? t.name : ''; f.due.value = t ? t.due : byIso(28); f.min.value = t ? t.min : 20; f.how.value = t ? (t.how || '') : '';
    const sh = Hub.sheet({ title: t ? 'Edit nesting job' : 'Add a nesting job', body: f });
    sh.el.style.setProperty('--accent', ACCENT);
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const nv = { name: f.name.value.trim(), due: f.due.value, min: Math.round(+f.min.value), how: f.how.value.trim() };
      const err = f.querySelector('[data-err]');
      if (!nv.name || !/^\d{4}-\d{2}-\d{2}$/.test(nv.due) || !(nv.min > 0)) { err.hidden = false; err.textContent = 'Needs a name, a do-by date and minutes.'; return; }
      if (isDef) {
        const d = NEST_DEF[t.id], diff = {}, base = { ...d, due: byIso(d.by) };
        ['name', 'due', 'min', 'how'].forEach((k) => { if (String(nv[k]) !== String(base[k])) diff[k] = nv[k]; });
        if (Object.keys(diff).length) Hub.store.set(P('nest/' + t.id), { ...diff, by: me(), at: Date.now() }); else Hub.store.remove(P('nest/' + t.id));
      } else Hub.store.set(P('nest/' + (t ? t.id : Hub.store.id('n_'))), { ...nv, custom: true, by: t ? t.by : me(), at: t ? t.at : Date.now() });
      Hub.sfx('tick'); Hub.toast(t ? 'Saved' : 'Added'); sh.close();
    });
    const on = (sel, fn) => { const el = f.querySelector(sel); if (el) el.addEventListener('click', fn); };
    on('[data-nrm]', () => { if (isDef) Hub.store.set(P('nest/' + t.id), { removed: true, by: me(), at: Date.now() }); else Hub.store.remove(P('nest/' + t.id)); Hub.store.remove(P('nestDone/' + t.id)); Hub.toast('Removed'); sh.close(); });
    on('[data-nres]', () => { Hub.store.remove(P('nest/' + t.id)); Hub.toast('Restored the original'); sh.close(); });
  };

  /* ---------- Cash in points for a wish ---------- */
  const cashIn = () => {
    read();
    const pt = points(), amt = dollars(pt.balance);
    const items = Object.entries(Hub.store.get('wishlist/items') || {}).filter(([, it]) => it && !it.bought)
      .sort((a, b) => (+a[1].prio || 2) - (+b[1].prio || 2) || String(a[1].name).localeCompare(String(b[1].name)));
    const wrap = document.createElement('div');
    wrap.className = 'cl-burst cl-cash';
    const sh = Hub.sheet({ title: '🪙 Cash in for a wish', body: wrap });
    sh.el.style.setProperty('--accent', ACCENT);
    let h = '<div class="cl-cash-top"><div class="hb-v">' + pt.balance + ' <span class="cl-cash-u">points</span></div><div class="hb-note">= <b>' + Hub.money(amt) + '</b> at ' + S.rate + ' points per $1 · ' + pt.earned + ' earned so far</div></div>';
    if (!items.length) {
      h += '<div class="hb-empty"><b>No wishes yet</b>Add something you’re saving for on the Wishlist, then come back to cash in.</div><button class="hb-btn primary big" data-gowish>Go to the Wishlist</button>';
    } else if (amt < 0.01) {
      h += '<div class="hb-empty"><b>Not enough points yet</b>Every minute of cleaning is a point. Tick a few jobs and come back.</div>';
    } else {
      h += '<div class="hb-field"><span>Put it towards…</span><div class="cl-wishes" role="radiogroup">' + items.map(([id, it], i) =>
        '<button type="button" class="cl-wish" role="radio" aria-checked="' + (i === 0) + '" data-wid="' + Hub.esc(id) + '"><span class="cl-wish-e" aria-hidden="true">' + Hub.esc(it.emoji || '🎁') + '</span><span class="cl-wish-t">' + Hub.esc(it.name || 'Wish') + '</span><span class="hb-note">' + (it.price ? Hub.money0(+it.price) : '') + '</span></button>').join('') + '</div></div>' +
        '<p class="hb-note">This is real money: move <b>' + Hub.money(amt) + '</b> into savings when you cash in.</p>' +
        '<button class="hb-btn primary big" data-cash-go>Add ' + Hub.money(amt) + ' to this wish</button>';
    }
    wrap.innerHTML = h;
    let pick = items.length ? items[0][0] : null;
    wrap.querySelectorAll('[data-wid]').forEach((b) => b.addEventListener('click', () => { pick = b.dataset.wid; wrap.querySelectorAll('[data-wid]').forEach((x) => x.setAttribute('aria-checked', String(x === b))); Hub.sfx('tap'); }));
    const gw = wrap.querySelector('[data-gowish]'); if (gw) gw.addEventListener('click', () => { sh.close(); setTimeout(() => Hub.go('wishlist'), 320); });
    const go = wrap.querySelector('[data-cash-go]');
    if (go) go.addEventListener('click', () => {
      read();
      const now = points(), a = dollars(now.balance);
      if (!pick || a < 0.01) return;
      const used = Math.round(a * S.rate); // only spend the points that make whole cents
      const it = items.find(([id]) => id === pick);
      Hub.store.set('wishlist/bonus/' + Hub.store.id('cb_'), { item: pick, amount: Math.round(a * 100) / 100, points: used, from: 'cleaning', by: Hub.me() || 'Someone', at: Date.now() });
      Hub.sfx('win'); Hub.toast(Hub.money(a) + ' added to ' + ((it && it[1].name) || 'your wish') + ' 🎉');
      sh.close();
    });
  };

  /* ---------- register ---------- */
  Hub.register({
    id: ID,
    title: 'Cleaning',
    emoji: '🧽',
    accent: ACCENT,
    tagline: 'Today’s jobs, a few minutes at a time',
    card,
    render,
    onShow() {
      if (!root) return;
      if (lastIso !== Hub.today()) { lastIso = Hub.today(); openDay = null; openTip = null; }
      draw();
    },
    init() {
      Hub.store.on(ID, () => { Hub.refreshCard(ID); if (root) redrawVisible(); }, { now: false });
      Hub.store.on('wishlist/bonus', () => { if (root && tab !== 'tasks') redrawVisible(); }, { now: false });
    }
  });

  // exposed for tests / other menus (read-only helpers)
  Hub.cleaning = { DEFAULTS, tasksOn: (iso) => { read(); return tasksOn(iso); }, dayStats: (iso) => { read(); return dayStats(iso); }, streak: () => { read(); return streak(); }, points: () => { read(); return points(); }, nest: () => { read(); return nestJobs(); } };
})();
