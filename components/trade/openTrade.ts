import { OPEN_TRADE_KEY } from '@/components/stats/OpenOnBoard';
import { navigate } from '@/lib/nav';

/** Opens a trade where Settings → Trade page says: its own page, or the board's panel. */
export function openTrade(id: string, where: 'page' | 'board'): void {
  if (where === 'page') { navigate(`/trade/${id}`); return; }
  try { window.sessionStorage.setItem(OPEN_TRADE_KEY, id); } catch { /* the board just opens without it */ }
  navigate('/');
}
