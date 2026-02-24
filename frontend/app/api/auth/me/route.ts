import { NextRequest, NextResponse } from 'next/server';

import { fetchBackend } from '@/lib/api';
import { ACCESS_TOKEN_COOKIE, USER_EMAIL_COOKIE, USER_ROLE_COOKIE } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;

  if (!accessToken) {
    return NextResponse.json({ message: 'Not authenticated.' }, { status: 401 });
  }

  try {
    const response = await fetchBackend('/auth/me', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const data = await response.json();

    if (!response.ok) {
      const result = NextResponse.json(data, { status: response.status });
      clearSessionCookies(result);
      return result;
    }

    return NextResponse.json(data, { status: 200 });
  } catch {
    return NextResponse.json({ message: 'Unable to resolve current user.' }, { status: 502 });
  }
}

function clearSessionCookies(response: NextResponse): void {
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
}
