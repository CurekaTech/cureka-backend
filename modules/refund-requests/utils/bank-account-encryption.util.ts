import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const PREFIX = 'v1';

export class BankAccountEncryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BankAccountEncryptionError';
  }
}

function resolveKey(raw?: string): Buffer {
  const value = (raw ?? process.env['BANK_ACCOUNT_ENCRYPTION_KEY'] ?? '').trim();
  if (!value) {
    throw new BankAccountEncryptionError('BANK_ACCOUNT_ENCRYPTION_KEY is not configured');
  }
  if (/^[0-9a-fA-F]{64}$/.test(value)) {
    return Buffer.from(value, 'hex');
  }
  const fromBase64 = Buffer.from(value, 'base64');
  if (fromBase64.length === 32) {
    return fromBase64;
  }
  throw new BankAccountEncryptionError(
    'BANK_ACCOUNT_ENCRYPTION_KEY must be 32 bytes as 64-char hex or base64',
  );
}

/**
 * AES-256-GCM. Stored as `v1:<iv>:<tag>:<ciphertext>` (base64url).
 * Never log `plain` or the returned ciphertext in application logs.
 */
export function encryptBankAccountNumber(plain: string, key = resolveKey()): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    PREFIX,
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join(':');
}

export function decryptBankAccountNumber(payload: string, key = resolveKey()): string {
  const parts = payload.split(':');
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    throw new BankAccountEncryptionError('Unrecognized bank-account ciphertext');
  }
  const iv = Buffer.from(parts[1], 'base64url');
  const tag = Buffer.from(parts[2], 'base64url');
  const encrypted = Buffer.from(parts[3], 'base64url');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
