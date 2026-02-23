import { NextRequest, NextResponse } from 'next/server';

import { fetchBackend } from '@/lib/api';

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const invoiceId = typeof payload?.invoiceId === 'string' ? payload.invoiceId : '';

    if (!invoiceId) {
      return NextResponse.json({ message: 'invoiceId is required.' }, { status: 400 });
    }

    const response = await fetchBackend(`/payments/invoices/${invoiceId}/sync-status`, {
      method: 'POST',
      body: JSON.stringify({
        provider: payload?.provider,
        providerReference: payload?.providerReference,
      }),
    });

    const data = await response.json();

    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json({ message: 'Unable to synchronize payment status.' }, { status: 502 });
  }
}
