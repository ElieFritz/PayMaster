import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { InvoiceStatusPill } from '@/components/invoice/invoice-status-pill';
import { ManualStatusAction } from '@/components/invoice/manual-status-action';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { fetchBackendRaw } from '@/lib/api';
import { ACCESS_TOKEN_COOKIE, USER_EMAIL_COOKIE, USER_ROLE_COOKIE, UserRole } from '@/lib/auth';
import { InvoiceStats, InvoicesResponse, PaymentTransactionsResponse } from '@/lib/schemas';

type DashboardPageProps = {
  searchParams: {
    page?: string;
    status?: string;
    provider?: string;
    search?: string;
    country?: string;
    fromDate?: string;
    toDate?: string;
    forbidden?: string;
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

function buildQueryString(searchParams: DashboardPageProps['searchParams']): string {
  const params = new URLSearchParams();
  const page = toNumber(searchParams.page, 1);

  params.set('page', String(page));
  params.set('limit', '12');

  if (searchParams.status) {
    params.set('status', searchParams.status.toUpperCase());
  }

  if (searchParams.search) {
    params.set('search', searchParams.search.trim());
  }

  if (searchParams.country) {
    params.set('country', searchParams.country.trim().toUpperCase());
  }

  return params.toString();
}

function buildTransactionsQueryString(
  searchParams: DashboardPageProps['searchParams'],
  limit: number,
): string {
  const params = new URLSearchParams();
  params.set('page', '1');
  params.set('limit', String(limit));

  if (searchParams.status) {
    params.set('status', searchParams.status.toUpperCase());
  }

  if (searchParams.search) {
    params.set('search', searchParams.search.trim());
  }

  if (searchParams.country) {
    params.set('country', searchParams.country.trim().toUpperCase());
  }

  if (searchParams.provider) {
    params.set('provider', searchParams.provider.trim().toUpperCase());
  }

  if (searchParams.fromDate) {
    params.set('fromDate', searchParams.fromDate);
  }

  if (searchParams.toDate) {
    params.set('toDate', searchParams.toDate);
  }

  return params.toString();
}

function pageHref(
  searchParams: DashboardPageProps['searchParams'],
  targetPage: number,
): string {
  const params = new URLSearchParams();
  params.set('page', String(targetPage));
  if (searchParams.status) params.set('status', searchParams.status);
  if (searchParams.provider) params.set('provider', searchParams.provider);
  if (searchParams.search) params.set('search', searchParams.search);
  if (searchParams.country) params.set('country', searchParams.country);
  if (searchParams.fromDate) params.set('fromDate', searchParams.fromDate);
  if (searchParams.toDate) params.set('toDate', searchParams.toDate);

  return `/dashboard?${params.toString()}`;
}

async function getStats(accessToken: string): Promise<InvoiceStats> {
  const response = await fetchBackendRaw('/invoices/stats/overview', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error('Impossible de charger les statistiques.');
  }

  return response.json();
}

async function getInvoices(
  searchParams: DashboardPageProps['searchParams'],
  accessToken: string,
): Promise<InvoicesResponse> {
  const response = await fetchBackendRaw(`/invoices?${buildQueryString(searchParams)}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error('Impossible de charger la liste des factures.');
  }

  return response.json();
}

async function getTransactions(
  searchParams: DashboardPageProps['searchParams'],
  accessToken: string,
): Promise<PaymentTransactionsResponse> {
  const response = await fetchBackendRaw(
    `/payments/transactions?${buildTransactionsQueryString(searchParams, 8)}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error('Impossible de charger les transactions de paiement.');
  }

  return response.json();
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const cookieStore = cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;

  if (!accessToken) {
    redirect('/login');
  }

  const roleCookie = cookieStore.get(USER_ROLE_COOKIE)?.value;
  const userRole: UserRole = roleCookie === 'ADMIN' ? 'ADMIN' : 'ACCOUNTANT';
  const userEmail = cookieStore.get(USER_EMAIL_COOKIE)?.value || '';
  const canEdit = userRole === 'ADMIN';

  try {
    const [stats, invoices, transactions] = await Promise.all([
      getStats(accessToken),
      getInvoices(searchParams, accessToken),
      getTransactions(searchParams, accessToken).catch(() => null),
    ]);
    const currentPage = toNumber(searchParams.page, 1);
    const accountingExportUrl = `/api/payments/transactions/export?${buildTransactionsQueryString(searchParams, 1000)}`;
    const fullTraceabilityHref = `/dashboard/transactions?${buildTransactionsQueryString(searchParams, 25)}`;

    return (
      <main className="container py-10">
        <div className="space-y-8">
          <Card className="animate-shimmerIn space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.2em] text-[#d8bb70]">
                  The Performers Dashboard
                </p>
                <CardTitle className="text-4xl md:text-5xl">Pilotage Facturation & Paiements</CardTitle>
                <CardDescription className="max-w-3xl">
                  Emettre des factures, suivre les statuts et ouvrir la page publique de paiement.
                </CardDescription>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  Connecte en tant que {userRole === 'ADMIN' ? 'Admin' : 'Comptable'}
                  {userEmail ? ` (${userEmail})` : ''}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {canEdit && (
                  <Link href="/invoices/new">
                    <Button>Emettre une facture</Button>
                  </Link>
                )}
                <Link href={fullTraceabilityHref}>
                  <Button variant="outline">Traçabilite paiements</Button>
                </Link>
                <a href="/api/auth/logout">
                  <Button variant="ghost">Deconnexion</Button>
                </a>
              </div>
            </div>
            {searchParams.forbidden === '1' && (
              <p className="text-sm text-amber-300">
                Le role comptable est en lecture seule: edition des factures desactivee.
              </p>
            )}
          </Card>

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="space-y-1">
              <p className="text-xs uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">
                Factures totales
              </p>
              <p className="text-3xl font-semibold">{stats.totalInvoices}</p>
            </Card>
            <Card className="space-y-1">
              <p className="text-xs uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">
                Factures payees
              </p>
              <p className="text-3xl font-semibold text-emerald-200">{stats.paidInvoices}</p>
              <p className="text-xs text-emerald-300">Montant: {money(stats.paidAmount)}</p>
            </Card>
            <Card className="space-y-1">
              <p className="text-xs uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">
                En attente
              </p>
              <p className="text-3xl font-semibold text-amber-200">{stats.pendingInvoices}</p>
              <p className="text-xs text-amber-300">Montant: {money(stats.pendingAmount)}</p>
            </Card>
            <Card className="space-y-1">
              <p className="text-xs uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">
                Volumes devises
              </p>
              <p className="text-sm text-[#f0d58c]">XAF: {money(stats.totalAmountXAF)}</p>
              <p className="text-sm text-[#f0d58c]">XOF: {money(stats.totalAmountXOF)}</p>
            </Card>
          </section>

          <Card className="space-y-5">
            <form className="grid gap-3 md:grid-cols-[1fr_180px_130px_auto]">
              <input
                name="search"
                placeholder="Rechercher reference, client, email"
                defaultValue={searchParams.search || ''}
                className="h-11 rounded-md border border-[hsl(var(--border))] bg-black/25 px-3 text-sm"
              />
              <select
                name="status"
                defaultValue={searchParams.status || ''}
                className="h-11 rounded-md border border-[hsl(var(--border))] bg-black/25 px-3 text-sm"
              >
                <option value="">Tous les statuts</option>
                <option value="PENDING">En attente</option>
                <option value="PAID">Payee</option>
                <option value="FAILED">Echec</option>
                <option value="REFUNDED">Remboursee</option>
              </select>
              <input
                name="country"
                placeholder="Pays (CM, CF, TD...)"
                defaultValue={searchParams.country || ''}
                className="h-11 rounded-md border border-[hsl(var(--border))] bg-black/25 px-3 text-sm uppercase"
              />
              <Button type="submit">Filtrer</Button>
            </form>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left text-[hsl(var(--muted-foreground))]">
                    <th className="py-3">Reference</th>
                    <th className="py-3">Client</th>
                    <th className="py-3">Pays</th>
                    <th className="py-3">Montant</th>
                    <th className="py-3">Statut</th>
                    <th className="py-3">Emission</th>
                    <th className="py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.items.length === 0 && (
                    <tr>
                      <td className="py-6 text-center text-[hsl(var(--muted-foreground))]" colSpan={7}>
                        Aucune facture trouvee.
                      </td>
                    </tr>
                  )}
                  {invoices.items.map((invoice) => (
                    <tr key={invoice.id} className="border-b border-white/5">
                      <td className="py-3 font-medium">{invoice.reference}</td>
                      <td className="py-3">
                        {invoice.customerName}
                        <p className="text-xs text-[hsl(var(--muted-foreground))]">{invoice.customerEmail}</p>
                      </td>
                      <td className="py-3">{invoice.country}</td>
                      <td className="py-3">
                        {money(invoice.amount)} {invoice.currency}
                      </td>
                      <td className="py-3">
                        <InvoiceStatusPill status={invoice.status} />
                      </td>
                      <td className="py-3">
                        {new Date(invoice.createdAt).toLocaleDateString('fr-FR', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                        })}
                      </td>
                      <td className="py-3">
                        <div className="flex flex-wrap gap-2">
                          <Link href={`/p/${encodeURIComponent(invoice.reference)}`}>
                            <Button variant="outline" className="h-9 px-3 text-xs">
                              Ouvrir paiement
                            </Button>
                          </Link>
                          <Link href={`/dashboard/transactions?invoiceId=${invoice.id}`}>
                            <Button variant="outline" className="h-9 px-3 text-xs">
                              Audit
                            </Button>
                          </Link>
                          {canEdit && (
                            <ManualStatusAction
                              invoiceId={invoice.id}
                              currentStatus={invoice.status}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                Page {invoices.page} / {invoices.totalPages} - {invoices.total} facture(s)
              </p>
              <div className="flex gap-2">
                <Link href={pageHref(searchParams, Math.max(1, currentPage - 1))}>
                  <Button variant="outline" disabled={currentPage <= 1}>
                    Precedent
                  </Button>
                </Link>
                <Link href={pageHref(searchParams, Math.min(invoices.totalPages, currentPage + 1))}>
                  <Button variant="outline" disabled={currentPage >= invoices.totalPages}>
                    Suivant
                  </Button>
                </Link>
              </div>
            </div>
          </Card>

          <Card className="space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="space-y-1">
                <h2 className="text-2xl font-semibold">Transactions recentes</h2>
                <p className="text-sm text-[hsl(var(--muted-foreground))]">
                  Donnees de tracabilite client pour audit et comptabilite.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <a href={accountingExportUrl} target="_blank" rel="noreferrer">
                  <Button variant="outline">Exporter CSV</Button>
                </a>
                <Link href={fullTraceabilityHref}>
                  <Button variant="outline">Voir tout</Button>
                </Link>
              </div>
            </div>

            {!transactions && (
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                Donnees transactions indisponibles temporairement.
              </p>
            )}

            {transactions && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-left text-[hsl(var(--muted-foreground))]">
                      <th className="py-3">Date</th>
                      <th className="py-3">Reference</th>
                      <th className="py-3">Payeur</th>
                      <th className="py-3">Provider</th>
                      <th className="py-3">Transaction ID</th>
                      <th className="py-3">Statut</th>
                      <th className="py-3">Montant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.items.length === 0 && (
                      <tr>
                        <td className="py-6 text-center text-[hsl(var(--muted-foreground))]" colSpan={7}>
                          Aucune transaction pour ce filtre.
                        </td>
                      </tr>
                    )}
                    {transactions.items.map((transaction) => (
                      <tr key={transaction.id} className="border-b border-white/5">
                        <td className="py-3">
                          {new Date(transaction.createdAt).toLocaleDateString('fr-FR', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                          })}
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
                        <td className="py-3">{transaction.provider}</td>
                        <td className="py-3">{transaction.providerTransactionId || '-'}</td>
                        <td className="py-3">
                          <InvoiceStatusPill status={transaction.status} />
                        </td>
                        <td className="py-3">
                          {money(transaction.amount)} {transaction.currency}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </main>
    );
  } catch {
    return (
      <main className="container py-10">
        <Card className="mx-auto max-w-2xl space-y-4">
          <CardTitle>Dashboard indisponible</CardTitle>
          <CardDescription>
            Le backend est inaccessible. Verifiez PostgreSQL, Redis et les variables d environnement.
          </CardDescription>
          {canEdit ? (
            <Link href="/invoices/new">
              <Button>Creer une facture en attendant</Button>
            </Link>
          ) : (
            <Link href="/dashboard/transactions">
              <Button variant="outline">Ouvrir les transactions</Button>
            </Link>
          )}
        </Card>
      </main>
    );
  }
}
