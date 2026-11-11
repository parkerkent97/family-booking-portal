import { NextRequest, NextResponse } from 'next/server';
import { session } from '@/lib/server';
export async function proxy(req: NextRequest) {
  const s = await session(false);
  if (!s || !s.named) return NextResponse.redirect(new URL('/login', req.url));
  if (['/admin', '/usage'].includes(req.nextUrl.pathname) && !s.admin) return NextResponse.redirect(new URL('/calendar', req.url));
  return NextResponse.next();
}
export const config = { matcher: ['/access/:path*', '/calendar/:path*', '/rules/:path*', '/usage/:path*', '/admin/:path*'] };
