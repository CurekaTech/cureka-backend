import * as bcrypt from 'bcrypt';

const SALT_ROUNDS = 12;

export const hashPassword = async (plain: string): Promise<string> =>
  bcrypt.hash(plain, SALT_ROUNDS);

export const comparePasswords = async (plain: string, hashed: string): Promise<boolean> =>
  bcrypt.compare(plain, hashed);
