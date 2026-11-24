'use client';

/** Opens the cockpit: its own always-on-top window in the desktop app, a small popup in a browser. */
export function openCockpit(): void {
  if (window.signature?.cockpit) { void window.signature.cockpit.open(); return; }
  window.open('/cockpit', 'signature-cockpit', 'width=380,height=660');
}

/** From the cockpit, a route in the main window (the plan to trade), brought forward. */
export function openInMain(route: string): void {
  if (window.signature?.cockpit) { void window.signature.cockpit.openInMain(route); return; }
  const main = window.opener as Window | null;
  if (main && !main.closed) { main.location.href = route.startsWith('/') ? route : '/dashboard'; main.focus(); return; }
  window.location.href = route;
}
