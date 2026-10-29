'use client';

/**
 * A small "?" that says what a setting does, on hover or keyboard focus.
 * Settings show the control and its name; the explanation waits here.
 */
export function Help({ children, side = 'right' }: { children: React.ReactNode; side?: 'right' | 'left' }) {
  return (
    <span className="group relative inline-flex align-middle" data-help>
      <span tabIndex={0} role="button" aria-label="What this does"
        className="grid size-[15px] cursor-help place-items-center rounded-full border text-[9.5px] font-semibold leading-none outline-none"
        style={{ borderColor: 'var(--glass-stroke)', color: 'var(--text-faint)', background: 'var(--glass-fill)' }}>?</span>
      <span role="tooltip"
        className={`pointer-events-none invisible absolute top-1/2 z-[90] w-[17rem] -translate-y-1/2 rounded-[10px] border px-3 py-2 text-[11.5px] font-normal normal-case leading-snug tracking-normal opacity-0 shadow-lg transition-opacity duration-100 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100 ${side === 'right' ? 'left-[calc(100%+8px)]' : 'right-[calc(100%+8px)]'}`}
        style={{ background: 'var(--bg-raised)', borderColor: 'var(--glass-stroke)', color: 'var(--text)', boxShadow: 'var(--shadow-panel)' }}>
        {children}
      </span>
    </span>
  );
}

/**
 * A setting's name above its control. A label written "Name — what it does"
 * shows the name, with the rest behind a "?".
 */
export function Labeled({ label, help, children }: { label: string; help?: React.ReactNode; children: React.ReactNode }) {
  const [name, ...rest] = label.split(' — ');
  const more = help ?? (rest.length ? rest.join(' — ') : null);
  return (
    <div>
      <span className="mb-1.5 flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-faint)' }}>
        {name}{more && <Help>{more}</Help>}
      </span>
      {children}
    </div>
  );
}
