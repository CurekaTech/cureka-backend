import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

/**
 * AES-256-GCM for doctor bank account numbers at rest.
 * Key material: `DOCTOR_BANK_ENCRYPTION_KEY` env (any string, hashed to 32 bytes),
 * or `JWT_SECRET` as fallback when the dedicated key is unset.
 */
const resolveKey = (): Buffer => {
  const raw =
    process.env['DOCTOR_BANK_ENCRYPTION_KEY']?.trim() ||
    process.env['JWT_SECRET']?.trim() ||
    '';
  if (!raw) {
    throw new Error('DOCTOR_BANK_ENCRYPTION_KEY or JWT_SECRET must be set for bank encryption');
  }
  return createHash('sha256').update(raw).digest();
};

export const encryptBankAccountNumber = (plain: string): string => {
  const key = resolveKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
};

export const decryptBankAccountNumber = (payload: string): string => {
  const key = resolveKey();
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
};

export const maskAccountLast4 = (accountNumber: string): string =>
  accountNumber.slice(-4).padStart(4, '0');
