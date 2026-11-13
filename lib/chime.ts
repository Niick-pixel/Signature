/**
 * A soft two-note chime, made in the browser (Web Audio): no file to ship and
 * nothing fetched. Quiet on purpose — it marks the moment, it does not alarm.
 */
let ctx: AudioContext | null = null;

export function playChime(): void {
  if (typeof window === 'undefined') return;
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx ??= new AC();
    if (ctx.state === 'suspended') void ctx.resume();
    const t0 = ctx.currentTime + 0.01;
    // A falling fifth, sine, each note fading out over ~0.9 s.
    for (const [freq, at] of [[880, 0], [587.33, 0.16]] as const) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0 + at);
      gain.gain.exponentialRampToValueAtTime(0.12, t0 + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.9);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + at);
      osc.stop(t0 + at + 0.95);
    }
  } catch { /* no sound is fine */ }
}
