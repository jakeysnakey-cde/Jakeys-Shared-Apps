# How a menu (module) plugs into the app

The app is a no-build static site (GitHub Pages, iPhone home-screen app). Each menu is **one JS file** `js/mod-<id>.js` plus **one CSS file** `css/mod-<id>.css`, both already linked from `index.html` (CSS: add your `<link>` line right after `css/hub.css` — the integrator will do it if you don't). Do **not** edit `index.html`, `js/hub.js`, `js/store.js`, `css/hub.css` or another team's files. Wrap your JS in an IIFE. No external libraries, no CDN, no network calls (the app must work offline). Vanilla JS, ES2020, must run on iOS Safari 16+.

## Register

```js
Hub.register({
  id: 'cleaning',            // one of: cleaning | budget | wishlist | calendar
  title: 'Cleaning',
  emoji: '🧽',
  accent: '#8BD17C',         // your colour; available in your CSS as var(--accent)
  tagline: 'fallback home-card text',
  card(el) { /* fill the home-menu card summary: 1–2 short lines, may use <b>. Keep it tiny. */ },
  render(body) { /* build your whole page into `body` (called once, the first time the page opens) */ },
  onShow() { /* optional: every time the page is opened */ },
  init() { /* optional: runs at startup, before render (e.g. subscribe to keep card fresh) */ }
});
```
The hub gives your page a header with a **Home** back button and the live-sync pill, then calls `render(body)`. Call `Hub.refreshCard('<id>')` whenever your home-card summary would change (e.g. inside a `Hub.store.on` subscription).

Assigned accents: cleaning `#8BD17C` (avocado), budget `#FFD36E` (butter), wishlist `#FF8FB1` (pink), calendar `#7FB8FF` (sky). Meals uses `#FF6A4D`.

## Shared data: `Hub.store` (live-synced between Jacob's and Sienna's phones)

Everything you save must go through `Hub.store`, under your own top-level key (`cleaning/…`, `budget/…`, `wishlist/…`, `calendar/…`). It is saved on the phone and, when the household is connected, synced live to the other phone through Firebase.

```js
Hub.store.get('calendar/events')              // deep copy of the value (or undefined)
Hub.store.set('calendar/events/' + id, obj)   // write (null deletes)
Hub.store.update('cleaning/done/2026-11-09', { t_toilets: 'Jacob' })  // patch several children at once
Hub.store.remove(path)
const off = Hub.store.on('calendar', (value) => redraw(value)) // called now + on every local OR remote change at/under/over the path
Hub.store.id('ev_')                            // unique id
```
Rules: store **objects keyed by id, never arrays** of editable items (two people editing different items must not clobber each other). Write at the smallest path that changed (`calendar/events/<id>`, not the whole `calendar`). Keys may not contain `. $ # [ ] /`. Dates as `YYYY-MM-DD` strings. Add `by: Hub.me()` and `at: Date.now()` on things people create, so the other person can see who added what. Re-render from the `on` callback — remote changes arrive there too. Seed/default content that ships with the app should live in your JS (constants), with only the household's changes in the store.

## Helpers

- `Hub.me()` → `'Jacob'` or `'Sienna'` (who holds this phone). `Hub.PEOPLE`.
- `Hub.now()` (use instead of `new Date()` — tests fake it), `Hub.today()` → `'2026-11-08'`, `Hub.parse(iso)`, `Hub.iso(date)`, `Hub.addDays(d,n)`, `Hub.fmtDate(d, opts)`, `Hub.dayName(d)`.
- `Hub.fortnight(date?)` → `{ payday, nextPayday, end, daysLeft, daysIn, label, key, index }`. Jacob is paid every second Friday; anchor payday **Fri 6 Nov 2026**. Budgets/savings are **per pay fortnight**; `key` (payday ISO) is a good store key per fortnight.
- `Hub.DUE_DATE` = `'2027-02-21'` (Sienna's due date, baby #2) and `Hub.dueIn()` → `{days, weeks, pregnancyWeek}`.
- `Hub.money(n)` → `$1,234.56`, `Hub.money0(n)` → `$1,235`, `Hub.esc(str)` HTML-escape (always escape user text).
- `Hub.toast(msg)`, `Hub.sfx('tap'|'tick'|'open'|'close'|'enter'|'swap'|'win')` soft sounds (respect user's toggle automatically).
- `Hub.sheet({ title, body, wide, onClose })` → `{ el, body, close }` — bottom sheet on phones, window on desktop. Use for add/edit forms.
- `Hub.slide(fromEl, toEl, 'fwd'|'back')` — smooth slide between two panels inside your page (wrap both in `<div class="hb-panels">`).

## Shared CSS (css/hub.css) — use these before writing your own

`hb-h1 hb-h2 hb-sub hb-note hb-k hb-v hb-v.sm hb-good hb-warn hb-bad hb-stack hb-row hb-row.between hb-cols hb-stats hb-card hb-card.accent hb-card.tap hb-btn hb-btn.primary hb-btn.ghost hb-btn.sm hb-btn.big hb-btn.icon hb-fab hb-seg + hb-seg-b[aria-pressed] hb-chip(.accent/.good/.warn/.bad) hb-list hb-item(.done) hb-item-t hb-item-s hb-check(checkbox) hb-progress>i hb-progress.thin hb-form hb-field>span+input/select/textarea hb-input hb-err hb-empty hb-panels`

Palette vars: `--plum` page bg, `--oat` text, `--mute` secondary text, `--glass` card bg, `--line` borders, `--avo` green, `--but` yellow, `--tom` red/orange, `--accent` your colour, `--disp` rounded display font.
Prefix all your own classes with your id (`.cl-`, `.bg-`, `.wl-`, `.ca-`). Style: clean, calm, friendly, ADHD-friendly — big tap targets (≥44px), one clear next action, short text, generous spacing, gentle motion only (and none under `prefers-reduced-motion`). Phone first (390×844), but must look good on desktop too. The bottom tab bar covers the last ~80px on phones — leave `padding-bottom` room.

## Testing

Serve: `cd /home/claude/family-feast && python3 -m http.server 8765` (already running on port 8765).
Smoke test + screenshot at iPhone size: `cd /home/claude/hubtest && NODE_PATH=$(npm root -g) node smoke.js <id> /tmp/<id>.png` then view the PNG. Write your own Playwright scripts in `/home/claude/hubtest/<id>/` (chromium at `/usr/bin/google-chrome`, `NODE_PATH=$(npm root -g)`). Check: no page errors, data persists after reload, two browser contexts sharing localStorage is NOT how sync works — just verify your writes land in `Hub.store` at sensible paths.
