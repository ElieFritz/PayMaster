import { NextRequest, NextResponse } from 'next/server';

import { fetchBackend } from '@/lib/api';
import { ACCESS_TOKEN_COOKIE, USER_EMAIL_COOKIE, USER_ROLE_COOKIE, UserRole } from '@/lib/auth';

type LoginResponse = {
  accessToken: string;
  user: {
    email: string;
    role: UserRole;
  };
};

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();

    const response = await fetchBackend('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const data = (await response.json()) as Partial<LoginResponse> & { message?: unknown };

    if (!response.ok || !data.accessToken || !data.user?.email || !data.user?.role) {
      return NextResponse.json(
        { message: normalizeErrorMessage(data.message) || 'Authentication failed.' },
        { status: response.status || 401 },
      );
    }

    const result = NextResponse.json({
      user: data.user,
    });
    const secure = process.env.NODE_ENV === 'production';

    result.cookies.set(ACCESS_TOKEN_COOKIE, data.accessToken, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 12,
    });
    result.cookies.set(USER_ROLE_COOKIE, data.user.role, {
      httpOnly: false,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 12,
    });
    result.cookies.set(USER_EMAIL_COOKIE, data.user.email, {
      httpOnly: false,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 12,
    });

    return result;
  } catch {
    return NextResponse.json({ message: 'Unable to login.' }, { status: 502 });
  }
}

function normalizeErrorMessage(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  if (Array.isArray(value) && value.length > 0) {
    return value.map((item) => String(item)).join(', ');
  }

  return null;
}
