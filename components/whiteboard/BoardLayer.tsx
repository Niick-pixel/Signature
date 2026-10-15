import { connection } from 'next/server';
import { listTrades } from '@/db/trades';
import { boardStart } from '@/db/boardlayout';
import { PersistentBoard } from './PersistentBoard';

/** The always-mounted board's data, read fresh on every load and refresh. */
export async function BoardLayer() {
  await connection();
  return <PersistentBoard trades={listTrades()} start={boardStart()} />;
}
