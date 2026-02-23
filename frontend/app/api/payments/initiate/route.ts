import { NextRequest, NextResponse } from 'next/server';

import { fetchBackend } from '@/lib/api';

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();

    const rawAppUrl = (process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin || '').trim();
    const origin = resolveOrigin(rawAppUrl, request.nextUrl.origin);
    const successUrl = new URL(`/p/${payload.invoiceId}?status=success`, origin).toString();
    const cancelUrl = new URL(`/p/${payload.invoiceId}?status=cancelled`, origin).toString();

    const response = await fetchBackend('/payments/initiate', {
      method: 'POST',
      body: JSON.stringify({
        ...payload,
        successUrl,
        cancelUrl,
      }),
    });

    const data = await response.json();

    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json({ message: 'Unable to initialize payment.' }, { status: 502 });
  }
}

function resolveOrigin(primary: string, fallback: string): string {
  try {
    return new URL(primary).origin;
  } catch {
    return new URL(fallback).origin;
  }
}
