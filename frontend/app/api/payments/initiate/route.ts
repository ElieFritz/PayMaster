import { NextRequest, NextResponse } from 'next/server';

import { fetchBackend } from '@/lib/api';
import { resolvePublicOrigin } from '@/lib/public-origin';

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const invoiceId = resolveInvoiceId(payload);
    const country = resolveCountry(payload);
    const origin = resolvePublicOrigin([
      process.env.PAYMASTER_PUBLIC_BILLING_URL,
      process.env.NEXT_PUBLIC_APP_URL,
      resolveForwardedOrigin(request),
      request.nextUrl.origin,
    ]);
    if (!origin) {
      return NextResponse.json({ message: 'Unable to resolve billing origin.' }, { status: 500 });
    }

    if (!invoiceId) {
      return NextResponse.json({ message: 'invoiceId is required.' }, { status: 400 });
    }
    const publicInvoiceSlug = resolvePublicInvoiceSlug(payload, invoiceId);
    const successUrl = new URL(`/p/${encodeURIComponent(publicInvoiceSlug)}?status=success`, origin).toString();
    const cancelUrl = new URL(`/p/${encodeURIComponent(publicInvoiceSlug)}?status=cancelled`, origin).toString();

    const response = await fetchBackend('/payments/initiate', {
      method: 'POST',
      body: JSON.stringify({
        invoiceId,
        ...(country ? { country } : {}),
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

function resolvePublicInvoiceSlug(payload: unknown, invoiceId: string): string {
  if (!payload || typeof payload !== 'object') {
    return invoiceId;
  }

  const source = payload as Record<string, unknown>;
  const reference = typeof source.invoiceReference === 'string' ? source.invoiceReference.trim() : '';

  return reference || invoiceId;
}

function resolveInvoiceId(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return '';
  }

  const source = payload as Record<string, unknown>;
  return typeof source.invoiceId === 'string' ? source.invoiceId.trim() : '';
}

function resolveCountry(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const source = payload as Record<string, unknown>;
  const value = typeof source.country === 'string' ? source.country.trim().toUpperCase() : '';
  if (value.length !== 2) {
    return null;
  }

  return value;
}

function resolveForwardedOrigin(request: NextRequest): string | null {
  const forwardedOrigin = firstHeaderValue(request.headers.get('x-forwarded-origin'));
  if (forwardedOrigin) {
    return forwardedOrigin;
  }

  const forwardedProto = firstHeaderValue(request.headers.get('x-forwarded-proto'));
  const forwardedHost = firstHeaderValue(request.headers.get('x-forwarded-host'));
  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  const host = firstHeaderValue(request.headers.get('host'));
  if (!host) {
    return null;
  }

  const protocol = request.nextUrl.protocol.replace(/:$/, '') || 'https';
  return `${protocol}://${host}`;
}

function firstHeaderValue(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const first = value.split(',')[0]?.trim();
  return first || null;
}
