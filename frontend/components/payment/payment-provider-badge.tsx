import Image from 'next/image';

import { Badge } from '@/components/ui/badge';
import { resolveCurrency, resolveProvider } from '@/lib/countries';

export function PaymentProviderBadge({ country }: { country: string }) {
  const provider = resolveProvider(country);
  const currency = resolveCurrency(country);

  const providerLabel = provider === 'NOTCHPAY' ? 'NotchPay' : 'ZikoPay';
  const logoPath = provider === 'NOTCHPAY' ? '/notchpay.svg' : '/zikopay.svg';

  return (
    <div className="rounded-lg border border-[#8e7640]/35 bg-black/25 p-4">
      <div className="mb-2 flex items-center justify-between">
        <Badge>{providerLabel}</Badge>
        <p className="text-xs uppercase tracking-[0.2em] text-[#bca66e]">Devise: {currency}</p>
      </div>
      <div className="flex items-center gap-3">
        <Image src={logoPath} alt={`${providerLabel} logo`} width={126} height={32} />
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          {provider === 'NOTCHPAY'
            ? 'Cameroun detecte: NotchPay actif et XAF force.'
            : 'Pays d Afrique centrale (hors Cameroun): ZikoPay actif en XAF.'}
        </p>
      </div>
    </div>
  );
}
