export const COUNTRIES = [
  { code: 'CM', label: 'Cameroun', currency: 'XAF', provider: 'NOTCHPAY' },
  { code: 'SN', label: 'Senegal', currency: 'XOF', provider: 'ZIKOPAY' },
  { code: 'CI', label: "Cote d'Ivoire", currency: 'XOF', provider: 'ZIKOPAY' },
  { code: 'BJ', label: 'Benin', currency: 'XOF', provider: 'ZIKOPAY' },
  { code: 'TG', label: 'Togo', currency: 'XOF', provider: 'ZIKOPAY' },
];

export const CURRENCY_BY_COUNTRY: Record<string, 'XAF' | 'XOF'> = {
  CM: 'XAF',
};

const FORCED_ZIKOPAY_CURRENCY = resolveForcedZikoCurrency();

export function resolveCurrency(countryCode: string): 'XAF' | 'XOF' {
  const normalizedCountry = countryCode.toUpperCase();

  if (normalizedCountry !== 'CM' && FORCED_ZIKOPAY_CURRENCY) {
    return FORCED_ZIKOPAY_CURRENCY;
  }

  return CURRENCY_BY_COUNTRY[normalizedCountry] || 'XOF';
}

export function resolveProvider(countryCode: string): 'NOTCHPAY' | 'ZIKOPAY' {
  return countryCode.toUpperCase() === 'CM' ? 'NOTCHPAY' : 'ZIKOPAY';
}

function resolveForcedZikoCurrency(): 'XAF' | 'XOF' | null {
  const value = (process.env.NEXT_PUBLIC_ZIKOPAY_FORCE_CURRENCY || '').trim().toUpperCase();

  if (value === 'XAF' || value === 'XOF') {
    return value;
  }

  return null;
}
