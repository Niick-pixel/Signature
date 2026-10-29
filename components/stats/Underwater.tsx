/** The underwater chart: how far below its running peak cumulative R sat after each trade. */
export function Underwater({ rs }: { rs: readonly number[] }) {
  if (rs.length < 2) return null;
  let cum = 0; let peak = 0;
  const dd = rs.map((r) => { cum += r; peak = Math.max(peak, cum); return cum - peak; });
  const lo = Math.min(-0.5, ...dd);
  const W = 720; const H = 70; const L = 44; const R = 96;
  const x = (i: number) => L + (i / (dd.length - 1)) * (W - L - R);
  const y = (v: number) => 4 + (v / lo) * (H - 8);
  const path = `M ${x(0)} ${y(0)} ${dd.map((v, i) => `L ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')} L ${x(dd.length - 1)} ${y(0)} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Drawdown from the running peak, trade by trade" data-underwater>
      <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="var(--glass-stroke)" />
      <path d={path} fill="rgb(var(--outcome-loss) / 0.16)" stroke="rgb(var(--outcome-loss) / 0.6)" strokeWidth="1.2" />
      <text x={L - 6} y={y(lo) + 3} textAnchor="end" fontSize="10" fill="var(--text-faint)">{`−${Math.abs(lo).toFixed(1)}R`}</text>
      <text x={W - R + 6} y={y(dd[dd.length - 1]) + 3} fontSize="10" fill="var(--text-faint)">{dd[dd.length - 1] < -0.05 ? 'under water' : 'at the peak'}</text>
    </svg>
  );
}
