import { NextResponse } from 'next/server';

import { fetchBackendRaw } from '@/lib/api';

type RouteContext = {
  params: {
    invoice_id: string;
  };
};

export async function GET(_request: Request, context: RouteContext) {
  const invoiceIdentifier = context.params.invoice_id;
  const pathResult = await resolveBackendReceiptPdfPath(invoiceIdentifier);

  if (pathResult.kind === 'error') {
    return pathResult.response;
  }

  const response = await fetchPdfWithRetry(pathResult.path);

  if (!response.ok) {
    const backendMessage = await extractBackendErrorMessage(response);
    return NextResponse.json(
      { message: backendMessage || 'Unable to generate receipt PDF.' },
      { status: response.status },
    );
  }

  const pdfBytes = await response.arrayBuffer();
  const contentDisposition =
    response.headers.get('content-disposition') ||
    buildAttachmentContentDisposition(`receipt-${invoiceIdentifier}.pdf`);

  return new NextResponse(pdfBytes, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': contentDisposition,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

async function resolveBackendReceiptPdfPath(
  invoiceIdentifier: string,
): Promise<
  | { kind: 'ok'; path: string }
  | { kind: 'error'; response: NextResponse }
> {
  if (looksLikeUuid(invoiceIdentifier)) {
    return {
      kind: 'ok',
      path: `/payments/invoices/${encodeURIComponent(invoiceIdentifier)}/receipt-pdf`,
    };
  }

  const reference = encodeURIComponent(invoiceIdentifier);
  let invoiceResponse: Response;
  try {
    invoiceResponse = await fetchBackendRaw(`/invoices/public/reference/${reference}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown backend connection error.';
    return {
      kind: 'error',
      response: NextResponse.json(
        { message: `Unable to resolve invoice for receipt download: ${message}` },
        { status: 503 },
      ),
    };
  }

  if (invoiceResponse.status === 404) {
    return {
      kind: 'error',
      response: NextResponse.json({ message: 'Invoice not found.' }, { status: 404 }),
    };
  }

  if (!invoiceResponse.ok) {
    const message = await extractBackendErrorMessage(invoiceResponse);
    return {
      kind: 'error',
      response: NextResponse.json(
        { message: message || 'Unable to resolve invoice for receipt download.' },
        { status: invoiceResponse.status },
      ),
    };
  }

  const payload = (await invoiceResponse.json()) as { id?: unknown };
  const resolvedInvoiceId = typeof payload.id === 'string' ? payload.id.trim() : '';
  if (!looksLikeUuid(resolvedInvoiceId)) {
    return {
      kind: 'error',
      response: NextResponse.json(
        { message: 'Resolved invoice id is invalid for receipt download.' },
        { status: 502 },
      ),
    };
  }

  return {
    kind: 'ok',
    path: `/payments/invoices/${encodeURIComponent(resolvedInvoiceId)}/receipt-pdf`,
  };
}

async function fetchPdfWithRetry(backendPath: string): Promise<Response> {
  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetchBackendRaw(backendPath);

      if (!shouldRetryStatus(response.status) || attempt === maxAttempts) {
        return response;
      }
    } catch (error) {
      if (attempt === maxAttempts) {
        const message = error instanceof Error ? error.message : 'Unknown backend connection error.';
        return NextResponse.json(
          { message: `Unable to reach billing backend for receipt PDF: ${message}` },
          { status: 503 },
        );
      }
    }

    await delay(attempt * 600);
  }

  return NextResponse.json(
    { message: 'Unable to generate receipt PDF.' },
    { status: 503 },
  );
}

function shouldRetryStatus(status: number): boolean {
  return status === 502 || status === 503 || status === 504;
}

function looksLikeUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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

function buildAttachmentContentDisposition(filename: string): string {
  const sanitized = filename.replace(/[^A-Za-z0-9._-]/g, '_');
  const encoded = encodeURIComponent(sanitized);
  return `attachment; filename="${sanitized}"; filename*=UTF-8''${encoded}`;
}
