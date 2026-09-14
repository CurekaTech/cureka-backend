import { BadRequestException } from '@nestjs/common';
import { CodRefundMethod } from '@modules/refund-requests/enums/cod-refund-method.enum';
import { encryptBankAccountNumber, decryptBankAccountNumber } from '@modules/refund-requests/utils/bank-account-encryption.util';
import { isValidIfsc, normalizeIfsc, bankNameFromIfsc } from '@modules/refund-requests/utils/ifsc.util';
import { maskBankAccountNumber } from '@modules/refund-requests/utils/mask-bank-account.util';
import { requireBankDetailsForMethod } from './return-bank-details.util';

describe('bank detail helpers', () => {
  const previousKey = process.env['BANK_ACCOUNT_ENCRYPTION_KEY'];

  beforeAll(() => {
    process.env['BANK_ACCOUNT_ENCRYPTION_KEY'] = 'a'.repeat(64);
  });

  afterAll(() => {
    process.env['BANK_ACCOUNT_ENCRYPTION_KEY'] = previousKey;
  });

  it('masks the account number', () => {
    expect(maskBankAccountNumber('12345678904321')).toBe('XXXXXX4321');
  });

  it('validates IFSC and resolves a common bank name', () => {
    expect(isValidIfsc('hdfc0001234')).toBe(true);
    expect(normalizeIfsc('hdfc0001234')).toBe('HDFC0001234');
    expect(bankNameFromIfsc('HDFC0001234')).toBe('HDFC Bank');
    expect(isValidIfsc('BAD')).toBe(false);
  });

  it('encrypts the account number and never keeps the confirmation field', () => {
    const stored = requireBankDetailsForMethod(CodRefundMethod.BANK_ACCOUNT, {
      accountHolderName: 'Test User',
      accountNumber: '123456789012',
      confirmAccountNumber: '123456789012',
      ifsc: 'HDFC0001234',
    });
    expect(stored?.bankAccountNumberEncrypted).not.toContain('123456789012');
    expect(stored?.bankAccountNumberLast4).toBe('9012');
    expect(decryptBankAccountNumber(stored!.bankAccountNumberEncrypted)).toBe('123456789012');
    expect(encryptBankAccountNumber('123456789012')).not.toEqual(stored?.bankAccountNumberEncrypted);
  });

  it('rejects mismatched account numbers', () => {
    expect(() =>
      requireBankDetailsForMethod(CodRefundMethod.BANK_ACCOUNT, {
        accountHolderName: 'Test User',
        accountNumber: '123456789012',
        confirmAccountNumber: '123456789099',
        ifsc: 'HDFC0001234',
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects an invalid IFSC', () => {
    expect(() =>
      requireBankDetailsForMethod(CodRefundMethod.BANK_ACCOUNT, {
        accountHolderName: 'Test User',
        accountNumber: '123456789012',
        confirmAccountNumber: '123456789012',
        ifsc: 'NOPE',
      }),
    ).toThrow(BadRequestException);
  });

  it('does not store bank details when the customer chooses wallet', () => {
    expect(requireBankDetailsForMethod(CodRefundMethod.WALLET, undefined)).toBeNull();
  });
});
