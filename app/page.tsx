import { TitleBar } from '@/components/shell/TitleBar';

/**
 * The whiteboard screen. The board itself is not drawn here: it lives in the
 * root layout and stays mounted across every screen (components/whiteboard/
 * PersistentBoard), so coming back to it is instant. This page is the title
 * bar and the space the board shows in.
 */
export default function WhiteboardPage() {
  return (
    <div className="flex h-dvh flex-col">
      <TitleBar />
      <div className="min-h-0 flex-1" />
    </div>
  );
}
