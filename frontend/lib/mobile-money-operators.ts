type OperatorOption = {
  value: string;
  label: string;
};

const OPERATORS_BY_COUNTRY: Record<string, OperatorOption[]> = {
  CI: [
    { value: 'orange_ci', label: "Orange Money CI" },
    { value: 'mtn_ci', label: 'MTN Money CI' },
    { value: 'moov_ci', label: 'Moov Money CI' },
    { value: 'wave_ci', label: 'Wave CI' },
  ],
  SN: [
    { value: 'orange_sn', label: 'Orange Money SN' },
    { value: 'free_money_sn', label: 'Free Money SN' },
    { value: 'expresso_sn', label: 'Expresso SN' },
  ],
  BJ: [
    { value: 'mtn_bj', label: 'MTN Money BJ' },
    { value: 'moov_bj', label: 'Moov Money BJ' },
  ],
  TG: [{ value: 't_money_tg', label: 'T-Money TG' }],
  CM: [
    { value: 'orange_cm', label: 'Orange Money CM' },
    { value: 'mtn_cm', label: 'MTN MoMo CM' },
  ],
};

export function getOperatorsByCountry(countryCode: string): OperatorOption[] {
  return OPERATORS_BY_COUNTRY[countryCode.toUpperCase()] || [];
}

export function getDefaultOperator(countryCode: string): string {
  const options = getOperatorsByCountry(countryCode);
  return options[0]?.value || '';
}
