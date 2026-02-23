import Link from 'next/link';

import { Button } from '@/components/ui/button';

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
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
            <Link href="/invoices/new">
              <Button className="h-9 px-3 text-xs">Nouvelle facture</Button>
            </Link>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
