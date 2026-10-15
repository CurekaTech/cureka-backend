/**
 * Updates the password for the existing superadmin@cureka.com account.
 * Does not create an account and does not change any other user.
 *
 * Usage:
 *   npm run admin:reset-superadmin-password -- --password=YourNewPassword
 */
import 'reflect-metadata';
import * as bcrypt from 'bcrypt';
import { AppDataSource } from '../data-source';
import { AdminUserEntity } from '../../../../modules/admin-users/entities/admin-user.entity';

const SUPERADMIN_EMAIL = 'superadmin@cureka.com';
const BCRYPT_ROUNDS = 12;

const readPassword = (argv: string[]): string => {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? '';
    if (arg === '--password') return (argv[index + 1] ?? '').trim();
    if (arg.startsWith('--password=')) return arg.slice('--password='.length).trim();
  }
  return (process.env['SUPERADMIN_PASSWORD'] ?? '').trim();
};

async function run(): Promise<void> {
  const password = readPassword(process.argv.slice(2));
  if (!password) {
    throw new Error('Pass --password=... or set SUPERADMIN_PASSWORD');
  }

  await AppDataSource.initialize();
  try {
    const repo = AppDataSource.getRepository(AdminUserEntity);
    const existing = await repo.findOne({ where: { email: SUPERADMIN_EMAIL } });
    if (!existing) {
      throw new Error(`No admin user found for ${SUPERADMIN_EMAIL}`);
    }

    await repo.update({ id: existing.id }, { password: await bcrypt.hash(password, BCRYPT_ROUNDS) });
    console.log(`[admin] Password updated for ${SUPERADMIN_EMAIL}`);
  } finally {
    await AppDataSource.destroy();
  }
}

run().catch((err) => {
  console.error('[admin] Failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
