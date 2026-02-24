import { NextResponse } from 'next/server';

import { fetchBackendRaw } from '@/lib/api';

type RouteContext = {
  params: {
    invoice_id: string;
  };
};

export async function GET(_request: Request, context: RouteContext) {
  const invoiceId = context.params.invoice_id;

  const response = await fetchBackendRaw(`/invoices/${invoiceId}/pdf`);

  if (!response.ok) {
    return NextResponse.json(
      { message: 'Unable to generate invoice PDF.' },
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
