/**
 * Who may talk to the journal's server.
 *
 * Signature serves the window from http://127.0.0.1:<port>. Nothing stopped
 * any other page on the machine from talking to that port too:
 *
 *   - Cross-site writes. A web page open in an ordinary browser can submit a
 *     form (or a "simple" fetch) to 127.0.0.1 — no CORS preflight — and the
 *     server would create or change rows. Verified: a POST carrying
 *     Origin: https://evil.example created a tag.
 *   - DNS rebinding. A hostile domain that re-points itself at 127.0.0.1 makes
 *     the browser treat the journal as same-origin with that domain, and it
 *     can read anything, export included. The request still says
 *     Host: evil.example, which is how it is refused here.
 *
 * So: the Host must be a loopback name, and a write must come from a loopback
 * origin (or carry no Origin at all — curl, the Electron shell, tests).
 */
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

const hostnameOf = (hostHeader: string): string => {
  const h = hostHeader.trim().toLowerCase();
  if (h.startsWith('[')) return h.slice(0, h.indexOf(']') + 1);
  return h.split(':')[0];
};

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

export type GuardVerdict = { ok: true } | { ok: false; status: 403 | 421; reason: string };

export function checkRequest(method: string, headers: { get(name: string): string | null }): GuardVerdict {
  const host = headers.get('host');
  if (!host || !LOOPBACK.has(hostnameOf(host))) {
    return { ok: false, status: 421, reason: 'Signature only answers on this computer (127.0.0.1).' };
  }
  if (SAFE.has(method.toUpperCase())) return { ok: true };
  const origin = headers.get('origin');
  if (origin != null && origin !== 'null') {
    let originHost: string;
    try { originHost = new URL(origin).host; } catch { return { ok: false, status: 403, reason: 'Unreadable origin.' }; }
    if (!LOOPBACK.has(hostnameOf(originHost))) return { ok: false, status: 403, reason: 'Writes from other sites are refused.' };
  } else if (origin === 'null' || headers.get('sec-fetch-site') === 'cross-site') {
    // A sandboxed frame or a cross-site request that hid its origin.
    return { ok: false, status: 403, reason: 'Writes from other sites are refused.' };
  }
  return { ok: true };
}
