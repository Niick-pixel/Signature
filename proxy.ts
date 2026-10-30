import { NextResponse, type NextRequest } from 'next/server';
import { checkRequest } from '@/lib/requestGuard';

/** Every request: loopback Host, and no cross-site writes (lib/requestGuard). */
export function proxy(request: NextRequest) {
  const verdict = checkRequest(request.method, request.headers);
  if (!verdict.ok) return new NextResponse(verdict.reason, { status: verdict.status });
  return NextResponse.next();
}

export const config = {
  // Static build files carry nothing of the journal.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
