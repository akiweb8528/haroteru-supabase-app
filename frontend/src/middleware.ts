import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  const { user, supabaseResponse } = await updateSession(request);

  const isProtected = request.nextUrl.pathname.startsWith('/subscriptions')
    || request.nextUrl.pathname.startsWith('/settings');

  if (isProtected && !user) {
    const signInUrl = new URL('/auth/signin', request.url);
    signInUrl.searchParams.set('callbackUrl', request.nextUrl.pathname);
    return NextResponse.redirect(signInUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: ['/subscriptions/:path*', '/settings/:path*', '/settings'],
};
