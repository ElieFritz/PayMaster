import { NextRequest, NextResponse } from 'next/server';

import { fetchBackend } from '@/lib/api';
import { ACCESS_TOKEN_COOKIE, USER_ROLE_COOKIE } from '@/lib/auth';

const ALLOWED_STATUSES = new Set(['PENDING', 'PAID', 'FAILED', 'REFUNDED']);

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
    const invoiceId = resolveString(payload?.invoiceId);
    const status = resolveString(payload?.status)?.toUpperCase() || '';
    const paymentMethod = resolveString(payload?.paymentMethod)?.toUpperCase() || null;
    const note = resolveString(payload?.note);
    const sendReceipt = resolveBoolean(payload?.sendReceipt);

    if (!invoiceId) {
      return NextResponse.json({ message: 'invoiceId is required.' }, { status: 400 });
    }

    if (!ALLOWED_STATUSES.has(status)) {
      return NextResponse.json({ message: 'status is invalid.' }, { status: 400 });
    }

    const response = await fetchBackend(`/payments/invoices/${invoiceId}/manual-status`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        status,
        ...(paymentMethod ? { paymentMethod } : {}),
        ...(note ? { note } : {}),
        ...(sendReceipt !== null ? { sendReceipt } : {}),
      }),
    });

    const rawBody = await response.text();
    const parsedBody = parseJsonSafely(rawBody);

    if (parsedBody !== null) {
      return NextResponse.json(parsedBody, { status: response.status });
    }

    return new NextResponse(rawBody, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'text/plain; charset=utf-8',
      },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unexpected proxy error.';
    return NextResponse.json(
      { message: 'Unable to update invoice status manually.', detail },
      { status: 502 },
    );
  }
}

function resolveString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function resolveBoolean(value: unknown): boolean | null {
  if (typeof value !== 'boolean') {
    return null;
  }

  return value;
}

function parseJsonSafely(value: string): unknown | null {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
