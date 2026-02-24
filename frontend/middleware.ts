import { NextRequest, NextResponse } from 'next/server';

import { ACCESS_TOKEN_COOKIE, USER_ROLE_COOKIE } from './lib/auth';

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const role = request.cookies.get(USER_ROLE_COOKIE)?.value;

  if (pathname === '/') {
    return NextResponse.redirect(new URL(accessToken ? '/dashboard' : '/login', request.url));
  }

  if (pathname === '/login') {
    if (accessToken) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }

    return NextResponse.next();
  }

  const isProtectedPath = pathname.startsWith('/dashboard') || pathname.startsWith('/invoices/new');

  if (isProtectedPath && !accessToken) {
    const redirectUrl = new URL('/login', request.url);
    redirectUrl.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(redirectUrl);
  }

  if (pathname.startsWith('/invoices/new') && role !== 'ADMIN') {
    return NextResponse.redirect(new URL('/dashboard?forbidden=1', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/login', '/dashboard/:path*', '/invoices/new'],
};
