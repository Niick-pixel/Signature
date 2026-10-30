import { aggregate, byReason, leakPairs } from './stats';
import { BACKTEST_REASON, REASONS, countsInStats, isBacktest, isHypothetical, type Reason } from './domain';
import type { Trade } from './types';
import type { Aggregate } from './stats';

export const NODE_W = 208;
export const NODE_H = 152;

const GAP_X = 34;
const GAP_Y = 30;
const PAD = 30;
const HEADER_H = 96;
const CLUSTER_GAP = 60;
/** Clusters wrap onto a new row past this width, when nothing better is known. */
const BOARD_W = 2100;
/**
 * Floor for cluster width. With the header on two rows the label no longer
 * competes with the stats, so this only has to fit the stats row — measured at
 * 315px for the widest group, plus the header's own 28px of padding a side.
 */
const MIN_CLUSTER_W = 380;

/**
 * The width the board is arranged to, in board pixels at 100%.
 *
 * Fixed on purpose. The board used to measure the window and re-pack to fit
 * it, which meant anything that changed the window's size in CSS pixels —
 * resizing it, or Ctrl +/- zoom — rebuilt the arrangement and moved groups
 * between rows. An arrangement that shuffles when you zoom is not one you can
 * learn, so this depends on the trades alone. 2300 is a 2560-wide screen with
 * a margin each side, which is the screen this is used on: at 100% the whole
 * width is in view and the board only ever scrolls downwards.
 */
export const BOARD_ROOM = 2300;

/**
 * How many cards a group shows before the rest become a stack.
 *
 * Six fills a 3x2 grid exactly, which is why it is six. Past that the newest
 * five stay on the board and everything older collapses into one tile with a
 * count — a group of forty rendered as forty cards is not information, it is a
 * wall, and the two you care about are the two you just took.
 */
export const VISIBLE_PER_CLUSTER = 6;


/**
 * What the board groups by.
 *
 * Reason is the default and the reason this screen exists, but the same
 * clustering answers different questions: grouped by mistake tag it shows
 * which error repeats, by month it shows whether any of this is improving.
 */
export const GROUP_MODES = [
  'reason', 'mistake', 'grade', 'setup', 'target', 'month', 'timeline',
] as const;
export type GroupMode = (typeof GROUP_MODES)[number];

/**
 * Where a dragged group's nudge is stored: per grouping, and per account
 * when the board shows just one.
 *
 * The same group can sit in two different grids — the Backtest replay group
 * is the last of five on All and the only one on Backtest — and an offset
 * made in one, applied to the other, threw the group off the screen. Each
 * view now keeps its own arrangement. All keeps the old key, so arrangements
 * made before this survive.
 */
/**
 * How far past the edge of the board a nudge can carry a group.
 *
 * A stored nudge outlives the grid it was made in: the grid repacks when a
 * filter hides groups or a trade arrives, and a nudge that was sensible there
 * can throw the group thousands of pixels away — counted in the title, but
 * nowhere you would think to look. Far enough to arrange the board however
 * you like; never far enough to lose a group.
 */
export const MAX_STRAY = 600;

export function offsetSlot(mode: GroupMode, key: string, account: string = 'All'): string {
  return account === 'All' ? `${mode}::${key}` : `${mode}@${account}::${key}`;
}

export const GROUP_LABELS: Record<GroupMode, string> = {
  reason: 'Reason',
  mistake: 'Mistake',
  grade: 'Grade',
  setup: 'Setup',
  target: 'Target',
  month: 'Month',
  timeline: 'Timeline',
};

export interface PositionedTrade {
  trade: Trade;
  x: number;
  y: number;
  reason: Reason;
  /**
   * Identifies this PLACEMENT, not the trade.
   *
   * Grouping by mistake puts a trade with three tags in three clusters, which
   * is the whole point of that view — you want to see every trade each error
   * touched. But the board keyed its nodes by trade id, so the three copies
   * collided and React Flow kept one and dropped the rest: two of the three
   * clusters were quietly missing the card that put them there.
   */
  key: string;
}

/** The trade behind a placement key. */
export function tradeIdFromKey(key: string): string {
  const at = key.lastIndexOf('::');
  return at === -1 ? key : key.slice(at + 2);
}

export interface PositionedCluster {
  /** The group's own label — a reason, a tag, a month. */
  key: string;
  /** Hue for the cluster. Reason keeps its identity colour; others cycle. */
  accent: string;
  reason: Reason;
  stats: Aggregate;
  x: number;
  y: number;
  width: number;
  height: number;
  trades: Trade[];
  /** The nudge actually applied — a stored one, clamped (see MAX_STRAY). */
  nudge: { dx: number; dy: number };
}

/**
 * The tile that stands in for the cards a group is not showing.
 *
 * Carries the ids rather than the trades: the board only needs a count to
 * draw it, and the viewer that opens on click reads the trades it already has.
 */
export interface PositionedStack {
  key: string;
  x: number;
  y: number;
  accent: string;
  hidden: string[];
}

export interface BoardLayout {
  clusters: PositionedCluster[];
  nodes: PositionedTrade[];
  stacks: PositionedStack[];
  /** Chains through each reason cluster. */
  reasonEdges: Array<[string, string]>;
  /** Dashed cross-cluster edges: same target type, both lost. */
  leakEdges: Array<[string, string]>;
  /**
   * The width the grid ASKED for, before anything was dragged.
   *
   * Cluster regions are drawn around where their cards actually ended up, so
   * their bounding box shifts every time a single card moves a pixel. Anything
   * anchored to that box — the board title was — drifts on every drag, which
   * reads as the whole board being unstable. This is the arrangement the
   * layout laid out, and it only changes when the groups themselves do.
   */
  nominalWidth: number;
  /** The title card's centre: above the grid, or the middle of an orbit. */
  hub?: { x: number; y: number };
}

/**
 * Three across, always: six cards make two rows of three.
 *
 * The shape used to be chosen per board — a group could come out as one row
 * of six to save height — so the same group looked different from one visit
 * to the next. A fixed 3x2 reads the same every time: newest top left, the
 * stack (when there is one) bottom right.
 */
export const GROUP_COLS = 3;

function clusterGrid(count: number, scale: number) {
  const cols = Math.max(1, Math.min(count, GROUP_COLS));
  const rows = Math.ceil(count / cols);
  const w = NODE_W * scale;
  const h = NODE_H * scale;
  return {
    cols,
    rows,
    width: Math.max(MIN_CLUSTER_W, cols * w + (cols - 1) * GAP_X + PAD * 2),
    height: HEADER_H + rows * h + (rows - 1) * GAP_Y + PAD,
  };
}

/**
 * Lays clusters out worst-first — the reason costing you the most R lands
 * top-left, where you look first. That placement is the entire argument for
 * this screen existing.
 */
interface BoardGroup { key: string; reason: Reason; accent: string; stats: Aggregate; trades: Trade[] }

/**
 * Buckets the trades for whichever mode the board is in.
 *
 * A trade with three mistake tags appears in three clusters under 'mistake' —
 * that is correct and deliberate: the point of grouping by mistake is to see
 * every trade each error touched, not to force one label per trade.
 */
/** The group missed setups get when they share the board with taken trades. */
export const MISSED_GROUP = 'Missed setups';

/**
 * Backtests and missed setups share a board with real trades only as groups
 * of their own.
 *
 * On All accounts, every backtest goes in one group and every missed setup
 * in another, whatever the grouping — so a replayed win or a setup that never
 * happened never sits in, or moves the total of, a real cluster. Shown on
 * their own (one account), they are grouped like any other trades.
 */
function withBacktestsApart(trades: Trade[], mode: GroupMode): BoardGroup[] {
  const backtests = trades.filter((t) => isBacktest(t.account));
  const missed = trades.filter((t) => isHypothetical(t.account));
  const rest = trades.filter((t) => !isBacktest(t.account) && !isHypothetical(t.account));
  // Shown on their own, backtests or missed setups group like any trades.
  if (rest.length === 0 && (backtests.length === 0 || missed.length === 0)) return groupsFor(trades, mode);
  const apart = (key: string, list: Trade[]): BoardGroup[] => (list.length === 0 ? [] : [{
    key, reason: key as Reason, accent: key === MISSED_GROUP ? 'var(--amber)' : reasonAccent(key as Reason),
    stats: aggregate(list.filter(countsInStats)), trades: list,
  }]);
  return [
    ...groupsFor(rest, mode),
    // Last, so they sit after the real groups rather than among them.
    ...apart(BACKTEST_REASON, backtests),
    ...apart(MISSED_GROUP, missed),
  ];
}

function groupsFor(trades: Trade[], mode: GroupMode): BoardGroup[] {
  if (mode === 'reason') {
    return byReason(trades)
      .sort((a, b) => a.stats.totalR - b.stats.totalR)
      .map((g) => ({
        key: g.key, reason: g.key, accent: reasonAccent(g.key), stats: g.stats, trades: g.trades,
      }));
  }

  const buckets = new Map<string, Trade[]>();
  const put = (key: string, t: Trade) => {
    const list = buckets.get(key) ?? [];
    list.push(t);
    buckets.set(key, list);
  };

  for (const t of trades) {
    if (mode === 'mistake') {
      if (t.mistake_tags.length === 0) put('No mistake tagged', t);
      else for (const tag of t.mistake_tags) put(tag, t);
    } else if (mode === 'grade') {
      put(t.grade_letter, t);
    } else if (mode === 'setup') {
      put(t.setup_type, t);
    } else if (mode === 'target') {
      put(t.target_type, t);
    } else {
      // An undated backtest has no month; it gets a group of its own, last.
      put(t.undated ? 'Undated' : t.date.slice(0, 7), t);
    }
  }

  return [...buckets]
    .map(([key, list], i) => ({
      key,
      // The nodes keep their own reason hue; the cluster takes a cycled one so
      // adjacent regions stay distinguishable.
      reason: list[0].reason,
      accent: `var(--reason-${i % 12})`,
      stats: aggregate(list.filter(countsInStats)),
      trades: list,
    }))
    .sort((a, b) => (mode === 'month' ? a.key.localeCompare(b.key) : a.stats.totalR - b.stats.totalR));
}

/** Lays the regions out in rows, wrapping past `wrapWidth`. Pure geometry. */
function pack(sizes: Array<{ width: number; height: number }>, wrapWidth: number) {
  const at: Array<{ x: number; y: number }> = [];
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  let width = 0;

  for (const size of sizes) {
    if (x > 0 && x + size.width > wrapWidth) {
      x = 0;
      y += rowHeight + CLUSTER_GAP;
      rowHeight = 0;
    }
    at.push({ x, y });
    x += size.width + CLUSTER_GAP;
    rowHeight = Math.max(rowHeight, size.height);
    width = Math.max(width, x - CLUSTER_GAP);
  }

  return { at, width, height: y + rowHeight };
}

/** Every group at its fixed shape, packed to the board's width. */
function bestPack(counts: number[], scale: number) {
  const grids = counts.map((n) => clusterGrid(n, scale));
  return { ...pack(grids, BOARD_ROOM), grids };
}

/** Groups come to rest on this grid, so a hand-made arrangement still lines up. */
export const SNAP = 20;
/** And never closer than this to the next group. */
const SETTLE_GAP = 24;

export const snapTo = (n: number) => Math.round(n / SNAP) * SNAP;
/*
  Snapping a push has to round the way the push is going.

  Rounding to nearest undid the correction: a group pushed clear to 824 was
  snapped back to 820, four pixels inside the neighbour it had just been moved
  out of, and the next pass computed the same four pixels and snapped back
  again — it never converged and the drop stayed overlapping.
*/
const clearUpTo = (n: number) => Math.ceil(n / SNAP) * SNAP;
const clearDownTo = (n: number) => Math.floor(n / SNAP) * SNAP;

export interface Rect { x: number; y: number; width: number; height: number }

/**
 * Where a dragged group actually comes to rest.
 *
 * Dropping a group used to put it exactly where the pointer let go, which
 * meant it could land squarely on top of another one — the board's own
 * arrangement is careful about not overlapping and then hands you the ability
 * to undo that with one careless drag, with nothing but "Tidy up" (which
 * discards every other nudge too) to get out of it.
 *
 * So it snaps to a grid, and if it lands on something it moves to the nearest
 * spot that is clear of EVERY group — the smallest correction that makes the
 * drop legal, rather than a rearrangement you did not ask for.
 *
 * (It used to push out of one neighbour at a time. Between two close groups
 * that ping-ponged — out of one and into the next — and after its passes ran
 * out it gave up still overlapping. The nearest clear spot always sits flush
 * against some group's edge, so those edges are the only places worth trying.)
 */
export function settle(moved: Rect, others: Rect[]): { x: number; y: number } {
  const x0 = snapTo(moved.x);
  const y0 = snapTo(moved.y);
  const w = moved.width;
  const h = moved.height;
  const clearAt = (x: number, y: number) => others.every((o) => x >= o.x + o.width + SETTLE_GAP
    || x + w <= o.x - SETTLE_GAP || y >= o.y + o.height + SETTLE_GAP || y + h <= o.y - SETTLE_GAP);
  if (clearAt(x0, y0)) return { x: x0, y: y0 };

  // Flush against each group's sides, rounded the way that keeps it clear.
  const xs = new Set([x0]);
  const ys = new Set([y0]);
  for (const o of others) {
    xs.add(clearDownTo(o.x - SETTLE_GAP - w));
    xs.add(clearUpTo(o.x + o.width + SETTLE_GAP));
    ys.add(clearDownTo(o.y - SETTLE_GAP - h));
    ys.add(clearUpTo(o.y + o.height + SETTLE_GAP));
  }
  let best: { x: number; y: number; d: number } | null = null;
  for (const x of xs) {
    for (const y of ys) {
      const d = Math.hypot(x - x0, y - y0);
      if ((best === null || d < best.d) && clearAt(x, y)) best = { x, y, d };
    }
  }
  if (best) return { x: best.x, y: best.y };
  // Nowhere flush is free (it cannot really happen): under everything.
  const floor = Math.max(...others.map((o) => o.y + o.height));
  return { x: x0, y: clearUpTo(floor + SETTLE_GAP) };
}

/* ───────────── arrangements ─────────────
  Where the groups sit. "grid" is the packed rows the board always had; the
  others are presets that put every group in a zone, symmetrically, and keep
  the board's own order inside each zone. Groups are ranked by how many trades
  they hold (ties keep their order), so big groups sit together and small,
  less-used ones stick together. Hand nudges still apply on top, remembered
  per arrangement.
*/
export const ARRANGEMENTS = ['grid', 'orbit', 'sizes', 'columns'] as const;
export type Arrangement = (typeof ARRANGEMENTS)[number];
export const ARRANGEMENT_LABEL: Record<Arrangement, string> = { grid: 'Grid', orbit: 'Orbit', sizes: 'Big → small', columns: 'Columns' };
export const ARRANGEMENT_HINT: Record<Arrangement, string> = {
  grid: 'Rows, in the board\'s order.',
  orbit: 'Around the title: the biggest groups left and right, the next below, the smallest in a row on top.',
  sizes: 'Centred rows, the biggest groups first.',
  columns: 'Big groups stacked on the left, the smaller ones packed on the right.',
};
/** The title card is 300 × 130; `hub` is its centre. */
const HUB_W = 300; const HUB_H = 130;

interface Placement { at: Array<{ x: number; y: number }>; hub: { x: number; y: number }; box: { minX: number; minY: number; maxX: number; maxY: number } }

/** Rows of the given groups (indices), each row centred on x = 0, starting at y = top. */
function centredRows(idx: number[], grids: Array<{ width: number; height: number }>, maxW: number, top: number, at: Array<{ x: number; y: number }>, alignBottom = false): number {
  let y = top; let row: number[] = []; let w = 0;
  const flush = () => {
    if (!row.length) return;
    const h = Math.max(...row.map((i) => grids[i].height));
    let x = -w / 2;
    for (const i of row) { at[i] = { x, y: alignBottom ? y + h - grids[i].height : y }; x += grids[i].width + CLUSTER_GAP; }
    y += h + CLUSTER_GAP; row = []; w = 0;
  };
  for (const i of idx) {
    const gw = grids[i].width;
    if (row.length && w + CLUSTER_GAP + gw > maxW) flush();
    w += (row.length ? CLUSTER_GAP : 0) + gw; row.push(i);
  }
  flush();
  return y - CLUSTER_GAP;
}

function boxOf(at: Array<{ x: number; y: number }>, grids: Array<{ width: number; height: number }>) {
  return {
    minX: Math.min(...at.map((a) => a.x)), minY: Math.min(...at.map((a) => a.y)),
    maxX: Math.max(...at.map((a, i) => a.x + grids[i].width)), maxY: Math.max(...at.map((a, i) => a.y + grids[i].height)),
  };
}

export function arrange(kind: Arrangement, grids: Array<{ width: number; height: number }>, sizes: number[]): Placement | null {
  const n = grids.length;
  if (kind === 'grid' || n === 0) return null;
  // Biggest first; equal sizes keep the board's order.
  const ranked = sizes.map((v, i) => i).sort((a, b) => sizes[b] - sizes[a] || a - b);
  const inOrder = (xs: number[]) => [...xs].sort((a, b) => a - b);
  const at: Array<{ x: number; y: number }> = new Array(n);
  const G = CLUSTER_GAP;

  if (kind === 'orbit') {
    const sideN = Math.min(n, n <= 3 ? 2 : 2 * Math.max(1, Math.round(n / 5)));
    const rest = n - sideN;
    const bottomN = rest >= 2 ? Math.max(1, Math.floor(rest / 3)) : rest;
    const sides = ranked.slice(0, sideN);
    const left = sides.filter((_, i) => i % 2 === 0); const right = sides.filter((_, i) => i % 2 === 1);
    const column = (ids: number[], side: -1 | 1) => {
      const h = ids.reduce((a, i) => a + grids[i].height, 0) + G * Math.max(0, ids.length - 1);
      let y = -h / 2;
      for (const i of inOrder(ids)) {
        at[i] = { x: side < 0 ? -HUB_W / 2 - G * 2 - grids[i].width : HUB_W / 2 + G * 2, y };
        y += grids[i].height + G;
      }
    };
    column(left, -1); column(right, 1);
    const sideTop = Math.min(-HUB_H / 2, ...sides.map((i) => at[i].y));
    const sideBottom = Math.max(HUB_H / 2, ...sides.map((i) => at[i].y + grids[i].height));
    const span = Math.max(1600, ...sides.map((i) => Math.abs(at[i].x) + grids[i].width) .map((v) => v * 2));
    const bottom = inOrder(ranked.slice(sideN, sideN + bottomN));
    const top = inOrder(ranked.slice(sideN + bottomN));
    centredRows(bottom, grids, span, sideBottom + G * 2, at);
    if (top.length) {
      // Measure the top rows, then place them so their last row ends just above the hub and the sides.
      const tmp: Array<{ x: number; y: number }> = [];
      const h = centredRows(top, grids, span, 0, tmp, true);
      centredRows(top, grids, span, sideTop - G * 2 - h, at, true);
    }
    return { at, hub: { x: 0, y: 0 }, box: boxOf(at, grids) };
  }

  if (kind === 'sizes') {
    centredRows(ranked, grids, BOARD_ROOM, 0, at);
    return { at, hub: { x: 0, y: -135 }, box: boxOf(at, grids) };
  }

  // columns: the biggest third stacked on the left, the rest packed on the right.
  const bigN = Math.max(1, Math.ceil(n / 3));
  const big = inOrder(ranked.slice(0, bigN)); const small = inOrder(ranked.slice(bigN));
  const bigW = Math.max(...big.map((i) => grids[i].width));
  let y = 0;
  for (const i of big) { at[i] = { x: bigW - grids[i].width, y }; y += grids[i].height + G; }
  if (small.length) {
    const rightW = Math.max(900, BOARD_ROOM - bigW - G * 2);
    const p = pack(small.map((i) => grids[i]), rightW);
    small.forEach((i, k) => { at[i] = { x: bigW + G * 2 + p.at[k].x, y: p.at[k].y }; });
  }
  const box = boxOf(at, grids);
  return { at, hub: { x: (box.minX + box.maxX) / 2, y: -135 }, box };
}

/** The offset slot of a group under an arrangement: hand nudges are kept per arrangement. */
export const arrangedKey = (key: string, kind: Arrangement) => (kind === 'grid' ? key : `${key}#${kind}`);

export function computeLayout(
  trades: Trade[],
  scale = 1,
  mode: GroupMode = 'reason',
  /** Per-group nudges, keyed `${mode}::${key}`. See db/boardlayout.ts. */
  offsets: Record<string, { dx: number; dy: number }> = {},
  /** The account the board is showing; see offsetSlot. */
  account: string = 'All',
  /** Where the groups sit (see arrange). */
  arrangement: Arrangement = 'grid',
): BoardLayout {
  // The timeline is a running total of R: real trades only, unless the
  // board is showing nothing but backtests.
  if (mode === 'timeline') {
    const real = trades.filter((t) => !isBacktest(t.account) && !isHypothetical(t.account));
    return timelineLayout(real.length ? real : trades, scale);
  }
  const groups = withBacktestsApart(trades, mode);

  const clusters: PositionedCluster[] = [];
  const nodes: PositionedTrade[] = [];
  const stacks: PositionedStack[] = [];
  const reasonEdges: Array<[string, string]> = [];

  const nodeW = NODE_W * scale;
  const nodeH = NODE_H * scale;

  // Sized for what is actually drawn: up to five cards plus a stack tile.
  const counts = groups.map((g) => Math.min(g.trades.length, VISIBLE_PER_CLUSTER));
  const packed = bestPack(counts, scale);
  const grids = packed.grids;
  const nominalWidth = packed.width;
  // A preset puts each group in its zone; the grid keeps the packed rows.
  const placed0 = arrange(arrangement, grids, groups.map((g) => g.trades.length));
  const base = placed0?.at ?? packed.at;
  const bounds = placed0?.box ?? { minX: 0, minY: 0, maxX: nominalWidth, maxY: packed.height };
  const hub = placed0 ? placed0.hub : { x: nominalWidth / 2, y: -135 };

  groups.forEach((group, index) => {
    const grid = grids[index];
    const cursorX = base[index].x;
    const cursorY = base[index].y;

    /*
      Newest first, and placed on an exact grid.

      Both halves of this used to be wrong. Cards were scattered by up to 26px
      "organically", and pinned drag positions were honoured on top of that, so
      a group of two could render as two cards overlapping each other — the
      board looked broken because it was being told to look loose. Placement is
      now entirely the layout's job: same gaps everywhere, nothing to nudge out
      of alignment, nothing to tidy up after.
    */
    const stored = offsets[offsetSlot(mode, arrangedKey(group.key, arrangement), account)] ?? { dx: 0, dy: 0 };
    const stray = MAX_STRAY * scale;
    const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));
    const originX = clamp(cursorX + stored.dx, bounds.minX - stray, bounds.maxX + stray - grid.width);
    // The title sits 200 above the first row; a group may go up there too.
    const originY = clamp(cursorY + stored.dy, bounds.minY - stray - 200 * scale, bounds.maxY + stray - grid.height);
    const nudge = { dx: originX - cursorX, dy: originY - cursorY };

    const ordered = [...group.trades].sort((a, b) => b.date.localeCompare(a.date));
    const shown = ordered.length > VISIBLE_PER_CLUSTER
      ? ordered.slice(0, VISIBLE_PER_CLUSTER - 1)
      : ordered;
    const hidden = ordered.slice(shown.length);
    const placed: PositionedTrade[] = [];

    shown.forEach((trade, i) => {
      const col = i % grid.cols;
      const row = Math.floor(i / grid.cols);
      placed.push({
        trade,
        reason: trade.reason,
        key: `${group.key}::${trade.id}`,
        x: originX + PAD + col * (nodeW + GAP_X),
        y: originY + HEADER_H + row * (nodeH + GAP_Y),
      });

      // Between placements, not between trades: the same pair of trades can be
      // adjacent inside two different mistake clusters and each chain is its
      // own line.
      if (i > 0) reasonEdges.push([placed[i - 1].key, placed[i].key]);
    });

    // The stack takes the slot after the last visible card.
    if (hidden.length > 0) {
      const i = shown.length;
      stacks.push({
        key: group.key,
        x: originX + PAD + (i % grid.cols) * (nodeW + GAP_X),
        y: originY + HEADER_H + Math.floor(i / grid.cols) * (nodeH + GAP_Y),
        accent: group.accent,
        hidden: hidden.map((t) => t.id),
      });
    }

    nodes.push(...placed);

    /*
      The region is the grid, because the grid is now the only thing placing
      anything. It used to be derived from where the cards actually were, which
      was necessary while they could be dragged and is exactly what made the
      enclosure jump a pixel whenever one moved.
    */
    const x = originX;
    const y = originY;
    const { width, height } = grid;

    clusters.push({
      key: group.key, accent: group.accent, reason: group.reason,
      stats: group.stats, x, y, width, height, trades: group.trades, nudge,
    });

  });

  // Leak lines join losses within one world: a replayed loss is not the same leak.
  const leakEdges = [
    ...leakChains(trades.filter((t) => !isBacktest(t.account) && !isHypothetical(t.account))),
    ...leakChains(trades.filter((t) => isBacktest(t.account))),
  ];
  return { clusters, nodes, stacks, reasonEdges, leakEdges, nominalWidth, hub };
}

/** How far one R moves a card up or down in the timeline. */
const TIMELINE_R = 0.55 * NODE_H;

/**
 * Timeline: the equity curve made of the trades themselves.
 *
 * Every trade taken, oldest to newest along x, raised or lowered by the R the
 * account had reached after it — so the line through the cards IS the equity
 * curve, and every point on it is a chart you can open. Passed and planned
 * setups have no R to stand at and are left out. Heights are shifted so the
 * highest point sits at the top; the chain edges draw the curve.
 */
function timelineLayout(trades: Trade[], scale: number): BoardLayout {
  const taken = trades
    .filter((t) => t.outcome !== 'Not taken' && t.r_multiple != null)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const step = (NODE_W + GAP_X * 0.6) * scale;
  const unit = TIMELINE_R * scale;
  let cum = 0;
  const heights = taken.map((t) => (cum += t.r_multiple ?? 0));
  const peak = Math.max(0, ...heights);
  const nodes: PositionedTrade[] = taken.map((trade, i) => ({
    trade, reason: trade.reason, key: `timeline::${trade.id}`,
    x: i * step,
    y: (peak - heights[i]) * unit,
  }));
  const chain: Array<[string, string]> = nodes.slice(1).map((n, i) => [nodes[i].key, n.key]);
  return {
    clusters: [], nodes, stacks: [], reasonEdges: chain, leakEdges: [],
    nominalWidth: Math.max(step * nodes.length, NODE_W * scale),
  };
}

/**
 * Repeating leaks. leakPairs() returns every pair, which becomes a hairball on
 * a group of any size — chaining them by date keeps the line visible while
 * still linking every trade in the group.
 */
function leakChains(trades: Trade[]): Array<[string, string]> {
  const pairs = leakPairs(trades);
  if (pairs.length === 0) return [];

  const byTarget = new Map<string, Trade[]>();
  for (const t of trades) {
    if (t.outcome !== 'Loss') continue;
    const list = byTarget.get(t.target_type) ?? [];
    list.push(t);
    byTarget.set(t.target_type, list);
  }

  const chains: Array<[string, string]> = [];
  for (const group of byTarget.values()) {
    if (group.length < 2) continue;
    const ordered = [...group].sort((a, b) => a.date.localeCompare(b.date));
    for (let i = 1; i < ordered.length; i++) chains.push([ordered[i - 1].id, ordered[i].id]);
  }
  return chains;
}

/**
 * The colour for a reason cluster, as a CSS variable reference.
 *
 * Indexed off REASONS rather than computed from the hue angle, because the same
 * hue needs a different lightness per theme and a server component has no way to
 * know which theme is active. app/globals.css defines --reason-0..11 twice.
 */
export function reasonAccent(reason: Reason): string {
  const index = REASONS.indexOf(reason);
  return `var(--reason-${index < 0 ? 0 : index})`;
}
