'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { InvoiceStatus } from '@/lib/schemas';

type ManualStatusActionProps = {
  invoiceId: string;
  currentStatus: InvoiceStatus;
};

const STATUS_OPTIONS: Array<{ value: InvoiceStatus; label: string }> = [
  { value: 'PENDING', label: 'En attente' },
  { value: 'PAID', label: 'Payee' },
  { value: 'FAILED', label: 'Echec' },
  { value: 'REFUNDED', label: 'Remboursee' },
];

const PAYMENT_METHOD_OPTIONS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'BANK_TRANSFER', label: 'Virement' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'OTHER', label: 'Autre' },
] as const;

type ManualPaymentMethod = (typeof PAYMENT_METHOD_OPTIONS)[number]['value'];

export function ManualStatusAction({ invoiceId, currentStatus }: ManualStatusActionProps) {
  const router = useRouter();
  const [status, setStatus] = useState<InvoiceStatus>(currentStatus);
  const [paymentMethod, setPaymentMethod] = useState<ManualPaymentMethod>('CASH');
  const [note, setNote] = useState('');
  const [sendReceipt, setSendReceipt] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasChanges =
    status !== currentStatus || note.trim().length > 0 || (status === 'PAID' && paymentMethod !== 'CASH');

  async function applyManualStatusUpdate() {
    if (!hasChanges) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/payments/manual-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId,
          status,
          paymentMethod: status === 'PAID' ? paymentMethod : undefined,
          note: note.trim() || undefined,
          sendReceipt: status === 'PAID' ? sendReceipt : undefined,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(extractErrorMessage(payload));
      }

      router.refresh();
      setLoading(false);
      setNote('');
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : 'Impossible de modifier le statut.';
      setError(message);
      setLoading(false);
    }
  }

  return (
    <div className="min-w-[230px] space-y-2 rounded-md border border-white/10 bg-black/20 p-2">
      <select
        className="h-9 w-full rounded-md border border-[hsl(var(--border))] bg-black/25 px-2 text-xs"
        value={status}
        onChange={(event) => setStatus(event.target.value as InvoiceStatus)}
        disabled={loading}
      >
        {STATUS_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <input
        className="h-9 w-full rounded-md border border-[hsl(var(--border))] bg-black/25 px-2 text-xs"
        placeholder={status === 'PAID' ? 'Note (cash, reference, etc.)' : 'Note (optionnelle)'}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        maxLength={280}
        disabled={loading}
      />

      {status === 'PAID' && (
        <select
          className="h-9 w-full rounded-md border border-[hsl(var(--border))] bg-black/25 px-2 text-xs"
          value={paymentMethod}
          onChange={(event) => setPaymentMethod(event.target.value as ManualPaymentMethod)}
          disabled={loading}
        >
          {PAYMENT_METHOD_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}

      <label className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
        <input
          type="checkbox"
          className="h-3.5 w-3.5"
          checked={sendReceipt}
          onChange={(event) => setSendReceipt(event.target.checked)}
          disabled={loading || status !== 'PAID'}
        />
        Envoyer recu si statut paye
      </label>

      <Button
        variant="outline"
        className="h-8 w-full px-3 text-xs"
        disabled={loading || !hasChanges}
        onClick={applyManualStatusUpdate}
      >
        {loading ? 'Mise a jour...' : 'Statut manuel'}
      </Button>

      {error && <p className="text-xs text-rose-300">{error}</p>}
    </div>
  );
}

function extractErrorMessage(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return 'Mise a jour du statut impossible.';
  }

  const source = payload as Record<string, unknown>;
  if (typeof source.message === 'string' && source.message.trim().length > 0) {
    return source.message.trim();
  }

  if (Array.isArray(source.message)) {
    return source.message.map((entry) => String(entry)).join(', ');
  }

  return 'Mise a jour du statut impossible.';
}
