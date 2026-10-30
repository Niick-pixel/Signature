import { connection } from 'next/server';
import { boardStart } from '@/db/boardlayout';
import { PersistentBoard } from './PersistentBoard';

/**
 * The always-mounted board. Its trades are not rendered into the page: every
 * screen used to carry the whole journal for a board it wasn't showing (15 MB
 * of HTML at 2,000 trades). The board fetches them itself (PersistentBoard).
 */
export async function BoardLayer() {
  await connection();
  return <PersistentBoard start={boardStart()} />;
}
