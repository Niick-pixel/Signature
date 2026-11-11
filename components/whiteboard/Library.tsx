'use client';

import { InTitleBar, MergedHeader, useMergedHeader } from '@/components/shell/TitleSlot';
import { usePathname } from 'next/navigation';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Trade } from '@/lib/types';
import { ACCOUNT_VALUES, OUTCOMES, SESSIONS, accountLabel, type Outcome, type Session } from '@/lib/domain';
import { ACCOUNT_EVENT, readAccountCookie, writeAccountCookie, type AccountChange } from '@/lib/account-pref';
import { boardGroups, type BoardGroup } from '@/lib/layout';
import { GRADE_COLOR, gradeLetter } from '@/lib/grade';
import { JOURNAL_CHANGED } from '@/lib/freshness';
import { BOARD_SHOWN, boardShown, captureOpen } from '@/lib/keys';
import { dialogIsOpen } from '@/components/ui/Overlay';
import { OPEN_TRADE_KEY } from '@/components/stats/OpenOnBoard';
import { tradeDay } from '@/lib/when';
import { DetailPanel } from './DetailPanel';
import { EMPTY_FILTERS, applyFilters, filtersActive, type Filters } from './Toolbar';
import { OUTCOME_COLOR } from './TradeNode';
import { RiskBanner } from './RiskBanner';
import { isReal } from '@/lib/domain';

/**
 * The trade library — what the Whiteboard tab opens on.
 *
 * The board drew every trade as a live, animated card on a pan-and-zoom
 * canvas, and opening a group of forty charts started forty image resizes at
 * once. This is the same wall of charts as a plain page: the board's groups
 * and their numbers (lib/layout boardGroups, the same totals), its filters,
 * a search, and the same trade panel with its arrows. Cards are plain
 * elements with no per-card animation; a card off screen is not drawn
 * (content-visibility) and its chart is not fetched until it nears the
 * screen (loading="lazy"), so forty trades and four thousand scroll alike.
 * The canvas is still there, one switch away, and only built when chosen.
 */

const KEY = 'signature.library';

interface Saved { filters: Omit<Filters, 'account'>; collapsed: string[] }

function readSaved(): Saved {
  const base: Saved = { filters: { ...EMPTY_FILTERS }, collapsed: [] };
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) ?? 'null') as Partial<Saved> | null;
    if (!v) return base;
    return {
      filters: { ...base.filters, ...(v.filters ?? {}) },
      collapsed: Array.isArray(v.collapsed) ? v.collapsed.filter((x) => typeof x === 'string') : [],
    };
  } catch { return base; }
}

/** Words a trade can be found by: its reason, setup, target, tags, writing, account and day. */
const haystack = (t: Trade) => [
  t.reason, t.setup_type, t.target_type, t.session, t.direction, t.instrument, accountLabel(t.account),
  ...(t.mistake_tags ?? []), ...(t.worked_tags ?? []), t.explanation, t.lesson, t.date.slice(0, 10),
].join(' ').toLowerCase();

const signedR = (r: number) => `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r).toFixed(r % 1 === 0 ? 0 : 1)}R`;

export function Library({ trades: initial }: { trades: Trade[] }) {
  const [trades, setTrades] = useState(initial);
  // The library stays mounted on every screen (PersistentBoard): its header joins the title bar only on Trades.
  const onTrades = usePathname() === '/';
  const inTitle = useMergedHeader() && onTrades;
  // New trades from the board layer replace the list (render-time, not an effect).
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) { setSeen(initial); setTrades(initial); }
  const refresh = useCallback(async () => {
    const res = await fetch('/api/trades');
    if (res.ok) setTrades(await res.json());
  }, []);
  // A save anywhere (New trade over the board, an edit, a delete) shows up here.
  useEffect(() => {
    const on = () => { void refresh(); };
    window.addEventListener(JOURNAL_CHANGED, on);
    return () => window.removeEventListener(JOURNAL_CHANGED, on);
  }, [refresh]);
  // Charts saved before thumbnails were made ahead get theirs, once, in the background (db/thumbs).
  useEffect(() => { void fetch('/api/thumbs', { method: 'POST' }).catch(() => {}); }, []);

  const [saved, setSaved] = useState<Saved>(() => (typeof window === 'undefined' ? { filters: { ...EMPTY_FILTERS }, collapsed: [] } : readSaved()));
  useEffect(() => { try { window.localStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* a convenience */ } }, [saved]);

  // The account is the board's own (the title bar's picker sets it while you are here).
  const [account, setAccount] = useState<Filters['account']>(() => {
    const first = typeof document === 'undefined' ? null : readAccountCookie('board');
    return first === 'All' || (ACCOUNT_VALUES as readonly string[]).includes(first ?? '') ? first as Filters['account'] : 'All';
  });
  useEffect(() => {
    const valid = (a: string | null): a is Filters['account'] => a === 'All' || (ACCOUNT_VALUES as readonly string[]).includes(a ?? '');
    const on = (e: Event) => { const { account: a, scope } = (e as CustomEvent<AccountChange>).detail; if (scope === 'board' && valid(a)) setAccount(a); };
    window.addEventListener(ACCOUNT_EVENT, on);
    return () => window.removeEventListener(ACCOUNT_EVENT, on);
  }, []);
  const filters: Filters = useMemo(() => ({ ...saved.filters, account }), [saved.filters, account]);
  const setFilters = (next: Filters) => {
    if (next.account !== account) { setAccount(next.account); writeAccountCookie(next.account, 'board'); }
    const { account: _a, ...rest } = next; void _a;
    setSaved((s) => ({ ...s, filters: rest }));
  };

  const realTrades = useMemo(() => trades.filter((t) => isReal(t.account)), [trades]);
  const [q, setQ] = useState('');
  const search = useRef<HTMLInputElement>(null);
  const visible = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const keep = applyFilters(filters);
    return trades.filter((t) => !t.deleted_at && keep(t) && (!words.length || words.every((w) => haystack(t).includes(w))));
  }, [trades, filters, q]);
  /*
    Grouped by reason (the board's groups, the same totals), and the group
    with the most recently added trade comes first — what you just logged is
    at the top, not wherever its group's R put it.
  */
  const groups = useMemo(() => boardGroups(visible, 'reason')
    .map((g) => ({ ...g, trades: [...g.trades].sort((a, b) => b.created_at.localeCompare(a.created_at)) }))
    .sort((a, b) => (b.trades[0]?.created_at ?? '').localeCompare(a.trades[0]?.created_at ?? '')), [visible]);
  const collapsed = useMemo(() => new Set(saved.collapsed), [saved.collapsed]);
  const toggle = (key: string) => setSaved((s) => ({ ...s, collapsed: s.collapsed.includes(key) ? s.collapsed.filter((k) => k !== key) : [...s.collapsed, key] }));

  // The order the panel's arrows walk: as listed, open groups only, each trade once.
  const order = useMemo(() => {
    const seen = new Set<string>(); const out: Trade[] = [];
    for (const g of groups) if (!collapsed.has(g.key)) for (const t of g.trades) if (!seen.has(t.id)) { seen.add(t.id); out.push(t); }
    return out;
  }, [groups, collapsed]);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = openId ? trades.find((t) => t.id === openId) ?? null : null;
  const at = open ? order.findIndex((t) => t.id === open.id) : -1;
  const prev = at > 0 ? order[at - 1] : null;
  const next = at >= 0 && at < order.length - 1 ? order[at + 1] : null;
  const label = (t: Trade) => `${t.date.slice(5, 10)} · ${t.setup_type}`;

  // "Open on the board" from Stats or the Calendar lands here too.
  useEffect(() => {
    const take = () => {
      try {
        const id = window.sessionStorage.getItem(OPEN_TRADE_KEY);
        if (id) { window.sessionStorage.removeItem(OPEN_TRADE_KEY); setOpenId(id); }
      } catch { /* storage unavailable */ }
    };
    take();
    window.addEventListener(BOARD_SHOWN, take);
    return () => window.removeEventListener(BOARD_SHOWN, take);
  }, []);
  // "/" finds a trade, while the library is the screen and nothing is over it.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key !== '/' || !boardShown() || dialogIsOpen() || captureOpen() || openId) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      e.preventDefault(); search.current?.focus();
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [openId]);

  const active = filtersActive(filters) || q.trim() !== '';

  /*
    Rows draw no chart at all. Hovering one shows its chart — one small
    image, after a short pause so sweeping the mouse down the list fetches
    nothing — beside the row. Opening the trade shows it in full.
  */
  const [peek, setPeek] = useState<{ path: string; top: number; left: number } | null>(null);
  const peekTimer = useRef<number | null>(null);
  const onPeek = useCallback((t: Trade | null, row?: DOMRect) => {
    if (peekTimer.current) { window.clearTimeout(peekTimer.current); peekTimer.current = null; }
    if (!t || !t.screenshot_path || !row) { setPeek(null); return; }
    const path = t.screenshot_path;
    peekTimer.current = window.setTimeout(() => {
      const w = 340; const h = 213;
      const left = Math.min(window.innerWidth - w - 16, row.right - w - 12);
      const top = row.bottom + h + 8 > window.innerHeight ? row.top - h - 6 : row.bottom + 6;
      setPeek({ path, top, left });
    }, 220);
  }, []);
  const flip = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <div className="h-full overflow-y-auto" data-library>
      {/* With the side rail, the search sits in the title bar (the account is the title bar's own picker) — only while Trades is the screen. */}
      {onTrades && <InTitleBar inline={null}
        merged={<MergedHeader title="Trades" data="trades" sub={`${visible.length} of ${trades.filter((t) => !t.deleted_at).length} trades`}>
          
          <input ref={search} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search  /" aria-label="Search trades" data-library-search
            onKeyDown={(e) => { if (e.key === 'Escape') { setQ(''); search.current?.blur(); } if (e.key === 'Enter' && order[0]) setOpenId(order[0].id); }}
            className="w-44 rounded-full border px-3 py-1 text-[12px] outline-none focus:w-60"
            style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)', color: 'var(--text)', transition: 'width 160ms ease' }} />
        </MergedHeader>} />}
      <div className="mx-auto max-w-[96rem] px-5 pb-28 pt-4 sm:px-8">
        {/* Today against your limits, as on the board: information, never a lock. */}
        <div className="mb-2 flex justify-center empty:hidden"><RiskBanner trades={realTrades} /></div>
        {/* One bar: the view, the grouping, the filters, the search. */}
        <div className="flex flex-wrap items-center gap-2" data-library-bar>
          <Pick label="Account" value={filters.account} options={['All', ...ACCOUNT_VALUES] as const} labelFor={(a) => (a === 'All' ? 'All accounts' : accountLabel(a))}
            onChange={(a) => setFilters({ ...filters, account: a })} data="account" />
          <div className="flex flex-wrap gap-1" data-library-outcomes>
            {OUTCOMES.map((o) => (
              <Chip key={o} on={filters.outcomes.includes(o)} color={OUTCOME_COLOR[o]} onClick={() => setFilters({ ...filters, outcomes: flip<Outcome>(filters.outcomes, o) })}>
                {o === 'Not taken' ? 'Passed' : o}
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap gap-1" data-library-sessions>
            {SESSIONS.map((s) => (
              <Chip key={s} on={filters.sessions.includes(s)} onClick={() => setFilters({ ...filters, sessions: flip<Session>(filters.sessions, s) })}>{s}</Chip>
            ))}
          </div>
          <Pick label="Grade" value={String(filters.minGrade)} options={['0', '50', '60', '70', '80', '90'] as const}
            labelFor={(g) => (g === '0' ? 'Any grade' : `${gradeLetter(Number(g))} or better`)} onChange={(g) => setFilters({ ...filters, minGrade: Number(g) })} data="grade" />
          <label className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-faint)' }}>
            From <input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} aria-label="From"
              className="rounded-[9px] border bg-transparent px-1.5 py-0.5 text-[11px] outline-none" style={{ borderColor: 'var(--glass-stroke)', color: filters.from ? 'var(--text)' : 'var(--text-faint)' }} />
            to <input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} aria-label="To"
              className="rounded-[9px] border bg-transparent px-1.5 py-0.5 text-[11px] outline-none" style={{ borderColor: 'var(--glass-stroke)', color: filters.to ? 'var(--text)' : 'var(--text-faint)' }} />
          </label>
          {!inTitle && (
  <input ref={search} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search  /" aria-label="Search trades" data-library-search
            onKeyDown={(e) => { if (e.key === 'Escape') { setQ(''); search.current?.blur(); } if (e.key === 'Enter' && order[0]) setOpenId(order[0].id); }}
            className="ml-auto w-44 rounded-full border px-3 py-1 text-[12px] outline-none focus:w-60"
            style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)', color: 'var(--text)', transition: 'width 160ms ease' }} />
          )}
        </div>
        <div className="mt-2 flex items-center gap-3 text-[11.5px]" style={{ color: 'var(--text-faint)' }}>
          <span data-library-count>{visible.length} of {trades.filter((t) => !t.deleted_at).length} trades · {groups.length} group{groups.length === 1 ? '' : 's'}</span>
          {active && <button type="button" className="underline underline-offset-2" onClick={() => { setQ(''); setFilters({ ...EMPTY_FILTERS, account: filters.account }); }} data-library-clear>Clear filters</button>}
          {groups.length > 1 && (
            <button type="button" className="underline underline-offset-2" data-library-fold
              onClick={() => setSaved((s) => ({ ...s, collapsed: s.collapsed.length >= groups.length ? [] : groups.map((g) => g.key) }))}>
              {saved.collapsed.length >= groups.length ? 'Open every group' : 'Fold every group'}
            </button>
          )}
        </div>

        {groups.length === 0 ? (
          <p className="mt-16 text-center text-[13px]" style={{ color: 'var(--text-faint)' }}>{trades.length ? 'No trade matches these filters.' : 'No trades yet — press N to log the first one.'}</p>
        ) : (
          <div className="mt-5 space-y-6">
            {groups.map((g) => (
              <Group key={g.key} g={g} folded={collapsed.has(g.key)} onToggle={() => toggle(g.key)} onOpen={(id) => { onPeek(null); setOpenId(id); }} onPeek={onPeek} />
            ))}
          </div>
        )}
      </div>

      {peek && (
        <div className="pointer-events-none fixed z-40 overflow-hidden rounded-[12px] border shadow-lg" data-library-peek
          style={{ top: peek.top, left: peek.left, width: 340, borderColor: 'var(--glass-stroke)', background: 'var(--bg-raised)' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/screenshots/${peek.path}?w=480`} alt="" className="aspect-[16/10] w-full object-cover" decoding="async" />
        </div>
      )}

      <DetailPanel trade={open} onClose={() => setOpenId(null)} onChanged={() => void refresh()}
        onStep={(dir) => { const n = dir < 0 ? prev : next; if (n) setOpenId(n.id); }}
        prevLabel={prev ? label(prev) : null} nextLabel={next ? label(next) : null} />
    </div>
  );
}

/** A group: its name and the board's numbers for it, then its charts. Folds to its header. */
/** Cards a group draws before "Show more": every group you have today fits; a journal of thousands stays light. */
const PAGE = 60;

function Group({ g, folded, onToggle, onOpen, onPeek }: {
  g: BoardGroup; folded: boolean; onToggle: () => void; onOpen: (id: string) => void;
  onPeek: (t: Trade | null, row?: DOMRect) => void;
}) {
  const s = g.stats;
  const [limit, setLimit] = useState(PAGE);
  const tone = s.totalR > 0 ? 'var(--outcome-win)' : s.totalR < 0 ? 'var(--outcome-loss)' : null;
  return (
    <section data-library-group={g.key}>
      <button type="button" onClick={onToggle} aria-expanded={!folded} className="flex w-full flex-wrap items-baseline gap-x-5 gap-y-1 text-left">
        <span className="flex items-center gap-2">
          <span aria-hidden className="text-[10px] transition-transform" style={{ color: 'var(--text-faint)', transform: folded ? 'rotate(-90deg)' : 'none', display: 'inline-block' }}>▾</span>
          <span className="size-2 rounded-full" style={{ background: `rgb(${g.accent})` }} />
          <span className="text-[14px] font-semibold tracking-tight" style={{ color: `rgb(${g.accent})` }}>{g.key}</span>
        </span>
        <Stat label="Trades" value={String(s.count)} />
        <Stat label="Win rate" value={s.winRate == null ? '—' : `${Math.round(s.winRate * 100)}%`} />
        <Stat label="Total R" value={`${s.totalR > 0 ? '+' : ''}${s.totalR.toFixed(1)}R`} color={tone ? `rgb(${tone})` : undefined} />
        <Stat label="Avg grade" value={s.avgGrade == null ? '—' : gradeLetter(Math.round(s.avgGrade))} />
      </button>
      {!folded && (
        <div className="mt-2 overflow-hidden rounded-[calc(12px*var(--rk))] border" style={{ borderColor: 'var(--glass-stroke)', background: 'var(--bg-raised)' }}
          onMouseLeave={() => onPeek(null)}>
          {g.trades.slice(0, limit).map((t, i) => <Row key={t.id} t={t} first={i === 0} onOpen={onOpen} onPeek={onPeek} />)}
        </div>
      )}
      {!folded && g.trades.length > limit && (
        <div className="mt-3 flex gap-2 text-[12px]">
          <button type="button" onClick={() => setLimit((l) => l + PAGE)} data-library-more className="rounded-full border px-3 py-1 font-medium"
            style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)' }}>
            Show {Math.min(PAGE, g.trades.length - limit)} more
          </button>
          <button type="button" onClick={() => setLimit(g.trades.length)} className="px-2 underline underline-offset-2" style={{ color: 'var(--text-faint)' }}>
            All {g.trades.length}
          </button>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-[9.5px] uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>{label}</span>
      <span className="text-[13px] font-semibold tabular-nums" style={{ color: color ?? 'var(--text)' }}>{value}</span>
    </span>
  );
}


/** A small native select dressed as a pill: light, keyboard-friendly, no menu to animate. */
function Pick<T extends string>({ label, value, options, labelFor, onChange, data }: {
  label: string; value: T; options: readonly T[]; labelFor: (v: T) => string; onChange: (v: T) => void; data: string;
}) {
  return (
    <label className="flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11.5px]" style={{ borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)' }}>
      <span style={{ color: 'var(--text-faint)' }}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)} data-library-pick={data} aria-label={label}
        className="bg-transparent font-medium outline-none" style={{ color: 'var(--text)' }}>
        {options.map((o) => <option key={o} value={o}>{labelFor(o)}</option>)}
      </select>
    </label>
  );
}

function Chip({ on, color, onClick, children }: { on: boolean; color?: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className="rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors"
      style={on
        ? { borderColor: `rgb(${color ?? 'var(--accent)'} / 0.6)`, background: `rgb(${color ?? 'var(--accent)'} / 0.14)`, color: `rgb(${color ?? 'var(--accent)'})` }
        : { borderColor: 'var(--glass-stroke)', color: 'var(--text-dim)' }}>
      {children}
    </button>
  );
}

/**
 * One trade as one line: when, which way, the setup, the account, the target,
 * the result, the grade and what went wrong — no chart drawn. A camera mark
 * says there is a chart; hovering the row shows it.
 */
const Row = memo(function Row({ t, first, onOpen, onPeek }: { t: Trade; first: boolean; onOpen: (id: string) => void; onPeek: (t: Trade | null, row?: DOMRect) => void }) {
  const out = OUTCOME_COLOR[t.outcome];
  return (
    <button type="button" onClick={() => onOpen(t.id)} data-library-row={t.id}
      onMouseEnter={(e) => onPeek(t, e.currentTarget.getBoundingClientRect())}
      className="grid w-full items-center gap-3 px-3 py-2 text-left text-[12px] hover:bg-[rgb(var(--accent)/0.06)]"
      style={{
        gridTemplateColumns: '0.5rem 6.5rem 3.2rem minmax(4rem,7rem) minmax(4rem,8rem) minmax(4rem,7rem) 3.6rem 1.7rem minmax(0,1fr) 1rem',
        borderTop: first ? 'none' : '1px solid var(--glass-stroke)',
        contentVisibility: 'auto', containIntrinsicSize: 'auto 2.25rem',
      }}>
      <span className="size-2 rounded-full" style={{ background: `rgb(${out})` }} />
      <span className="truncate tabular-nums" style={{ color: 'var(--text-dim)' }}>{tradeDay(t, { day: 'numeric', month: 'short' })}{!t.undated && t.date.length > 11 ? ` · ${t.date.slice(11, 16)}` : ''}</span>
      <span className="truncate">{t.direction}</span>
      <span className="truncate font-medium">{t.setup_type}</span>
      <span className="truncate" style={{ color: 'var(--text-dim)' }}>{accountLabel(t.account)}</span>
      <span className="truncate" style={{ color: 'var(--text-faint)' }}>{t.target_type}</span>
      <span className="text-right font-semibold tabular-nums" style={{ color: `rgb(${out})` }}>
        {t.r_multiple != null ? signedR(t.r_multiple) : t.outcome === 'Not taken' ? 'Passed' : t.outcome}
      </span>
      <span className="grid size-6 place-items-center rounded-[7px] text-[10.5px] font-semibold"
        style={{ color: `rgb(${GRADE_COLOR[t.grade_letter]})`, background: `rgb(${GRADE_COLOR[t.grade_letter]} / 0.14)` }}>{t.grade_letter}</span>
      <span className="truncate text-[11.5px]" style={{ color: 'rgb(var(--outcome-loss))' }} title={t.mistake_tags.join(' · ') || undefined}>{t.mistake_tags.join(' · ')}</span>
      <span aria-label={t.screenshot_path ? 'Has a chart' : undefined} className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{t.screenshot_path ? '▣' : ''}</span>
    </button>
  );
});
