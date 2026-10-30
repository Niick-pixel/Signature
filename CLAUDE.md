# Signature — rules for every session

Signature is a local trading journal (Next.js App Router + `node:sqlite`, packaged
as an Electron desktop app) for one trader: NQ/MNQ, DodgysDD's iFVG model.

## Product rules (non-negotiable)

1. **Logged after close.** Trades are logged after they close. No flow may require
   logging before entry. An optional one-click "Lock grade" is fine.
2. **No price inputs.** No entry/stop/target price fields — the screenshot shows
   them. Use tap-chips, dropdowns and small sliders.
3. **Backtests have no dates.** Never require or add a date for a backtest trade.
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
   spring animations. No new visual style.
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
- `npm run lint` is broken on Next 16 (`next lint` was removed) — see docs/full-review.md.
- Run against a copy of a journal: `SIGNATURE_DATA_DIR=/path/to/copy npx next start -p 3312`.
- Today's date is `localDay()` (lib/day.ts), never `toISOString().slice(0, 10)`.
- The Stats page / `lib/edge/` (Edge Engine, `docs/edge-engine.md`) has its own plan;
  report bugs there rather than redesigning it.
