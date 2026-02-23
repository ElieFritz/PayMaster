import { InvoiceStatus } from '@/lib/schemas';
import { cn } from '@/lib/utils';

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  PENDING: 'En attente',
  PAID: 'Payee',
  FAILED: 'Echec',
  REFUNDED: 'Remboursee',
};

const STATUS_STYLES: Record<InvoiceStatus, string> = {
  PENDING: 'border-amber-400/40 bg-amber-400/10 text-amber-200',
  PAID: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200',
  FAILED: 'border-rose-400/40 bg-rose-400/10 text-rose-200',
  REFUNDED: 'border-slate-400/40 bg-slate-400/10 text-slate-200',
};

export function InvoiceStatusPill({ status }: { status: InvoiceStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.08em]',
        STATUS_STYLES[status],
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

