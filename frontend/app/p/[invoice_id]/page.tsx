import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { fetchBackendRaw } from '@/lib/api';
import { Invoice } from '@/lib/schemas';

import { PayNowButton } from './pay-now-button';

type PaymentPageProps = {
  params: {
    invoice_id: string;
  };
};

const STATUS_STYLE: Record<
  Invoice['status'],
  { label: string; helper: string; className: string }
> = {
  PENDING: {
    label: 'En attente',
    helper: 'Paiement a confirmer',
    className: 'border-[#b9d3ff] bg-[#ecf4ff] text-[#174392]',
  },
  PAID: {
    label: 'Payee',
    helper: 'Paiement confirme',
    className: 'border-[#b8e5cb] bg-[#e7f8ee] text-[#14603a]',
  },
  FAILED: {
    label: 'Echec',
    helper: 'Nouvelle tentative requise',
    className: 'border-[#f4c0c8] bg-[#fff0f2] text-[#a52d40]',
  },
  REFUNDED: {
    label: 'Remboursee',
    helper: 'Transaction annulee',
    className: 'border-[#d4ddee] bg-[#f2f5fb] text-[#3f4f70]',
  },
};

const SERVICE_CATEGORY_LABEL: Record<string, string> = {
  BOOST: 'Boost',
  WEB: 'Web',
  ADS: 'Ads',
  OTHER: 'Autre',
};

const COMPANY_LEGAL_IDENTIFIERS = [
  { label: 'RCCM', value: 'CM-TPR-2026-B-00123' },
  { label: 'NIU', value: 'M092612345678A' },
  { label: 'Siege', value: 'Douala, Cameroun' },
  { label: 'Contact', value: 'billing@boost-performers.com' },
];
const INVOICE_FETCH_MAX_ATTEMPTS = 3;
const RETRYABLE_INVOICE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

async function getInvoice(invoiceId: string): Promise<Invoice | null> {
  const encoded = encodeURIComponent(invoiceId);
  const candidates = looksLikeUuid(invoiceId)
    ? [`/invoices/${encoded}`, `/invoices/public/reference/${encoded}`]
    : [`/invoices/public/reference/${encoded}`, `/invoices/${encoded}`];
  let loadError: Error | null = null;

  for (const path of candidates) {
    const response = await fetchInvoiceWithRetry(path);

    if (response.status === 404 || response.status === 400) {
      continue;
    }

    if (!response.ok) {
      loadError = new Error(`Unable to load invoice (status ${response.status}).`);
      continue;
    }

    return response.json();
  }

  if (loadError) {
    throw loadError;
  }

  return null;
}

async function fetchInvoiceWithRetry(path: string): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= INVOICE_FETCH_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchBackendRaw(path);
      if (!shouldRetryInvoiceStatus(response.status) || attempt === INVOICE_FETCH_MAX_ATTEMPTS) {
        return response;
      }
    } catch (error) {
      const normalizedError =
        error instanceof Error ? error : new Error('Unknown error while loading invoice.');
      lastError = normalizedError;

      if (attempt === INVOICE_FETCH_MAX_ATTEMPTS) {
        throw normalizedError;
      }
    }

    await delay(attempt * 400);
  }

  throw lastError || new Error('Unable to load invoice.');
}

function shouldRetryInvoiceStatus(status: number): boolean {
  return RETRYABLE_INVOICE_STATUS.has(status);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value));
}

function formatMoney(amount: number, currency: Invoice['currency']) {
  return `${Number(amount).toLocaleString('fr-FR')} ${currency}`;
}

function looksLikeUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export default async function PaymentPage({ params }: PaymentPageProps) {
  let invoice: Invoice | null = null;

  try {
    invoice = await getInvoice(params.invoice_id);
  } catch {
    return (
      <main className="container py-14">
        <Card className="mx-auto max-w-2xl space-y-4">
          <CardTitle>Paiement indisponible</CardTitle>
          <CardDescription>
            Impossible de charger la facture pour le moment. Reessayez dans quelques instants.
          </CardDescription>
          <Link href="/">
            <Button variant="outline">Retour accueil</Button>
          </Link>
        </Card>
      </main>
    );
  }

  if (!invoice) {
    notFound();
  }

  const services = Array.isArray(invoice.metadata?.services) ? invoice.metadata.services : [];
  const paymentProvider = invoice.country === 'CM' ? 'NotchPay' : 'ZikoPay';
  const providerReference =
    invoice.metadata?.payment?.providerReference || invoice.transactionId || invoice.reference;
  const pdfDownloadUrl = `/api/invoices/${invoice.id}/pdf`;
  const receiptDownloadUrl = `/api/invoices/${invoice.id}/receipt-pdf`;
  const status = STATUS_STYLE[invoice.status];
  const servicesSubtotal = services.reduce(
    (sum, line) => sum + Number(line.quantity) * Number(line.unitPrice),
    0,
  );
  const displaySubtotal = services.length > 0 ? servicesSubtotal : Number(invoice.amount);
  const servicesCount = services.reduce((sum, line) => sum + Number(line.quantity), 0);
  const projectName = invoice.metadata?.projectName?.trim();
  const notes = invoice.metadata?.notes?.trim();

  return (
    <main className="relative isolate overflow-hidden py-10 sm:py-14">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[-10rem] h-[24rem] w-[56rem] -translate-x-1/2 rounded-full bg-[#1f6ff2]/30 blur-3xl" />
        <div className="absolute bottom-[-6rem] right-[-4rem] h-[20rem] w-[20rem] rounded-full bg-[#0d3d9d]/30 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(140deg,rgba(7,22,56,0.86),rgba(8,32,82,0.92))]" />
      </div>

      <section className="container">
        <article className="mx-auto max-w-5xl animate-shimmerIn overflow-hidden rounded-2xl border border-[#96befb]/60 bg-white shadow-[0_40px_90px_rgba(5,18,47,0.5)] sm:rounded-[30px]">
          <header className="relative overflow-hidden bg-[linear-gradient(130deg,#0c3b9d_0%,#1258da_55%,#2a8cf7_100%)] px-6 py-7 sm:px-8 sm:py-9">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_84%_16%,rgba(255,255,255,0.28),transparent_33%)]" />
            <div className="relative flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex items-start gap-4">
                <div className="shrink-0 rounded-2xl border border-white/35 bg-white/95 p-2 shadow-[0_10px_25px_rgba(4,22,62,0.28)]">
                  <Image
                    src="/boost-performers-logo.svg"
                    alt="Boost Performers"
                    width={180}
                    height={72}
                    className="h-12 w-auto sm:h-16"
                    priority
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-100/95">
                    Boost Performers
                  </p>
                  <h1 className="mt-2 break-words text-2xl font-bold text-white sm:text-4xl">
                    Facture {invoice.reference}
                  </h1>
                  <p className="mt-1 text-sm text-blue-50/90">
                    Document de paiement securise - www.boost-performers.com
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[300px] lg:grid-cols-1">
                <div className="rounded-2xl border border-white/35 bg-white/15 p-3 backdrop-blur">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-100">
                    Statut facture
                  </p>
                  <span
                    className={`mt-2 inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${status.className}`}
                  >
                    {status.label}
                  </span>
                  <p className="mt-2 text-xs text-blue-50/90">{status.helper}</p>
                </div>

                <div className="rounded-2xl border border-white/35 bg-white/15 p-3 backdrop-blur">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-100">
                    Date d emission
                  </p>
                  <p className="mt-2 text-lg font-semibold text-white">{formatDate(invoice.createdAt)}</p>
                  <p className="mt-1 break-all text-xs text-blue-50/90">Ref: {invoice.reference}</p>
                </div>
              </div>
            </div>

            <div className="relative mt-5 rounded-2xl border border-white/30 bg-white/12 p-4 backdrop-blur">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-100">
                Identite entreprise
              </p>
              <div className="mt-2 grid gap-2 text-xs text-blue-50/95 sm:grid-cols-2 lg:grid-cols-4">
                {COMPANY_LEGAL_IDENTIFIERS.map((item) => (
                  <p key={item.label} className="break-words">
                    <span className="font-semibold text-white">{item.label}:</span> {item.value}
                  </p>
                ))}
              </div>
              <p className="mt-2 text-xs text-blue-50/95">
                Site officiel: <span className="font-semibold text-white">www.boost-performers.com</span>
              </p>
            </div>
          </header>

          <div className="grid gap-4 border-b border-[#d7e7ff] bg-[#f5f9ff] px-6 py-5 sm:px-8 lg:grid-cols-3">
            <div className="rounded-2xl border border-[#d0e4ff] bg-white/95 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#5670a0]">
                Facture a
              </p>
              <p className="mt-2 break-words text-sm font-semibold text-[#0f327a]">{invoice.customerName}</p>
              <p className="mt-1 break-all text-xs text-[#546b93]">{invoice.customerEmail}</p>
            </div>

            <div className="rounded-2xl border border-[#d0e4ff] bg-white/95 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#5670a0]">
                Mission
              </p>
              <p className="mt-2 break-words text-sm font-semibold text-[#0f327a]">
                {projectName || 'Prestation digitale'}
              </p>
              <p className="mt-1 text-xs text-[#546b93]">{services.length} ligne(s) de facturation</p>
            </div>

            <div className="rounded-2xl border border-[#d0e4ff] bg-white/95 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#5670a0]">
                Paiement securise
              </p>
              <p className="mt-2 text-sm font-semibold text-[#0f327a]">
                {paymentProvider} - {invoice.currency}
              </p>
              <p className="mt-1 break-all text-xs text-[#546b93]">Ref transaction: {providerReference}</p>
            </div>
          </div>

          <section className="border-b border-[#d7e7ff] bg-[#eef5ff] px-6 py-5 sm:px-8">
            <div className="rounded-2xl border border-[#b9d3ff] bg-white p-4 shadow-[0_14px_35px_rgba(16,55,128,0.12)]">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#5a74a2]">
                    Paiement
                  </p>
                  <p className="mt-1 text-xl font-bold text-[#0d3079]">Regler cette facture maintenant</p>
                  <p className="mt-1 text-sm text-[#5a74a2]">
                    Transaction securisee via {paymentProvider}. Recu PDF envoye apres confirmation.
                  </p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  <PayNowButton
                    invoiceId={invoice.id}
                    country={invoice.country}
                    status={invoice.status}
                    providerReference={providerReference}
                  />
                  <a
                    href={pdfDownloadUrl}
                    download
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-11 items-center justify-center rounded-md border border-[#bdd4fb] bg-white px-5 text-sm font-semibold text-[#134094] transition-colors hover:bg-[#edf4ff]"
                  >
                    Telecharger facture PDF
                  </a>
                  {invoice.status === 'PAID' && (
                    <a
                      href={receiptDownloadUrl}
                      download
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-11 items-center justify-center rounded-md border border-[#b8e5cb] bg-[#e7f8ee] px-5 text-sm font-semibold text-[#14603a] transition-colors hover:bg-[#daf2e4]"
                    >
                      Telecharger recu PDF
                    </a>
                  )}
                </div>
              </div>
            </div>
          </section>

          <div className="px-6 py-6 sm:px-8 sm:py-7">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold text-[#0d3079]">Details de la facture</h2>
                <p className="mt-1 text-sm text-[#546b93]">
                  Lignes facturees et calcul du montant total.
                </p>
              </div>
              <p className="w-full rounded-full border border-[#d0e2ff] bg-[#f3f8ff] px-4 py-2 text-center text-sm font-semibold text-[#174392] sm:w-auto">
                Montant total: {formatMoney(Number(invoice.amount), invoice.currency)}
              </p>
            </div>

            <div className="mt-5 overflow-hidden rounded-2xl border border-[#d8e8ff]">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[580px] text-sm">
                  <thead className="bg-[#eef5ff] text-xs uppercase tracking-[0.08em] text-[#4f6691]">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">Type</th>
                      <th className="px-4 py-3 text-left font-semibold">Service</th>
                      <th className="px-4 py-3 text-center font-semibold">Qte</th>
                      <th className="px-4 py-3 text-right font-semibold">PU</th>
                      <th className="px-4 py-3 text-right font-semibold">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {services.length === 0 && (
                      <tr>
                        <td className="px-4 py-4 text-sm text-[#4f6691]" colSpan={5}>
                          Aucune ligne detaillee, la facture est en montant global.
                        </td>
                      </tr>
                    )}
                    {services.map((line, idx) => {
                      const lineTotal = Number(line.quantity) * Number(line.unitPrice);
                      const rowColor = idx % 2 === 0 ? 'bg-white' : 'bg-[#f9fbff]';

                      return (
                        <tr key={`${line.name}-${idx}`} className={rowColor}>
                          <td className="px-4 py-3 font-medium text-[#1b438f]">
                            {SERVICE_CATEGORY_LABEL[line.category] || line.category}
                          </td>
                          <td className="max-w-[280px] break-words px-4 py-3 text-[#24426f]">
                            {line.name}
                          </td>
                          <td className="px-4 py-3 text-center text-[#24426f]">{line.quantity}</td>
                          <td className="px-4 py-3 text-right text-[#24426f]">
                            {formatMoney(Number(line.unitPrice), invoice.currency)}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-[#12347f]">
                            {formatMoney(lineTotal, invoice.currency)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <aside className="w-full rounded-2xl border border-[#bdd6ff] bg-[linear-gradient(180deg,#f8fbff_0%,#eef5ff_100%)] p-5 sm:max-w-[320px]">
                <p className="text-sm font-semibold uppercase tracking-[0.1em] text-[#4f6691]">Resume</p>
                <div className="mt-4 space-y-3 text-sm">
                  <div className="flex items-center justify-between text-[#3a5686]">
                    <span>Sous-total</span>
                    <span>{formatMoney(displaySubtotal, invoice.currency)}</span>
                  </div>
                  <div className="flex items-center justify-between text-[#3a5686]">
                    <span>Quantite totale</span>
                    <span>{servicesCount || 1}</span>
                  </div>
                  <div className="h-px bg-[#d3e5ff]" />
                  <div className="flex items-center justify-between text-base font-semibold text-[#10317b]">
                    <span>Montant total</span>
                    <span>{formatMoney(Number(invoice.amount), invoice.currency)}</span>
                  </div>
                </div>
              </aside>
            </div>
          </div>

          <footer className="border-t border-[#d7e7ff] bg-[#f8fbff] px-6 py-4 text-[11px] leading-5 text-[#647ba6] sm:px-8">
            <div className="space-y-2">
              <p className="break-words">
                Mentions legales: Boost Performers SARL | RCCM: CM-TPR-2026-B-00123 | NIU:
                M092612345678A | Siege: Douala, Cameroun | Site: www.boost-performers.com
              </p>
              <p className="break-words">
                Conditions de remboursement: les prestations digitales entamees sont non remboursables.
                Les annulations avant demarrage peuvent entrainer des frais administratifs de 15%. Les
                litiges sont regles d abord a l amiable puis selon les juridictions competentes
                CEMAC/UEMOA.
              </p>
              {notes && <p className="break-words">Note client: {notes}</p>}
            </div>
          </footer>
        </article>
      </section>
    </main>
  );
}
