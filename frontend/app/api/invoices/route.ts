import { NextRequest, NextResponse } from 'next/server';

import { fetchBackend } from '@/lib/api';

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();

    const response = await fetchBackend('/invoices', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json({ message: 'Unable to create invoice.' }, { status: 502 });
  }
}
