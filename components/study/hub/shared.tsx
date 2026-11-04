'use client';

export const signedR = (v: number | null) => (v == null ? '—' : `${v < 0 ? '−' : v > 0 ? '+' : ''}${Math.abs(v).toFixed(2)}R`);
export const rTone = (v: number | null) => (v == null || Math.abs(v) < 0.05 ? 'var(--text-dim)' : v > 0 ? 'rgb(var(--outcome-win))' : 'rgb(var(--outcome-loss))');
export const shotSrc = (shot: string, w = 900) => `/api/screenshots/${shot}?w=${w}`;

export function Card({ children, className = '', ...rest }: { children: React.ReactNode; className?: string } & Record<`data-${string}`, string | number | undefined>) {
  return <section {...rest} className={`glass rounded-[calc(20px*var(--rk))] p-5 ${className}`}>{children}</section>;
}
export function Head({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-faint)' }}>{title}</span>
      {right && <span className="text-[11.5px] tabular-nums" style={{ color: 'var(--text-dim)' }}>{right}</span>}
    </div>
  );
}
export function Pill({ children, onClick, strong, ...rest }: { children: React.ReactNode; onClick?: () => void; strong?: boolean } & Record<`data-${string}`, string | boolean | undefined>) {
  return (
    <button type="button" onClick={onClick} {...rest} className="rounded-full border px-3.5 py-1.5 text-[12px] font-semibold"
      style={strong ? { background: 'rgb(var(--accent))', color: 'var(--bg-raised)', borderColor: 'transparent' } : { borderColor: 'var(--glass-stroke)', background: 'var(--glass-fill)', color: 'var(--text)' }}>
      {children}
    </button>
  );
}
export const Faint = ({ children }: { children: React.ReactNode }) => <p className="text-[12.5px]" style={{ color: 'var(--text-faint)' }}>{children}</p>;
