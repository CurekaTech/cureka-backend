/** Last four digits only. Never log or return the remainder. */
export function maskBankAccountNumber(accountNumber: string): string {
  const digits = accountNumber.replace(/\D/g, '');
  const last4 = digits.slice(-4);
  if (!last4) return 'XXXX';
  return `XXXXXX${last4}`;
}

export function last4BankAccountNumber(accountNumber: string): string {
  const digits = accountNumber.replace(/\D/g, '');
  return digits.slice(-4);
}
