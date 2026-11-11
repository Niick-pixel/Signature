import { redirect } from 'next/navigation';

/** Work on lives in Stats now: its flaws, drills and data checks are the Flaws board. */
export default function WorkPage() {
  redirect('/stats?board=flaws');
}
