import { NextRequest, NextResponse } from 'next/server';

import { fetchBackendRaw } from '@/lib/api';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;

  if (!accessToken) {
    return NextResponse.json({ message: 'Not authenticated.' }, { status: 401 });
  }

  const query = request.nextUrl.search || '';

  try {
    const response = await fetchBackendRaw(`/payments/transactions/export${query}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const body = await response.arrayBuffer();

    return new NextResponse(body, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'text/csv; charset=utf-8',
        'Content-Disposition':
          response.headers.get('content-disposition') ||
          'attachment; filename="payment-transactions.csv"',
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return NextResponse.json({ message: 'Unable to export transactions.' }, { status: 502 });
  }
}
