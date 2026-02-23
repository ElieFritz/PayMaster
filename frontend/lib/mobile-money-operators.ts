type OperatorOption = {
  value: string;
  label: string;
};

const OPERATORS_BY_COUNTRY: Record<string, OperatorOption[]> = {
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
