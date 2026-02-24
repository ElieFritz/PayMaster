import { NextRequest, NextResponse } from 'next/server';

import { ACCESS_TOKEN_COOKIE, USER_EMAIL_COOKIE, USER_ROLE_COOKIE } from '@/lib/auth';

export async function POST() {
  return buildLogoutResponse(NextResponse.json({ success: true }));
}

export async function GET(request: NextRequest) {
  const targetUrl = new URL('/login', request.url);
  return buildLogoutResponse(NextResponse.redirect(targetUrl));
}

function buildLogoutResponse(response: NextResponse): NextResponse {
  response.cookies.set(ACCESS_TOKEN_COOKIE, '', {
    path: '/',
    maxAge: 0,
  });
  response.cookies.set(USER_ROLE_COOKIE, '', {
    path: '/',
    maxAge: 0,
  });
  response.cookies.set(USER_EMAIL_COOKIE, '', {
    path: '/',
    maxAge: 0,
  });

  return response;
}
