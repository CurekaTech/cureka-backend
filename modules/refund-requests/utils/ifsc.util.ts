/** RBI IFSC: four letters, a zero, then six alphanumeric characters. */
export const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;

const BANK_NAME_BY_CODE: Record<string, string> = {
  HDFC: 'HDFC Bank',
  ICIC: 'ICICI Bank',
  SBIN: 'State Bank of India',
  UTIB: 'Axis Bank',
  PUNB: 'Punjab National Bank',
  CNRB: 'Canara Bank',
  BARB: 'Bank of Baroda',
  UBIN: 'Union Bank of India',
  IDIB: 'Indian Bank',
  IOBA: 'Indian Overseas Bank',
  KKBK: 'Kotak Mahindra Bank',
  YESB: 'Yes Bank',
  INDB: 'IndusInd Bank',
  FDRL: 'Federal Bank',
  IDFB: 'IDFC FIRST Bank',
  BKID: 'Bank of India',
  CBIN: 'Central Bank of India',
  MAHB: 'Bank of Maharashtra',
  UCBA: 'UCO Bank',
  PSIB: 'Punjab & Sind Bank',
};

export function normalizeIfsc(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, '');
}

export function isValidIfsc(value: string): boolean {
  return IFSC_PATTERN.test(normalizeIfsc(value));
}

/** Best-effort name from the first four letters. Unknown codes return null. */
export function bankNameFromIfsc(ifsc: string): string | null {
  const code = normalizeIfsc(ifsc).slice(0, 4);
  return BANK_NAME_BY_CODE[code] ?? null;
}
