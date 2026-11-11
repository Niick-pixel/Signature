import { redirect } from 'next/navigation';

/** Work on lives in Stats now: its flaws, drills and data checks are widgets on the Stats board. */
export default function WorkPage() {
  redirect('/stats');
}
