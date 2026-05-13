# BlockBySegment

A Chrome (Manifest V3) extension that limits how long chosen sites can be used
**per time segment of the day**, with a **parent PIN** protecting the settings.

Built for parents who want, say, "1 hour of YouTube per 4‑hour block" — the child
can open and close the site as many times as they like; the extension tracks the
total active time and blocks the site once the segment's budget is spent. The
budget refills at the start of the next segment.

## How it works

- The 24‑hour day is split into **N equal segments**, aligned to midnight:
  - 2 segments → 12h each
  - 4 segments → 6h each (00:00, 06:00, 12:00, 18:00)
  - 6 segments → 4h each
  - 8 segments → 3h each
  - 12 segments → 2h each
- Each limited site has a **budget in minutes per segment**. Time is counted only
  while the site is the **active tab**, the **browser is focused**, and the
  computer **isn't idle** (paused video on a locked screen doesn't burn the budget).
  A tiny heartbeat script runs on limited sites to keep the count accurate to a few
  seconds and to enforce the limit even on single-page apps that don't reload.
- When the running total for the current segment reaches the budget, the site is
  redirected to a block page until the next segment begins. Open tabs are sent to
  the block page immediately.
- The toolbar badge shows the minutes left on the site you're currently looking
  at; desktop notifications warn at 5 minutes and 1 minute remaining.
- A **parent PIN** (4–8 digits, stored only as a salted SHA‑256 hash) is required
  to add/edit/remove sites, pause all blocking, or grant extra time. The popup
  shows a read‑only status to the child. After 5 wrong attempts PIN entry is
  locked, with the lock doubling on each further wrong try (up to 30 minutes).
- The options page shows **recent usage** — active minutes per site per day for
  the last 14 days, including how often a segment's limit was hit.
- Everything is stored locally (`chrome.storage.local`). Nothing leaves the device.

### Honest limitations

A browser extension can't stop a determined child — they can remove the extension,
use another browser, or a guest profile, and the extension isn't active in
Incognito unless you allow it. Pair this with a **supervised Chrome profile /
Google Family Link**, and enable the extension in Incognito too
(`chrome://extensions` → BlockBySegment → Details → "Allow in Incognito").

## Build & install

```bash
npm install
npm run build      # outputs the loadable extension to dist/
# or: npm run watch
```

Then in Chrome:

1. Open `chrome://extensions/`
2. Turn on **Developer mode**
3. **Load unpacked** → select the `dist/` folder
4. Click the extension, open **Settings**, and create a parent PIN.

`npm run typecheck` runs the TypeScript checker.

## Project layout

```
src/
  manifest.json
  background/index.ts     # service worker: time tracking, segment math,
                          #   declarativeNetRequest rules, badge, notifications
  shared/                 # types, segment math, storage, domain utils,
                          #   PIN hashing, message contracts, UI helpers + CSS
  content/heartbeat.ts    # tiny foreground-pinger injected on limited sites
  popup/                  # child status view + PIN-gated quick actions
  options/                # parent settings: site rules, pause, PIN, recent usage
  blocked/                # block page with live countdown + PIN override
build.mjs                 # esbuild bundler -> dist/
icons/                    # toolbar icons (copied into dist/ at build time)
```

## Permissions

- `storage` — save settings and per‑segment usage locally
- `declarativeNetRequest` — redirect over‑budget sites to the block page
- `alarms` — periodic re‑check / segment rollover
- `idle` — don't count time while the computer is idle/locked
- `tabs` — see which site is in the active tab
- `scripting` — inject the heartbeat script on limited sites only
- `notifications` — "5 minutes left" / "1 minute left" warnings
- `host_permissions: <all_urls>` — required for the redirect rules

## License

MIT.
