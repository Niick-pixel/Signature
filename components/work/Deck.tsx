'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { spring, springSoft } from '@/lib/motion';
import { usePreferences } from '@/components/shell/PreferencesProvider';
import { dialogIsOpen } from '@/components/ui/Overlay';
import { captureOpen } from '@/lib/keys';
import { deckReducer, initialDeck } from './deckReducer';

export type Tone = 'amber' | 'green' | 'neutral';
export interface DeckCard { key: string; name: string; tone: Tone; node: React.ReactNode }

export const CARD_W = 1100;
export const CARD_H = 640;
const TONE: Record<Tone, string> = { amber: 'var(--amber)', green: 'var(--outcome-win)', neutral: 'var(--accent)' };

/**
 * A deck of full-size cards: the front one, the next two peeking behind.
 * The page never scrolls. A wheel flick, ↑/↓, j/k, PageUp/PageDown, a swipe
 * or a click on a peeking card moves one card (components/work/deckReducer);
 * the rail on the right jumps. Only the front card and the two behind it are
 * mounted. With reduce motion, cards cross-fade instead of flying.
 */
export function Deck({ cards, start = 0 }: { cards: DeckCard[]; start?: number }) {
  const [s, dispatch] = useReducer(deckReducer, initialDeck(cards.length, start));
  useEffect(() => { dispatch({ type: 'count', count: cards.length }); }, [cards.length]);
  const { prefs } = usePreferences();
  const still = prefs.reduceMotion;
  const box = useRef<HTMLDivElement>(null);

  // The card scales to fit the window: it never scrolls inside.
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => {
      const el = box.current; if (!el) return;
      const r = el.getBoundingClientRect();
      setScale(Math.min(1, (r.width - 96) / CARD_W, (r.height - 40) / (CARD_H + 24)));
    };
    fit();
    const ro = new ResizeObserver(fit); if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
  }, []);

  // The wheel: not passive, so the page itself never scrolls.
  useEffect(() => {
    const el = box.current; if (!el) return;
    const on = (e: WheelEvent) => {
      // A text box being edited keeps its own wheel.
      if ((e.target as HTMLElement | null)?.closest('textarea')) return;
      e.preventDefault();
      dispatch({ type: 'wheel', deltaY: e.deltaMode === 1 ? e.deltaY * 32 : e.deltaY, now: performance.now() });
    };
    el.addEventListener('wheel', on, { passive: false });
    return () => el.removeEventListener('wheel', on);
  }, []);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (dialogIsOpen() || captureOpen() || e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const dir = ['ArrowDown', 'PageDown', 'j'].includes(e.key) ? 1 : ['ArrowUp', 'PageUp', 'k'].includes(e.key) ? -1 : 0;
      if (!dir) return;
      e.preventDefault();
      dispatch({ type: 'step', dir });
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  const touch = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => { touch.current = e.touches[0]?.clientY ?? null; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touch.current == null) return;
    const dy = touch.current - (e.changedTouches[0]?.clientY ?? touch.current);
    touch.current = null;
    if (Math.abs(dy) > 50) dispatch({ type: 'step', dir: dy > 0 ? 1 : -1 });
  };

  const jump = useCallback((i: number) => dispatch({ type: 'jump', index: i }), []);
  const visible = cards.slice(s.index, s.index + 3);

  return (
    <div ref={box} className="relative min-h-0 flex-1 overflow-hidden" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} data-deck data-deck-index={s.index}>
      <div className="absolute inset-0 grid place-items-center">
        <div className="relative" style={{ width: CARD_W * scale, height: (CARD_H + 24) * scale }}>
          {/* Fit to the window once, here; the cards inside move in card pixels. */}
          <div className="absolute left-0 top-0" style={{ width: CARD_W, height: CARD_H, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          <AnimatePresence initial={false} custom={s.dir}>
            {visible.map((c, depth) => {
              const tone = TONE[c.tone];
              return (
                <motion.div key={c.key} custom={s.dir}
                  className="absolute inset-0"
                  // Scaled from the bottom edge, so the two behind show a sliver under the front one.
                  style={{ zIndex: 10 - depth, transformOrigin: '50% 100%' }}
                  initial={still ? { opacity: 0 } : { opacity: 0, y: s.dir > 0 ? 30 : -140, scale: s.dir > 0 ? 0.91 : 1.02 }}
                  animate={still
                    ? { opacity: depth === 0 ? 1 : 0, y: 0, scale: 1 }
                    : { opacity: depth === 0 ? 1 : depth === 1 ? 0.7 : 0.4, y: depth * 11, scale: 1 - depth * 0.03 }}
                  // The front card lifts and slides away up going forward; going back, the one behind sinks.
                  variants={{
                    leave: (dir: number) => (still ? { opacity: 0, transition: { duration: 0.15 } } : dir > 0
                      ? { opacity: 0, y: -160, scale: 1.02, transition: { duration: 0.32, ease: [0.4, 0, 0.2, 1] } }
                      : { opacity: 0, y: 30, scale: 0.91, transition: { duration: 0.25 } }),
                  }}
                  exit="leave"
                  transition={springSoft}
                  onClick={depth > 0 ? () => jump(s.index + depth) : undefined}
                  data-deck-card={c.key} data-depth={depth}
                >
                  <motion.div
                    key={depth === 0 ? `b${s.bounce}` : 'still'}
                    animate={depth === 0 && s.bounce && !still ? { y: [0, -Math.sign(s.bounce) * 16, 0] } : { y: 0 }}
                    transition={spring}
                    className="relative h-full w-full overflow-hidden rounded-[calc(28px*var(--rk))] border"
                    style={{
                      borderColor: `rgb(${tone} / ${depth === 0 ? 0.5 : 0.3})`,
                      boxShadow: depth === 0 ? `var(--shadow-panel), 0 0 60px -18px rgb(${tone} / 0.55)` : 'var(--shadow-card)',
                      // Opaque: nothing behind may show through the card being read.
                      background: 'var(--bg-raised)',
                      cursor: depth > 0 ? 'pointer' : undefined,
                    }}>
                    {/* Behind the front card, only the shell is drawn: its content mounts when it comes forward. */}
                    {depth === 0 ? c.node : null}
                  </motion.div>
                </motion.div>
              );
            })}
          </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Where you are: one dot per card, its name on hover; a click jumps there. */}
      <nav aria-label="Cards" className="absolute right-4 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-2" data-deck-rail>
        {cards.map((c, i) => (
          <button key={c.key} type="button" onClick={() => jump(i)} title={c.name} aria-label={c.name} aria-current={i === s.index}
            className="group relative grid size-4 place-items-center">
            <span className="block rounded-full transition-all" style={{
              width: i === s.index ? 8 : 6, height: i === s.index ? 18 : 6,
              background: i === s.index ? `rgb(${TONE[c.tone]})` : 'var(--text-faint)', opacity: i === s.index ? 1 : 0.5,
            }} />
            <span className="pointer-events-none absolute right-6 hidden whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium group-hover:block"
              style={{ background: 'var(--bg-raised)', border: '1px solid var(--glass-stroke)', color: 'var(--text)' }}>{c.name}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
