# Signature's design language — a prompt to rebuild it anywhere

Paste the section below into another project's instructions (CLAUDE.md, a
system prompt, a design brief). It describes how Signature looks, moves and
behaves, so another app can be built the same way. The values are Signature's
own (`app/globals.css`, `lib/motion.ts`); change the palette, keep the rules.

---

## The prompt

Build the interface in the style below. It is a calm, dense, Apple-like
desktop tool: warm translucent glass on a paper-coloured ground, soft spring
motion, and every screen fits the window. Follow every rule. Where a rule
and a quick solution disagree, the rule wins.

### 1. Principles
- **One screen, no scrolling.** Every form, step and dialog fits the window
  (design for 1920×1080 first, then check 1440×900). If it does not fit,
  compress the layout. Do not add a scrollbar. Lists can scroll inside their
  own box. The page does not scroll.
- **No empty space inside a form.** Columns end level. Spare height goes to
  something that can use it, such as a chart box, a rotating card or a list.
  It never becomes an empty block. When one column is short, rearrange the
  layout before padding it.
- **Taps, not typing.** Each question is a row of tap-chips (a segmented
  control). There are no dropdowns. Free text is used only for explanations
  and lessons. Numbers use small inputs.
- **Fixed sizes.** Content never makes the layout jump. A pasted image fits
  inside its box. A window keeps one size across all its steps. Animate
  height changes with a near-critical spring, or avoid them.
- **Honest, quiet copy.** Write labels in plain English, sentence case and
  short. Each field gets one line of hint behind an ⓘ. Say what is missing
  ("Still to write: R, lesson"). Never block the user. Never use marketing
  tone.
- **The app explains itself.** Derived values are labelled "· derived", and
  guesses are labelled as guesses (in amber). Every number says how many
  items it is based on.

### 2. Colour (tokens, light / dark)
Define every colour as a CSS variable. Write accents and semantic colours as
"r g b" triples, so `rgb(var(--accent) / 0.12)` gives a tint.
- Ground `--bg` #e9e2d4 / #131009 · raised surface `--bg-raised` #f6f1e6 / #1d1811.
- Text `--text` #241b12 / #f3e7d3 · `--text-dim` #54452f / #c0a883 · `--text-faint` #6f5d43 / #9c8767.
- Glass fill `--glass-fill` rgba(255,251,243,.58) / rgba(255,236,205,.06);
  strong rgba(255,252,245,.82) / rgba(255,238,210,.10);
  stroke `--glass-stroke` rgba(88,66,38,.14) / rgba(255,226,178,.15).
- Accent (amber) `--accent` 138 82 5 / 233 166 63, checked for 4.5:1 contrast on the ground.
- Meaning colours, used only for meaning: win 29 122 58, loss 163 43 34,
  amber (a warning, a guess) 154 92 6. Grades run A+ green → F red.
  A rule-break is never shown in green, even when it paid.
- Themes swap tokens only (paper, graphite, sage, terracotta, ledger). No
  component holds a literal colour.

### 3. Surfaces
- **Glass**: a translucent fill, a 1px `--glass-stroke` border, and a 1px
  specular highlight along the top edge only (a `::before` inset line). Use
  no blur by default; the surfaces are translucent, not frosted.
- **Shadows** are always layered, one tight and one soft:
  card `0 1px 2px α.12, 0 6px 16px -8px α.20`, panel `0 2px 6px α.14, 0 40px 88px -24px α.24`.
- **Corners** scale with a `--rk` multiplier: `rounded-[calc(18px*var(--rk))]`.
  Cards use 16–18px, chips 10–14px, dialogs 24–26px, pills are fully round.
- Cards sit on cards only as hairline groups (a border plus the glass fill).
  Do not stack shadows.

### 4. Type
- System UI stack (SF Pro / -apple-system). Each theme may set a display face for headings.
- Scale: title 18–20px semibold, tight tracking. Body 12–13px. Field
  labels 10–10.5px UPPERCASE with tracking 0.07–0.08em in `--text-faint`.
  Fine print 10.5–11.5px.
- Numbers use `tabular-nums`. Grades and results get a large semibold
  numeral (24px) with a small faint caption ("7/8 · v2").

### 5. Controls
- **Segmented / chip group**: a glass container (`p-1`, rounded 14–16px)
  holding options with `flex-[1_0_auto]` that wrap to a second row rather
  than shrink. The selected option is a tinted pill: background
  `rgb(tone / .14)`, text `rgb(tone)`, and an inset 1px ring at `rgb(tone / .35–.4)`.
  The tone is the accent, or a meaning colour (Long green, Short red,
  Premium red, Discount green). A compact variant has equal widths, for
  short labels only. Long labels get a non-compact group.
- **Multi-select**: the same chips with a cap shown in the label
  ("Trigger zone · up to 2"). Options that do not apply are hidden, not
  disabled ("a level taken before the open is not offered"), and the label
  line says why.
- **Field**: an uppercase label, then "· required" with a dot while it is
  unanswered (accent colour). A failed save makes the missing fields flash.
- **Buttons**: primary is a filled accent pill with a semibold label.
  Secondary is a glass pill. Keyboard hints appear as small keycaps
  ("T", "1–9") that light up when their group has focus.
- **Inputs**: glass, rounded 12px, with a placeholder that shows the
  format ("2 or −1").
- **Help**: an ⓘ tooltip with one plain paragraph. It renders at page
  level so a card cannot clip it.

### 6. Layout
- Dialogs and steps are wide, multi-column windows: a header line (title,
  a faint step caption such as "Step 2 of 2 — Outcome", actions on the
  right), a thin context strip, then 2–3 columns, then a footer with the
  status text on the left and the primary action on the right.
- **Shared rows**: twin cards (Scenario A | B) use a CSS subgrid
  (`row-span-N grid grid-rows-subgrid`), so each question sits beside its
  twin and both cards end level.
- Labels sit beside the chips (`grid-cols-[6.5rem_1fr]`) when vertical space
  is short, and above them when it is not.
- Rarely changed context (account, instrument, session) goes into one
  compact chip row in the header strip, not into three form fields.
- A column's leftover height is filled by a flexible element (`flex-1`):
  a chart box, or a card that rotates its contents.

### 7. Motion
Everything is a spring (framer-motion). Nothing fades linearly.
- Baseline `stiffness 340, damping 25` (ζ≈0.68). Snappy `520/30` for
  presses and toggles. Bouncy `420/22.5` for checks and badges. Soft
  `240/21.5` for panels and dialogs. Size `260/30.5` (ζ≈0.95, no overshoot)
  for anything that changes height or width.
- A press scales to about 0.97. The selected pill glides between options
  (shared layoutId). Items enter at opacity 0 and y+6 and spring in. They
  exit at opacity 0 and y−6 over 0.12–0.15s.
- Rotating cards change every ~9s, pause under the pointer, and have dots
  that jump to an item. All items have the same height.
- Respect reduced motion: opacity changes only.

### 8. Content patterns
- **Status lines**: "Still to tap: A: trigger zone, B: kill switch, +2."
  They live in the footer and never push the layout.
- **Derived fields** read like inputs but cannot be tapped
  ("Overnight · derived: Both").
- **Too early states**: a ghost of the chart with one line ("Needs 8 more
  settled trades"). Never show an empty chart.
- **Counts on everything**: every number shows its n ("n 45", "80% −0.18R … +0.37R").
- **Context, never signals**: notes describe what the user did ("Graded A
  before: 5 trades · 2W 2L"). They never tell the user to take a trade.

### 9. Checks before shipping a screen
- Screenshot it at 1920×1080 and 1440×900. Nothing scrolls, columns end
  level, and there are no empty blocks.
- Paste a very tall image and confirm nothing moves.
- Check light and dark themes. Every colour comes from a token.
- Use keyboard only: Tab and arrow keys move, digits pick, Enter confirms, Esc closes (and asks first if anything was entered).
