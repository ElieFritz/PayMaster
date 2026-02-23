export const SUPPORTED_COUNTRY_CODES = ['CM', 'CF', 'TD', 'CG', 'GQ', 'GA'] as const;

export type SupportedCountryCode = (typeof SUPPORTED_COUNTRY_CODES)[number];

type SupportedCurrency = 'XAF' | 'XOF';
type SupportedProvider = 'NOTCHPAY' | 'ZIKOPAY';

type CountryConfig = {
  code: SupportedCountryCode;
  label: string;
  currency: SupportedCurrency;
  provider: SupportedProvider;
};

const COUNTRY_CONFIG: Record<SupportedCountryCode, CountryConfig> = {
  CM: { code: 'CM', label: 'Cameroun', currency: 'XAF', provider: 'NOTCHPAY' },
  CF: {
    code: 'CF',
    label: 'Republique centrafricaine',
    currency: 'XAF',
    provider: 'ZIKOPAY',
  },
  TD: { code: 'TD', label: 'Tchad', currency: 'XAF', provider: 'ZIKOPAY' },
  CG: { code: 'CG', label: 'Congo', currency: 'XAF', provider: 'ZIKOPAY' },
  GQ: { code: 'GQ', label: 'Guinee equatoriale', currency: 'XAF', provider: 'ZIKOPAY' },
  GA: { code: 'GA', label: 'Gabon', currency: 'XAF', provider: 'ZIKOPAY' },
};

export const COUNTRIES: CountryConfig[] = SUPPORTED_COUNTRY_CODES.map(
  (countryCode) => COUNTRY_CONFIG[countryCode],
);

export function resolveCurrency(countryCode: string): SupportedCurrency {
  const config = COUNTRY_CONFIG[normalizeCountryCode(countryCode) as SupportedCountryCode];
  return config?.currency || 'XAF';
}

export function resolveProvider(countryCode: string): SupportedProvider {
  const config = COUNTRY_CONFIG[normalizeCountryCode(countryCode) as SupportedCountryCode];
  return config?.provider || 'ZIKOPAY';
}

export function isSupportedCountry(countryCode: string): boolean {
  const normalized = normalizeCountryCode(countryCode);
  return (SUPPORTED_COUNTRY_CODES as readonly string[]).includes(normalized);
}

function normalizeCountryCode(countryCode: string): string {
  return countryCode.trim().toUpperCase();
}
