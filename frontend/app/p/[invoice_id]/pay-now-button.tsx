'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';

type PayNowButtonProps = {
  invoiceId: string;
  country: string;
  status: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
  providerReference?: string | null;
};

export function PayNowButton({ invoiceId, country, status, providerReference }: PayNowButtonProps) {
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const disabled = status === 'PAID' || loading;

  async function handlePayNow() {
    setError(null);
    setInfo(null);
    setLoading(true);

    try {
      const response = await fetch('/api/payments/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId, country }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(extractPaymentError(payload));
      }

      if (payload.checkoutUrl) {
        window.location.href = payload.checkoutUrl;
        return;
      }

      const message = extractPaymentInfo(payload);
      setInfo(message || 'Demande envoyee. Confirmez le paiement sur le telephone du client.');
      setLoading(false);

      if (country.toUpperCase() !== 'CM') {
        await syncRealStatus({
          provider: extractString(payload.provider) || 'ZIKOPAY',
          providerReference: extractString(payload.providerReference),
          silent: true,
        });
      }
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : 'Erreur lors de la redirection paiement.';
      setError(message);
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <Button
          onClick={handlePayNow}
          disabled={disabled}
          className="min-w-[180px] bg-[#1457d5] text-white hover:bg-[#0f49bd]"
        >
          {status === 'PAID' ? 'Facture deja reglee' : loading ? 'Redirection...' : 'Payer maintenant'}
        </Button>
        {country.toUpperCase() !== 'CM' && status !== 'PAID' && (
          <Button
            variant="outline"
            onClick={() =>
              syncRealStatus({
                provider: 'ZIKOPAY',
                providerReference: providerReference || undefined,
              })
            }
            disabled={syncing || loading}
            className="min-w-[180px] border-[#b9d3ff] text-[#124196] hover:bg-[#edf4ff]"
          >
            {syncing ? 'Verification...' : 'Verifier le statut'}
          </Button>
        )}
      </div>
      {error && <p className="text-sm font-medium text-[#b72c3b]">{error}</p>}
      {info && <p className="text-sm font-medium text-[#134094]">{info}</p>}
    </div>
  );

  async function syncRealStatus({
    provider,
    providerReference,
    silent = false,
  }: {
    provider: string;
    providerReference?: string | null;
    silent?: boolean;
  }) {
    setError(null);
    setSyncing(true);

    try {
      const response = await fetch('/api/payments/sync-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId,
          provider,
          providerReference: providerReference || undefined,
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(extractPaymentError(payload));
      }

      const currentStatus = extractString(payload.currentStatus) || 'PENDING';

      if (!silent) {
        setInfo(`Statut synchronise: ${toStatusLabel(currentStatus)}.`);
      } else if (currentStatus !== 'PAID') {
        setInfo('Demande envoyee. Statut actuel: en attente de confirmation client.');
      }

      if (currentStatus === 'PAID' || currentStatus === 'FAILED' || currentStatus === 'REFUNDED') {
        window.location.reload();
      }
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : 'Impossible de synchroniser le statut.';
      setError(message);
    } finally {
      setSyncing(false);
    }
  }
}

function extractPaymentError(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return 'Initialisation du paiement echouee.';
  }

  const data = payload as Record<string, unknown>;
  const message = data.message;
  const cause = data.cause;
  const provider = typeof data.provider === 'string' ? data.provider : '';

  const causeMessage = extractCauseMessage(cause);

  if (typeof message === 'string') {
    if (causeMessage) {
      return `${message} (${causeMessage})`;
    }
    return message;
  }

  if (Array.isArray(message)) {
    return message.map((entry) => String(entry)).join(', ');
  }

  if (message && typeof message === 'object') {
    const nested = message as Record<string, unknown>;
    if (typeof nested.message === 'string') {
      return nested.message;
    }
    if (typeof nested.cause === 'string') {
      return nested.cause;
    }
  }

  if (typeof data.error === 'string') {
    return data.error;
  }

  if (causeMessage) {
    if (provider) {
      return `${provider}: ${causeMessage}`;
    }
    return causeMessage;
  }

  return 'Initialisation du paiement echouee.';
}

function extractPaymentInfo(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const data = payload as Record<string, unknown>;
  if (typeof data.message === 'string' && data.message.trim().length > 0) {
    return data.message.trim();
  }

  return null;
}

function extractCauseMessage(cause: unknown): string | null {
  if (!cause || typeof cause !== 'object') {
    return null;
  }

  const value = cause as Record<string, unknown>;

  if (typeof value.message === 'string' && value.message.trim().length > 0) {
    return value.message.trim();
  }

  if (value.data && typeof value.data === 'object') {
    const nestedData = value.data as Record<string, unknown>;
    if (typeof nestedData.message === 'string' && nestedData.message.trim().length > 0) {
      return nestedData.message.trim();
    }
  }

  if (typeof value.cause === 'string' && value.cause.trim().length > 0) {
    return value.cause.trim();
  }

  return null;
}

function extractString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function toStatusLabel(status: string): string {
  const normalized = status.toUpperCase();

  if (normalized === 'PAID') {
    return 'paye';
  }

  if (normalized === 'FAILED') {
    return 'echoue';
  }

  if (normalized === 'REFUNDED') {
    return 'rembourse';
  }

  return 'en attente';
}
