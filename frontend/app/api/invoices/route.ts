import { NextRequest, NextResponse } from 'next/server';

import { fetchBackend } from '@/lib/api';
import { ACCESS_TOKEN_COOKIE, USER_ROLE_COOKIE } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;

  if (!accessToken) {
    return NextResponse.json({ message: 'Not authenticated.' }, { status: 401 });
  }

  const role = request.cookies.get(USER_ROLE_COOKIE)?.value;
  if (role !== 'ADMIN') {
    return NextResponse.json({ message: 'Insufficient role permission.' }, { status: 403 });
  }

  try {
    const payload = await request.json();

    const response = await fetchBackend('/invoices', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json({ message: 'Unable to create invoice.' }, { status: 502 });
  }
}
