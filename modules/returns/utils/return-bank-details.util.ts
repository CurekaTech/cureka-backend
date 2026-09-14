import { CodRefundMethod } from '@modules/refund-requests/enums/cod-refund-method.enum';
import { BankAccountDetailsDto } from '@modules/refund-requests/dto/cod-refund-payout.dto';
import {
  BANK_ACCOUNT_MISMATCH,
  BANK_DETAILS_REQUIRED,
  INVALID_IFSC,
} from '@modules/refund-requests/constants/cod-payout.constants';
import {
  BankAccountEncryptionError,
  encryptBankAccountNumber,
} from '@modules/refund-requests/utils/bank-account-encryption.util';
import { bankNameFromIfsc, isValidIfsc, normalizeIfsc } from '@modules/refund-requests/utils/ifsc.util';
import { last4BankAccountNumber } from '@modules/refund-requests/utils/mask-bank-account.util';
import { BadRequestException } from '@nestjs/common';

export type NormalizedBankDetails = {
  bankAccountHolderName: string;
  bankAccountNumberEncrypted: string;
  bankAccountNumberLast4: string;
  bankIfsc: string;
  bankName: string | null;
  bankAccountType: string | null;
  bankDetailsSubmittedAt: Date;
};

export function assertMatchingAccountNumbers(dto: BankAccountDetailsDto): void {
  if (dto.accountNumber !== dto.confirmAccountNumber) {
    throw new BadRequestException({
      code: BANK_ACCOUNT_MISMATCH,
      message: 'Account number and confirmation do not match',
    });
  }
}

export function normalizeAndEncryptBankDetails(dto: BankAccountDetailsDto): NormalizedBankDetails {
  assertMatchingAccountNumbers(dto);
  const ifsc = normalizeIfsc(dto.ifsc);
  if (!isValidIfsc(ifsc)) {
    throw new BadRequestException({
      code: INVALID_IFSC,
      message: 'IFSC code is invalid',
    });
  }

  let encrypted: string;
  try {
    encrypted = encryptBankAccountNumber(dto.accountNumber);
  } catch (error) {
    if (error instanceof BankAccountEncryptionError) {
      throw new BadRequestException({
        code: 'BANK_ENCRYPTION_NOT_CONFIGURED',
        message: 'Bank-detail encryption is not configured on this environment',
      });
    }
    throw error;
  }

  return {
    bankAccountHolderName: dto.accountHolderName.trim(),
    bankAccountNumberEncrypted: encrypted,
    bankAccountNumberLast4: last4BankAccountNumber(dto.accountNumber),
    bankIfsc: ifsc,
    bankName: dto.bankName?.trim() || bankNameFromIfsc(ifsc),
    bankAccountType: dto.accountType?.trim() || null,
    bankDetailsSubmittedAt: new Date(),
  };
}

export function requireBankDetailsForMethod(
  method: CodRefundMethod,
  dto: BankAccountDetailsDto | undefined,
): NormalizedBankDetails | null {
  if (method === CodRefundMethod.WALLET) {
    return null;
  }
  if (!dto) {
    throw new BadRequestException({
      code: BANK_DETAILS_REQUIRED,
      message: 'Bank account details are required for a COD bank refund',
    });
  }
  return normalizeAndEncryptBankDetails(dto);
}
