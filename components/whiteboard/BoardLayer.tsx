import { PersistentBoard } from './PersistentBoard';

/**
 * The always-mounted Trades list. Its trades are not rendered into the page:
 * every screen used to carry the whole journal for a list it wasn't showing.
 * The list fetches them itself (PersistentBoard). Nothing is read on the
 * server for it any more — the canvas's saved layout went with the canvas.
 */
export function BoardLayer() {
  return <PersistentBoard />;
}
