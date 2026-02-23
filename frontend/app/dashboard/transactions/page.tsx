import Link from 'next/link';

import { InvoiceStatusPill } from '@/components/invoice/invoice-status-pill';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { getBackendUrl } from '@/lib/api';
import { PaymentTransactionsResponse } from '@/lib/schemas';

type TransactionsPageProps = {
  searchParams: {
    page?: string;
    status?: string;
    provider?: string;
    invoiceId?: string;
    search?: string;
    country?: string;
    fromDate?: string;
    toDate?: string;
  };
};

function toNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function money(value: number): string {
  return Number(value || 0).toLocaleString('fr-FR', {
    maximumFractionDigits: 2,
  });
}

function buildQueryString(searchParams: TransactionsPageProps['searchParams']): string {
  const params = new URLSearchParams();
  const page = toNumber(searchParams.page, 1);

  params.set('page', String(page));
  params.set('limit', '25');

  if (searchParams.status) {
    params.set('status', searchParams.status.toUpperCase());
  }

  if (searchParams.provider) {
    params.set('provider', searchParams.provider.toUpperCase());
  }

  if (searchParams.invoiceId) {
    params.set('invoiceId', searchParams.invoiceId);
  }

  if (searchParams.search) {
    params.set('search', searchParams.search.trim());
  }

  if (searchParams.country) {
    params.set('country', searchParams.country.trim().toUpperCase());
  }

  if (searchParams.fromDate) {
    params.set('fromDate', searchParams.fromDate);
  }

  if (searchParams.toDate) {
    params.set('toDate', searchParams.toDate);
  }

  return params.toString();
}

function buildExportQueryString(searchParams: TransactionsPageProps['searchParams']): string {
  const params = new URLSearchParams(buildQueryString(searchParams));
  params.set('page', '1');
  params.set('limit', '2000');
  return params.toString();
}

function pageHref(searchParams: TransactionsPageProps['searchParams'], targetPage: number): string {
  const params = new URLSearchParams();
  params.set('page', String(targetPage));
  if (searchParams.status) params.set('status', searchParams.status);
  if (searchParams.provider) params.set('provider', searchParams.provider);
  if (searchParams.invoiceId) params.set('invoiceId', searchParams.invoiceId);
  if (searchParams.search) params.set('search', searchParams.search);
  if (searchParams.country) params.set('country', searchParams.country);
  if (searchParams.fromDate) params.set('fromDate', searchParams.fromDate);
  if (searchParams.toDate) params.set('toDate', searchParams.toDate);
  return `/dashboard/transactions?${params.toString()}`;
}

function providerLabel(value: string): string {
  if (value === 'NOTCHPAY') return 'NotchPay';
  if (value === 'ZIKOPAY') return 'ZikoPay';
  return value;
}

async function getTransactions(
  searchParams: TransactionsPageProps['searchParams'],
): Promise<PaymentTransactionsResponse> {
  const response = await fetch(`${getBackendUrl()}/payments/transactions?${buildQueryString(searchParams)}`, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Impossible de charger les transactions.');
  }

  return response.json();
}

export default async function TransactionsPage({ searchParams }: TransactionsPageProps) {
  try {
    const transactions = await getTransactions(searchParams);
    const currentPage = toNumber(searchParams.page, 1);
    const exportUrl = `${getBackendUrl()}/payments/transactions/export?${buildExportQueryString(searchParams)}`;

    return (
      <main className="container py-10">
        <div className="space-y-6">
          <Card className="space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.2em] text-[#d8bb70]">Audit paiements</p>
                <CardTitle className="text-4xl">Traçabilite des transactions clients</CardTitle>
                <CardDescription>
                  Historique complet des paiements pour audit interne, litiges et comptabilite.
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href="/dashboard">
                  <Button variant="outline">Retour dashboard</Button>
                </Link>
                <a href={exportUrl} target="_blank" rel="noreferrer">
                  <Button>Exporter CSV</Button>
                </a>
              </div>
            </div>
          </Card>

          <Card className="space-y-5">
            <form className="grid gap-3 md:grid-cols-3 xl:grid-cols-7">
              <input type="hidden" name="invoiceId" defaultValue={searchParams.invoiceId || ''} />
              <input
                name="search"
                placeholder="Ref, transaction ID, client, email"
                defaultValue={searchParams.search || ''}
                className="h-11 rounded-md border border-[hsl(var(--border))] bg-black/25 px-3 text-sm xl:col-span-2"
              />
              <select
                name="status"
                defaultValue={searchParams.status || ''}
                className="h-11 rounded-md border border-[hsl(var(--border))] bg-black/25 px-3 text-sm"
              >
                <option value="">Tous statuts</option>
                <option value="PENDING">En attente</option>
                <option value="PAID">Payee</option>
                <option value="FAILED">Echec</option>
                <option value="REFUNDED">Remboursee</option>
              </select>
              <select
                name="provider"
                defaultValue={searchParams.provider || ''}
                className="h-11 rounded-md border border-[hsl(var(--border))] bg-black/25 px-3 text-sm"
              >
                <option value="">Tous providers</option>
                <option value="NOTCHPAY">NotchPay</option>
                <option value="ZIKOPAY">ZikoPay</option>
              </select>
              <input
                name="country"
                placeholder="Pays (CM, SN...)"
                defaultValue={searchParams.country || ''}
                className="h-11 rounded-md border border-[hsl(var(--border))] bg-black/25 px-3 text-sm uppercase"
              />
              <input
                type="date"
                name="fromDate"
                defaultValue={searchParams.fromDate || ''}
                className="h-11 rounded-md border border-[hsl(var(--border))] bg-black/25 px-3 text-sm"
              />
              <input
                type="date"
                name="toDate"
                defaultValue={searchParams.toDate || ''}
                className="h-11 rounded-md border border-[hsl(var(--border))] bg-black/25 px-3 text-sm"
              />
              <Button type="submit">Filtrer</Button>
            </form>

            <div className="flex items-center justify-between text-xs text-[hsl(var(--muted-foreground))]">
              <p>
                {transactions.items.length} transaction(s) affichee(s) sur {transactions.total}
              </p>
              <Link href="/dashboard/transactions" className="underline-offset-4 hover:underline">
                Reinitialiser les filtres
              </Link>
            </div>

            {searchParams.invoiceId && (
              <div className="rounded-lg border border-[#8e7640]/30 bg-[#15120b]/70 p-3 text-xs text-[#f0d58c]">
                Filtre actif: facture <span className="font-semibold">{searchParams.invoiceId}</span>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1250px] text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left text-[hsl(var(--muted-foreground))]">
                    <th className="py-3">Date</th>
                    <th className="py-3">Reference facture</th>
                    <th className="py-3">Payeur</th>
                    <th className="py-3">Pays</th>
                    <th className="py-3">Provider</th>
                    <th className="py-3">Transaction provider</th>
                    <th className="py-3">Statut</th>
                    <th className="py-3">Montant</th>
                    <th className="py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.items.length === 0 && (
                    <tr>
                      <td className="py-6 text-center text-[hsl(var(--muted-foreground))]" colSpan={9}>
                        Aucune transaction trouvee.
                      </td>
                    </tr>
                  )}
                  {transactions.items.map((transaction) => (
                    <tr key={transaction.id} className="border-b border-white/5 align-top">
                      <td className="py-3">
                        {new Date(transaction.createdAt).toLocaleDateString('fr-FR', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                        })}
                        <p className="text-xs text-[hsl(var(--muted-foreground))]">
                          {new Date(transaction.createdAt).toLocaleTimeString('fr-FR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </td>
                      <td className="py-3 font-medium">{transaction.reference}</td>
                      <td className="py-3">
                        {transaction.payerName || '-'}
                        <p className="text-xs text-[hsl(var(--muted-foreground))]">
                          {transaction.payerEmail || '-'}
                        </p>
                        <p className="text-xs text-[hsl(var(--muted-foreground))]">
                          {transaction.payerPhone || '-'}
                        </p>
                      </td>
                      <td className="py-3">{transaction.country}</td>
                      <td className="py-3">{providerLabel(transaction.provider)}</td>
                      <td className="py-3 break-all">{transaction.providerTransactionId || '-'}</td>
                      <td className="py-3">
                        <InvoiceStatusPill status={transaction.status} />
                      </td>
                      <td className="py-3">
                        {money(transaction.amount)} {transaction.currency}
                      </td>
                      <td className="py-3">
                        <div className="flex flex-col gap-2">
                          <Link href={`/p/${transaction.invoiceId}`}>
                            <Button variant="outline" className="h-9 px-3 text-xs">
                              Ouvrir facture
                            </Button>
                          </Link>
                          <a href={`/api/invoices/${transaction.invoiceId}/pdf`}>
                            <Button variant="outline" className="h-9 px-3 text-xs">
                              PDF
                            </Button>
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                Page {transactions.page} / {transactions.totalPages}
              </p>
              <div className="flex gap-2">
                <Link href={pageHref(searchParams, Math.max(1, currentPage - 1))}>
                  <Button variant="outline" disabled={currentPage <= 1}>
                    Precedent
                  </Button>
                </Link>
                <Link
                  href={pageHref(searchParams, Math.min(transactions.totalPages, currentPage + 1))}
                >
                  <Button variant="outline" disabled={currentPage >= transactions.totalPages}>
                    Suivant
                  </Button>
                </Link>
              </div>
            </div>
          </Card>
        </div>
      </main>
    );
  } catch {
    return (
      <main className="container py-10">
        <Card className="mx-auto max-w-3xl space-y-4">
          <CardTitle>Traçabilite indisponible</CardTitle>
          <CardDescription>
            Impossible de charger les transactions. Verifiez la connectivite backend et la base.
          </CardDescription>
          <Link href="/dashboard">
            <Button variant="outline">Retour dashboard</Button>
          </Link>
        </Card>
      </main>
    );
  }
}
