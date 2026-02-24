import { NextRequest, NextResponse } from 'next/server';

import { fetchBackend } from '@/lib/api';

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();

    const rawAppUrl = (
      process.env.PAYMASTER_PUBLIC_BILLING_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      request.nextUrl.origin ||
      ''
    ).trim();
    const origin = resolveOrigin(rawAppUrl, request.nextUrl.origin);
    const publicInvoiceSlug = resolvePublicInvoiceSlug(payload);
    if (!publicInvoiceSlug) {
      return NextResponse.json({ message: 'invoiceId is required.' }, { status: 400 });
    }
    const successUrl = new URL(`/p/${encodeURIComponent(publicInvoiceSlug)}?status=success`, origin).toString();
    const cancelUrl = new URL(`/p/${encodeURIComponent(publicInvoiceSlug)}?status=cancelled`, origin).toString();

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

function resolvePublicInvoiceSlug(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return '';
  }

  const source = payload as Record<string, unknown>;
  const reference = typeof source.invoiceReference === 'string' ? source.invoiceReference.trim() : '';
  const invoiceId = typeof source.invoiceId === 'string' ? source.invoiceId.trim() : '';

  return reference || invoiceId;
}

function resolveOrigin(primary: string, fallback: string): string {
  try {
    return new URL(primary).origin;
  } catch {
    return new URL(fallback).origin;
  }
}
