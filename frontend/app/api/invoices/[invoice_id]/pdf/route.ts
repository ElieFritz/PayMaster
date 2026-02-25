import { NextResponse } from 'next/server';

import { fetchBackendRaw } from '@/lib/api';

type RouteContext = {
  params: {
    invoice_id: string;
  };
};

export async function GET(_request: Request, context: RouteContext) {
  const invoiceId = context.params.invoice_id;
  const response = await fetchPdfWithRetry(invoiceId);

  if (!response.ok) {
    const backendMessage = await extractBackendErrorMessage(response);
    return NextResponse.json(
      { message: backendMessage || 'Unable to generate invoice PDF.' },
      { status: response.status },
    );
  }

  const pdfBytes = await response.arrayBuffer();
  const contentDisposition =
    response.headers.get('content-disposition') || `attachment; filename="invoice-${invoiceId}.pdf"`;

  return new NextResponse(pdfBytes, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': contentDisposition,
      'Cache-Control': 'no-store',
    },
  });
}

async function fetchPdfWithRetry(invoiceId: string): Promise<Response> {
  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetchBackendRaw(`/invoices/${invoiceId}/pdf`);

      if (!shouldRetryStatus(response.status) || attempt === maxAttempts) {
        return response;
      }
    } catch (error) {
      if (attempt === maxAttempts) {
        const message = error instanceof Error ? error.message : 'Unknown backend connection error.';
        return NextResponse.json(
          { message: `Unable to reach billing backend for invoice PDF: ${message}` },
          { status: 503 },
        );
      }
    }

    await delay(attempt * 600);
  }

  return NextResponse.json(
    { message: 'Unable to generate invoice PDF.' },
    { status: 503 },
  );
}

function shouldRetryStatus(status: number): boolean {
  return status === 502 || status === 503 || status === 504;
}

async function extractBackendErrorMessage(response: Response): Promise<string | null> {
  try {
    const payload = (await response.clone().json()) as { message?: unknown };
    if (Array.isArray(payload.message)) {
      return payload.message.map((item) => String(item)).join(', ');
    }

    if (typeof payload.message === 'string' && payload.message.trim().length > 0) {
      return payload.message.trim();
    }
  } catch {
    // Ignore JSON parsing errors and try plain text fallback.
  }

  try {
    const text = (await response.clone().text()).trim();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
