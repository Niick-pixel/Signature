# Signature — rules for every session

Signature is a local trading journal (Next.js App Router + `node:sqlite`, packaged
as an Electron desktop app) for one trader: NQ/MNQ, DodgysDD's iFVG model.

## Product rules (non-negotiable)

1. **Logged after close.** Trades are logged after they close. No flow may require
   logging before entry. An optional one-click "Lock grade" is fine.
2. **No price inputs.** No entry/stop/target price fields — the screenshot shows
   them. Use tap-chips, dropdowns and small sliders.
3. **Backtests start dated.** A new backtest gets a date (now, editable) so it counts on
   the calendar, the Dashboard and Stats; "No date" stays one click away and is never
   required. Old undated backtests stay undated. (Changed at the trader's request,
   November 2026 — it used to be "backtests have no dates".)
4. **Always available.** Stage, outcome, R, lesson and screenshots are available on
   every account type.
5. **No biased defaults.** Checklist, grade, "followed rules", HTF bias, outcome,
   target and opposing swings all start empty.
6. **No signals.** No setup signals, no "take this trade" suggestions, no
   auto-graded entries. Context and honest stats only.
7. **No rule-breaking on small samples.** Never recommend breaking a written rule
   based on a small sample (the Edge Engine's claim tiers decide what is
   Confirmed).
8. **Design language.** Minimal, Apple-like, liquid glass, soft glowing borders,
   spring animations. No new visual style. Per-widget and per-board customization
   on the Stats dashboard changes design tokens only (accent, radius, glass,
   density, glow, theme, font scale) — never the app's visual language.
9. **Additive migrations only.** Never drop or rename columns. Old trades must
   open, edit and export unchanged. Bump the export `version`
   (`app/api/export/route.ts`) when fields change.
10. **Fully local.** No cloud, no telemetry, no external AI calls.

Also from earlier sessions:

- A journal, not a gatekeeper: contradictions are flagged, never blocked.
- Never colour an effect green if it rewards breaking a rule.
- `./data` is gitignored — never commit trades or screenshots.
- No model identifiers in commits or code.

## Working in this repo

- Typecheck: `npx tsc --noEmit` · Tests: `npm test` (node:test + tsx) · Build: `npm run build`.
- Lint: `npm run lint` (ESLint flat config, `eslint.config.mjs`). 0 errors required; React Compiler rules are warnings.
- Run against a copy of a journal: `SIGNATURE_DATA_DIR=/path/to/copy npx next start -p 3312`.
- Today's date is `localDay()` (lib/day.ts), never `toISOString().slice(0, 10)`.
- Wall clock ↔ UTC/New York goes through `lib/traderZone.ts` (the computer's own zone). Tests pin UTC−6 (tests/setup.mts).
- Rows from `node:sqlite` have a null prototype: copy them (`{ ...row }`) before passing to a client component.
- Stats is a board-based widget dashboard (`lib/dashboard/`, `components/dashboard/stats/`,
  `db/statsBoard.ts`; see "Dashboard" in `docs/edge-engine.md`). Widgets are views over
  `lib/edge/` — never put statistics in a widget. The engine (`lib/edge/`, `db/statsEngine.ts`)
  is correct and tested: report bugs there rather than rewriting it.
- New stats ship as widgets in the registry (`lib/dashboard/catalog.ts`), each with a pure,
  tested `select` and a designed too-early state (`minTrades`).
- Customization changes tokens, never the honesty rules: the "mixed" chip can't be hidden;
  n and the interval can move to a tooltip but never leave a number that claims; semantic
  colours follow meaning whatever the accent; evidence chips appear at every size; no widget
  suggests a trade or breaking a written rule.
- Stats starts with one board (`DEFAULT_BOARDS`); widgets are ranked by usefulness (`TIER`) and a stack holds at most 5 (`MAX_STACK`).
- The morning prep (`lib/prep.ts`, `docs/morning-prep.md`) ends in written plans; the decisions plan match, the plan
  grade and the stop rule read (`draw.side`, `liquidity.wait`, `draw.target`, `session.stop`…) are derived from them —
  keep those keys.
- Saved boards are versioned (`LAYOUT_SCHEMA`, `lib/dashboard/schema.ts`): never break a
  user's layout — migrate it (`WIDGET_RENAMES` for a renamed widget).
