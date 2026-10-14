import { markStale } from './freshness';
/**
 * The account each screen is showing, remembered across launches.
 *
 * A cookie rather than localStorage, because Stats and the Calendar are
 * rendered on the server and have to open on the right account without a
 * flash of the wrong one. A ?account= in the URL still wins — a link to a
 * specific account means that account.
 */
/*
  One cookie per screen. It used to be one for the whole app: picking Backtest
  on Stats narrowed the board to Backtest too, and the board then looked as if
  trades had gone missing. Each screen now keeps its own account — the title
  bar shows and sets the one for the screen you are on.

  (Two retired names: 'signature_account' was also written when a page merely
  OPENED on an account; 'signature_account_v2' was the shared choice. Both are
  dropped on sight.)
*/
export type AccountScope = 'board' | 'stats' | 'calendar';
const RETIRED_COOKIES = ['signature_account', 'signature_account_v2'];
export const accountCookie = (scope: AccountScope) => `signature_account_${scope}`;
export const ACCOUNT_EVENT = 'signature:account';
/** A page announcing which account it is showing — for display, never stored. */
export const ACCOUNT_SHOWN_EVENT = 'signature:account-shown';

/** Which screen's account a path shows, or null for a screen with no account. */
export function scopeOf(pathname: string): AccountScope | null {
  if (pathname === '/stats') return 'stats';
  if (pathname === '/calendar') return 'calendar';
  // The New trade window opens over the board, and the board behind it is the board.
  if (pathname === '/' || pathname === '/new') return 'board';
  return null;
}

export interface AccountChange { account: string; scope: AccountScope }

export function readAccountCookie(scope: AccountScope): string | null {
  if (typeof document === 'undefined') return null;
  for (const old of RETIRED_COOKIES) {
    if (document.cookie.split('; ').some((c) => c.startsWith(`${old}=`))) {
      document.cookie = `${old}=; path=/; max-age=0; samesite=lax`;
    }
  }
  const name = accountCookie(scope);
  const hit = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : null;
}

let shownAccount: { path: string; account: string } | null = null;

/** The account the current page announced, if it announced one. */
export function lastShownAccount(): string | null {
  return shownAccount && shownAccount.path === window.location.pathname ? shownAccount.account : null;
}

/** Says which account a page is showing, without remembering it as a choice. */
export function announceAccount(account: string): void {
  // Kept as well as sent: the title bar may start listening after this fires.
  shownAccount = { path: window.location.pathname, account };
  window.dispatchEvent(new CustomEvent(ACCOUNT_SHOWN_EVENT, { detail: account }));
}

/** Only for a deliberate choice — a click, never a page opening. */
export function writeAccountCookie(account: string, scope: AccountScope): void {
  document.cookie = `${accountCookie(scope)}=${encodeURIComponent(account)}; path=/; max-age=31536000; samesite=lax`;
  markStale(); // the server reads this cookie: cached screens are now out of date
  window.dispatchEvent(new CustomEvent<AccountChange>(ACCOUNT_EVENT, { detail: { account, scope } }));
}
