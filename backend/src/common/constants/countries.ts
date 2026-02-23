import { Currency } from '../enums/currency.enum';
import { PaymentProvider } from '../enums/payment-provider.enum';

export const CEMAC_COUNTRY_CODES = ['CM', 'CF', 'TD', 'CG', 'GQ', 'GA'] as const;

export type CemacCountryCode = (typeof CEMAC_COUNTRY_CODES)[number];

type CountryConfig = {
  currency: Currency;
  provider: PaymentProvider;
};

const CEMAC_COUNTRY_CONFIG: Record<CemacCountryCode, CountryConfig> = {
  CM: { currency: Currency.XAF, provider: PaymentProvider.NOTCHPAY },
  CF: { currency: Currency.XAF, provider: PaymentProvider.ZIKOPAY },
  TD: { currency: Currency.XAF, provider: PaymentProvider.ZIKOPAY },
  CG: { currency: Currency.XAF, provider: PaymentProvider.ZIKOPAY },
  GQ: { currency: Currency.XAF, provider: PaymentProvider.ZIKOPAY },
  GA: { currency: Currency.XAF, provider: PaymentProvider.ZIKOPAY },
};

export const SUPPORTED_CEMAC_COUNTRIES_LABEL = CEMAC_COUNTRY_CODES.join(', ');

export function normalizeCountryCode(country: string): string {
  return country.trim().toUpperCase();
}

export function isSupportedCemacCountry(country: string): country is CemacCountryCode {
  const normalized = normalizeCountryCode(country);
  return (CEMAC_COUNTRY_CODES as readonly string[]).includes(normalized);
}

export function getCemacCountryConfig(country: string): CountryConfig | null {
  const normalized = normalizeCountryCode(country);

  if (!isSupportedCemacCountry(normalized)) {
    return null;
  }

  return CEMAC_COUNTRY_CONFIG[normalized];
}
