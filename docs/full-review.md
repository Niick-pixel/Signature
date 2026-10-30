# Signature full review (Phase A)

Branch: `review/full-pass` · Reviewed at commit `df70ba4` · 2026-10-30

Status: Phase A done · **Phase B (10 fixes) done** · Phase C (features 1, 7, 10, 11) in progress.

---

## 0. Safety steps (section 1)

| Step | Result |
|---|---|
| Branch | `review/full-pass` created from `main` @ `df70ba4`. |
| Database location | `lib/paths.ts:17` — `SIGNATURE_DATA_DIR` if set, else `./data`. The installed app asks once and suggests `Documents\Signature Journal` (`electron/data-location.js:21,81`); the portable build uses `data\` beside the .exe (`electron/main.js:54`). **Your real journal is on your PC, not in this cloud sandbox**, so it could not be copied from here. |
| Backup taken | The journals available here (two test copies of 35 trades and the 2,135-trade stress copy) were copied with `VACUUM INTO` (WAL-safe) plus their screenshots to `/home/user/signature-backups/20261030-184303/` (outside the repo). `PRAGMA integrity_check` = ok on all three. |
| Your real DB | Before any Phase B build reaches your PC: Settings → Data → **Back up now** (writes `backups\journal-YYYY-MM-DD-HHMMSS.db` inside the journal folder), **and** copy the whole journal folder to another drive. |
| Edge Engine | `lib/edge/` + `docs/edge-engine.md` exist and are finished through M10. Per instructions the Stats page is **not** redesigned here; Stats findings are bugs only. |

### Baseline

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ pass, 0 errors (3.7 s) |
| `npm test` | ✅ 355/355 pass, 0 skipped (14.5 s). Noise: `ExperimentalWarning: SQLite` per worker. |
| `npm run build` | ✅ pass (6 s). **3 warnings**: "Dynamic filesystem access causes tracing of the whole project" (`app/api/backgrounds/[name]/route.ts:28`). |
| `npm run lint` | ❌ **broken** — `next lint` was removed in Next 16 (`package.json:10`); ESLint is not installed and there is no config. |
| Release size (v0.2.117) | Setup 193 MB · portable 193 MB · zip 254 MB. |
| Page timings, 2,135-trade journal (warm, server) | `/` 12 ms · `/dashboard` 42 ms · `/stats` 106 ms (975 KB) · `/journal` 50–79 ms · `/calendar` 15 ms · others ≤ 12 ms · `/api/trades` 36 ms but **7.4 MB** · `/api/export` 0.4–0.7 s. |

---

## 1. Health report

Severity: **C** critical · **H** high · **M** medium · **L** low.

### 1.1 Correctness

| # | Sev | Where | Finding | Proposed fix |
|---|---|---|---|---|
| C1 | **H** | `components/journal/JournalBook.tsx:17` | "Today" is the **UTC** date. In Costa Rica (UTC−6) after 6 pm it is already tomorrow, so an evening journal page opens on — and saves to — the wrong day. | Use `localDay()` (lib/day.ts). Test with a fake clock at 19:00 local. |
| C2 | **H** | `components/whiteboard/RiskBanner.tsx:31` | Same UTC bug: after 6 pm the banner stops counting today's trades, so the "stop after 2 losses" warning disappears exactly in the evening session review. | `localDay()`; test. |
| C3 | L | `app/calendar/page.tsx:127` | Calendar "today" highlight is UTC → wrong square after 6 pm. | `localDay()`. |
| C4 | L | `components/money/BalanceCard.tsx:54` | A cash event's default date is UTC → an evening deposit defaults to tomorrow. | `localDay()`. |
| C5 | L | `db/screenshots.ts:31-34` | Folder name uses the **local** month, file name the **UTC** date — a chart pasted on the evening of the 31st lands in `2026-10/2026-11-01-….png`. Cosmetic, but confusing when browsing the folder. | Both local. |
| C6 | L | `lib/validate.ts:181` | An undated backtest's placeholder date is `new Date().toISOString()` (UTC), stored with the row. Hidden in the UI, but it is what sorts undated trades. | Local timestamp. |
| C7 | M | `lib/planMatch.ts:40` | `TRADER_UTC_OFFSET_HOURS = -6` is hard-coded. Killzone/macro checks, "logged same day" goals and session news all assume Costa Rica time. Correct today; wrong if you trade while travelling. | Read the machine's offset (`-new Date().getTimezoneOffset()/60`) with an optional override in Settings. |
| C8 | ✅ | `lib/dashboard.ts:6`, `lib/edge/metrics.ts:19` | Dashboard and Stats share one win/loss/BE classifier (`resultClass`) — no conflicting definitions found. | — |
| C9 | ✅ | `tests/roundtrip.test.mts:98` | The trade/JSON round-trip itself is exact for the tables it covers — but see D1 for what it does not cover. | — |

### 1.2 Data integrity

| # | Sev | Where | Finding | Proposed fix |
|---|---|---|---|---|
| D1 | **C** | `app/api/export/route.ts:78-92, 148-190` | **The export ("Export everything") is not a complete backup.** Verified on a test journal: it omits `trade_screenshots` (the Result/HTF/Other charts — rows *and* image files; 9 rows on the test journal), `board_notes`, `board_edges`, `app_settings` (rule settings, weekly focus, news settings, …), `trade_edits` (edit history), `trade_partials`, `playbooks`, `flag_dismissals`. Restoring from an export silently loses them. | Add each table to the payload and `restore*` in `app/api/import/route.ts`; zip every file referenced by `trade_screenshots` too; bump export `version` to 17; extend `roundtrip.test.mts` to assert **every** table (enumerated from `sqlite_master`, so a new table can never be forgotten again). |
| D2 | M | `db/trades.ts:619-651` | Purge (permanent delete) leaves orphans: `trade_screenshots` rows **and their files**, `shot_drawings`, `trade_custom_tags`, `trade_partials`, `predictions`, `blind_grades`. `screenshotStillUsed` checks only `trades.screenshot_path`, so it can also delete a file another trade still shows in its gallery. | Delete the child rows in the same transaction; check both tables before unlinking a file; test. |
| D3 | M | `db/backup.ts`, `db/index.ts:38` | Daily backups: (a) taken only when the DB is first opened — leave the app open for a week and you get one backup; (b) live in the **same folder** as the journal (same disk); (c) do not include screenshots; (d) there is **no restore** in the app. | (a) re-check every hour; (b–d) are feature F7. |
| D4 | L | `db/screenshots.ts:39` | Screenshot written with `writeFileSync` straight to its final name; a crash mid-write leaves a truncated image that the row then points at. | Write `name.tmp`, then `renameSync`. |
| D5 | L | `db/index.ts:30-32` | No `PRAGMA busy_timeout`. The app is single-process, so fine today; a second process (CLI migrate, a backup tool) would get `SQLITE_BUSY` immediately. | `PRAGMA busy_timeout = 3000`. |
| D6 | M (rule) | `db/migrations/006_training_tool.sql:54` and other enum columns | Columns with `CHECK (x IN (...))` (account, slot, …) mean adding a value needs a **table rebuild** — which is how migrations 003–024 were done (DROP + RENAME). That conflicts with the additive-only rule going forward. | New enum-like columns: no `CHECK`; validate in `lib/validate.ts`. Existing ones: leave as they are; to add a value, use a new nullable column rather than a rebuild. |
| D7 | ✅ | `app/api/trades/route.ts:50-70` | Crash mid-save: validation runs before the image is written, and the file is removed if the row fails to insert. The draft (localStorage) survives a crash — **except pasted screenshots** (F4). | — |

### 1.3 Performance

| # | Sev | Where | Finding | Proposed fix |
|---|---|---|---|---|
| P1 | M | build: `app/api/backgrounds/[name]/route.ts:28` | Turbopack traces **the whole project** into the server bundle (3 build warnings) — part of why the installer is 193 MB. | Resolve the path through a constant root (`path.join(BACKGROUNDS_DIR, safeName)` with `/*turbopackIgnore*/` or `outputFileTracingExcludes`); measure installer size before/after. |
| P2 | L | `/api/trades` | Whole journal as one JSON: 7.4 MB at 2,135 trades (your real journal is small, so not felt yet). | Send only board fields; fetch detail on open. Measure. |
| P3 | L | `db/screenshots.ts` | Originals kept at full resolution (thumbnails already exist in `data/thumbs`). | F11 (optional compression, lossless by default). |
| P4 | ✅ | — | All hot queries are indexed (`EXPLAIN QUERY PLAN` checked); the earlier speed pass holds (Stats 0.1 s at 2,135 trades). | — |

### 1.4 Electron security and packaging

| # | Sev | Where | Finding | Proposed fix |
|---|---|---|---|---|
| E1 | **H** | no `proxy.ts` (Next 16's middleware) | **The local server accepts writes from any website.** Verified: a cross-site `POST` with `Origin: https://evil.example` to `/api/tags` returned **201** and created a row. A page open in your normal browser could create, edit or (via form posts) bin trades if it finds the port. | `proxy.ts`: for non-GET requests, refuse when `Origin` is present and is not the app's own `http://127.0.0.1:<port>`. |
| E2 | **H** | same | **DNS rebinding:** requests with a foreign `Host` header are answered — verified `Host: evil.example` → `/api/export` 200 (the whole journal). | `proxy.ts`: refuse any request whose `Host` is not `127.0.0.1:<port>` or `localhost:<port>`. |
| E3 | M | `electron/main.js:339-347` | `setWindowOpenHandler` and `will-navigate` pass **any** URL scheme to `shell.openExternal` (`file:`, `smb:`, custom protocol handlers). | Allow only `https:`, `http:`, `mailto:`. |
| E4 | ✅ | `electron/main.js:313-315`, `electron/preload.js` | `contextIsolation: true`, `nodeIntegration: false`, sandbox on by default, small typed preload; the server binds `127.0.0.1` only. | — |
| E5 | L | — | No Content-Security-Policy header. | Add a CSP in `next.config.ts` headers (`default-src 'self'`; images `self blob: data:`). |
| E6 | L | releases | Unsigned (SmartScreen/Defender friction, documented in the release notes). The repo was renamed to `Niick-pixel/Signature`; installs built before the rename rely on GitHub's redirect for updates. | Note only; signing costs money. |

### 1.5 Code quality

| # | Sev | Where | Finding | Proposed fix |
|---|---|---|---|---|
| Q1 | M | `package.json:10` | Lint is broken (no ESLint, `next lint` removed). | Add `eslint` + `eslint-config-next` flat config; `"lint": "eslint ."`; fix or baseline existing findings. |
| Q2 | L | `components/stats/SuccessView.tsx` (276 lines), `components/whiteboard/Lightbox.tsx` (130) | Dead — imported nowhere. | Delete. |
| Q3 | L | `components/capture/NewTradeForm.tsx` (1,541 lines), `components/whiteboard/Whiteboard.tsx` (1,355), `lib/stats.ts` (1,013), `lib/layout.ts` (693), `lib/domain.ts` (691), `db/trades.ts` (652), `DetailPanel.tsx` (620), `SettingsPanel.tsx` (596), `lib/insights.ts` (590), `electron/main.js` (585) | Over ~400 lines. The form and the board are the risky ones: every change touches a 1,500-line component. | Split the form into Identity / Checklist / Target / Outcome / Words sections, each its own file, with no behaviour change (snapshot-tested). Others as touched. |
| Q4 | M | tests | No tests for: purge, export completeness (D1), the `proxy.ts` guard (E1/E2), the date helpers in client components (C1–C4), `screenshotStillUsed`. | Added with each fix. |

### 1.6 Accessibility and UX

| # | Sev | Where | Finding | Proposed fix |
|---|---|---|---|---|
| A1 | ✅ | `app/globals.css:888` | A global `:focus-visible` ring covers buttons, links, inputs and options. Default-theme contrast passes WCAG AA (faint text 4.9:1 light, 5.5:1 dark). | Check the gray/white themes the same way. |
| A2 | L | `components/whiteboard/DetailPanel.tsx:611` | Screenshot zoom is a `div onClick` — not reachable by keyboard. | `button` with `aria-label`. |
| A3 | L | `app/` | Only `/stats` has a `loading.tsx`; there is one `error.tsx` for the whole app. | Loading states for `/dashboard` and `/journal` (the slower ones). |
| A4 | M | `components/capture/NewTradeForm.tsx:252` | **Rule 3 breach:** a new **Backtest** starts *with* today's date; you must click "No date" every time. That is also why backtests were counting as "trades today" earlier. | Default `undated = true` for new backtests; never fill a date unless you add one. |

### 1.7 Product-rule compliance — decisions only you can make

These are not bugs; they touch your rules and need a call:

| # | Where | Question |
|---|---|---|
| R1 | `components/capture/NewTradeForm.tsx:521`, `lib/types.ts:438,446` | Saving needs a **screenshot**, a **160-character explanation** and a **160-character lesson**, plus 5 choices. "Log it fast" exists but marks the trade as a quick log that Stats leaves out. Your rule "nothing may prevent a trade from being recorded" vs. the quality bar: keep it, lower it for backtests (e.g. 60/60), or make the lesson optional on backtests? |
| R2 | `components/capture/SetupAnatomy.tsx:182` | "Similar past setups — expected +0.30R, win chance 46%" appears before you choose the outcome. You log after close, so it is not a "take this trade" signal, but it *is* a prediction shown during logging. Keep, move to after save, or hide? |
| R3 | `lib/news.ts:131`, `electron/updater.js`, Study links | Network use: ForexFactory calendar pull, GitHub update check, YouTube links in Study. None is telemetry or AI, but "fully local" could mean you want a single **Offline mode** switch. Want one? |
| R4 | `NewTradeForm.tsx:182,303` | Stage starts on **Settled**, Session on **NY AM**, Setup type on **iFVG**, all shown as "still on the default". None is in your rule-5 list, so they are kept. Confirm. |

---

## 2. Workflow friction

Measured with Playwright against a test journal (clicks = every click/selection; typing counted separately). Times are estimated for a person (≈1.5 s per click, ≈4 typed characters a second) — machine time was 10–11 s.

| Flow | Now | Breakdown | Proposed cuts | After |
|---|---|---|---|---|
| **(a) Finished backtest** | **19 clicks + 359 typed chars ≈ 2 min 10 s** (minimum path; ticking the checklist adds ≈ 12 clicks) | New trade › Account ▾ › Backtest › **No date** › paste chart › Direction ▾ › Long › HTF bias ▾ › With bias › Premium/discount ▾ › Discount › Target ▾ › pick › **Reveal outcome** › Win › R › explanation (160+) › lesson (160+) › Save | Undated by default (−1, and fixes A4) · Direction / HTF bias / Premium-discount as tap-chips (−3) · the account is remembered (−2 after the first) · outcome card open by default (−1) · R1 decision on text minimums (≈ −60 s if lowered for backtests). "Save & next" already carries the context. | **12 clicks** (−7) |
| **(b) Finished live trade** | **20 clicks + 359 chars ≈ 2 min 15 s** | Same, plus "Why did you take it" ▾ (2), minus "No date" | Chips (−3) · outcome open (−1) · reason as chips (−1) | **15 clicks** (−5) |
| **(c) Morning check-in + chart prep** | ≈ **32 taps + 3–4 typed fields ≈ 3 min** (from the code: check-in ≈ 5 taps; prep 6 steps × ≈ 4 taps + 6 step moves) | Bias is asked **twice** (check-in "Bias" and prep "HTF bias"); News now fills itself. | Ask bias once and carry it both ways (−1 to −2) · "Same as yesterday" on the zone/liquidity steps when nothing changed · Enter moves to the next step. | ≈ 26 taps |
| **(d) Journal page** | 1 click + typing (autosaves every 0.7 s). **After 6 pm it opens tomorrow's page** (C1), so +2 clicks back to today. | — | Fix C1. | 1 click |
| **(e) Find a past trade by setup type** | Board: Group ▸ Setup (1) › the group (1) › the card (1) = **3 clicks**, or `/` and type. Stats has no setup filter; the board has no target / mistake-tag / rubric filters. | — | Ctrl+K trade finder (setup, target, grade, mistake tag, account, rubric, words) → **1 shortcut + typing**; saved views already exist. | 1 shortcut |

---

## 3. Feature proposals

Effort S = ≤ ½ day, M = 1–2 days, L = 3+ days (scored 1 / 2 / 3). Ranked by impact ÷ effort. "Already there" notes what exists, so nothing is built twice.

| Rank | Feature | Problem it solves | Effort | Impact | Score | Touches rules? |
|---|---|---|---|---|---|---|
| 1 | **Backtest fast lane** | (a) takes 19 clicks; backtests get a date they must not have (A4). Undated default, tap-chips for direction / HTF bias / premium-discount, outcome open by default. | S | 5 | 5.0 | Rule 3 (fixes it), rule 2 (uses chips) |
| 2 | **"Finish these" data-quality panel** | Quick logs, missing key fields, trades graded after the outcome and hindsight-logged misses stay invisible. A list with % and one-click "open". `lib/edge/integrity.ts` and `quality.ts` already compute most of it. | S | 4 | 4.0 | No |
| 3 | **Bias asked once** | Check-in and chart prep both ask for bias; answering one fills the other. | S | 3 | 3.0 | No |
| 4 | **Draft keeps pasted screenshots** | The draft survives a crash, but pasted charts do not (they are only in memory). Keep them in IndexedDB until saved. | S | 3 | 3.0 | No |
| 5 | **Keyboard-first logging** | W/L/B/S for the outcome, 1–5 for chips, Ctrl+Enter to save (exists), Tab order through the chips. | S | 3 | 3.0 | No |
| 6 | **Path "next action" on the Dashboard** | The Path's next step lives on its own tab; one line on the Dashboard ("Next: 7 / 50 graded before outcome"). | S | 3 | 3.0 | No |
| 7 | **Backup you can trust** | Backups sit on the same disk with no screenshots and no restore (D3). Pick a second folder; daily zip of DB + screenshots there; "Restore this backup" in Settings (restores into a new folder first, then switches); hourly re-check. | M | 5 | 2.5 | No |
| 8 | **Weekly review pre-fill** | `/review` exists; pre-fill counts, R, rule breaks, repeated lesson themes (the theme dictionary already exists), the week's best and worst trade. You finish it by hand. | M | 4 | 2.0 | No |
| 9 | **Ctrl+K trade finder** | (e): setup, target type, grade, mistake tag, account, rubric version, words; saved views reuse the board's. | M | 4 | 2.0 | No |
| 10 | **Close the auto-rule gaps** | The rule book already shows auto vs self badges. Add the computer-checkable rules not yet automatic (low confidence at entry, outside killzone with the machine's own offset — C7). | S | 2 | 2.0 | Rule 7 (checks only) |
| 11 | **Screenshot care** | Optional WebP re-encode of new pastes (default off, lossless option), "compare two trades" side by side in the gallery. | M | 3 | 1.5 | No |
| 12 | **Playbook examples** | `/playbook` exists; auto-attach your best A+ examples and worst rule breaks per setup (by grade and R, no predictions). | M | 3 | 1.5 | Rule 6 (examples, not signals) |
| 13 | **Real vs Backtest everywhere** | Dashboard, Stats, Calendar and the board each choose their own default world. One global switch, remembered. | M | 3 | 1.5 | No |
| 14 | **Offline mode** | One switch that stops the news pull and the update check (R3). | S | 2 | 2.0* | Rule 10 |
| 15 | **Editable vocabularies and rubric weights** | Tag groups are editable already; checklist weights per rubric version are code. Editing weights changes grades, so it needs versioning. | L | 2 | 0.7 | Rule 5/6 (grades) |

\* Ranked lower than its score because it depends on your R3 answer.

---

## 4. Top 10 fixes (proposed order for Phase B)

1. **E1 + E2** — `proxy.ts` Host/Origin guard on the local server (high, verified exploitable).
2. **D1** — complete export/import (every table + every screenshot file), `version` 17, test that enumerates all tables (critical).
3. **C1** — Journal "today" in local time (high).
4. **C2** — Risk banner "today" in local time (high).
5. **A4** — new backtests undated by default (rule 3).
6. **D2** — purge cleans every child row and never deletes a shared file (medium).
7. **E3** — `openExternal` only for http/https/mailto (medium).
8. **Q1** — restore linting (ESLint flat config) (medium).
9. **P1** — stop whole-project tracing; measure installer size before/after (medium).
10. **D3a + C3–C6 + D4 + D5** — hourly backup check, remaining date fixes, atomic screenshot writes, busy timeout (low batch).

Skipped for now, with reasons: Q3 (splitting big files — a pure refactor, best done while a feature touches that file), E6 (code signing costs money), P2/P3 (not felt at your journal's size).

---

## 5. Fixed / skipped log

### Phase B — fixes (all on `review/full-pass`)

| Fix | Commit | Test | Before → after |
|---|---|---|---|
| E1+E2 local-server guard (`proxy.ts`) | f93d9ec | `request-guard.test.mts` | cross-site POST 201 → **403**; rebinding `Host` export 200 → **421**; the app unaffected |
| D1 complete export/import, v17, import takes the .zip | 4c1c1a2 | `roundtrip-full.test.mts` (every table from `sqlite_master`) | 8 tables lost rows on restore → **0**; gallery charts restored |
| C1 Journal today (local) | 7ca494b | `local-day.test.mts` (scans for the UTC idiom) | evening page on tomorrow → today |
| C2 Risk banner today (local) | a33b36a | same | banner empty after 6 pm → counts today |
| A4 new backtests undated | d86aaa4 | `startsUndated` test | 1 click ("No date") every backtest → 0 |
| D2 purge cleans children, never a shared file | 629aeeb | `purge.test.mts` | 8 kinds of orphan rows + files → 0 |
| E3 openExternal web/mail only | 8e04192 | `safe-external.test.mts` | any scheme → https/http/mailto |
| Q1 lint restored | 27af87f | `npm run lint` | broken → **0 errors**, 98 warnings (React Compiler advice, unused vars) |
| P1 no whole-project tracing | 8cad2de | standalone server started on an empty journal | build warnings 3 → **0**; server bundle 75.6 MB / 2,906 files → **71.7 MB / 2,439** |
| C3+C4 calendar / cash dates | ebd6706 | UTC scan: 0 offenders | — |
| C5+C6+D4 screenshot names, atomic writes | 43c301c | screenshot test | — |
| D3a+D5 hourly backup check, busy timeout | 655061e | `db-open.test.mts` | one backup per launch → one per day |

Checks after the batch: typecheck ✅ · tests 355 → **369** ✅ · build ✅ (only Node's "SQLite is experimental" notice) · lint 0 errors.
Installer size can only be measured by the Windows CI build; it runs when this branch is merged.

Skipped in Phase B (see section 4): Q3 file splits, E5 CSP, E6 signing, P2/P3, C7 (machine time zone — folded into feature 10).
