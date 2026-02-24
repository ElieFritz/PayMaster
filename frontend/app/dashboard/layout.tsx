import Link from 'next/link';
import { cookies } from 'next/headers';

import { Button } from '@/components/ui/button';
import { USER_ROLE_COOKIE } from '@/lib/auth';

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const role = cookies().get(USER_ROLE_COOKIE)?.value;
  const canEdit = role === 'ADMIN';

  return (
    <div className="pb-10">
      <header className="border-b border-[#8f753d]/30 bg-black/30 backdrop-blur">
        <div className="container flex flex-wrap items-center justify-between gap-3 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#d4b96f]">The Performers</p>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">Facturation & tracabilite</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard">
              <Button variant="outline" className="h-9 px-3 text-xs">
                Vue globale
              </Button>
            </Link>
            <Link href="/dashboard/transactions">
              <Button variant="outline" className="h-9 px-3 text-xs">
                Transactions
              </Button>
            </Link>
            {canEdit && (
              <Link href="/invoices/new">
                <Button className="h-9 px-3 text-xs">Nouvelle facture</Button>
              </Link>
            )}
            <a href="/api/auth/logout">
              <Button variant="ghost" className="h-9 px-3 text-xs">
                Deconnexion
              </Button>
            </a>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
