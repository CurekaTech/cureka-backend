/**
 * Super-admin seed — run once to bootstrap the first SUPER_ADMIN account.
 * Usage: npm run seed:run
 */
import 'reflect-metadata';
import * as bcrypt from 'bcrypt';
import { AppDataSource } from '../data-source';
import { AdminUserEntity } from '../../../../modules/admin-users/entities/admin-user.entity';
import { AdminUserRole } from '../../../../modules/admin-users/enums/admin-user-role.enum';

const SEED_EMAIL = 'superadmin@cureka.com';
const SEED_PASSWORD = 'Admin@1234';
const BCRYPT_ROUNDS = 12;

async function run(): Promise<void> {
  await AppDataSource.initialize();

  try {
    const repo = AppDataSource.getRepository(AdminUserEntity);

    const existing = await repo.findOne({ where: { email: SEED_EMAIL } });
    if (existing) {
      console.log(`[seed] Super-admin already exists — ${SEED_EMAIL}. Skipping.`);
      return;
    }

    const hashed = await bcrypt.hash(SEED_PASSWORD, BCRYPT_ROUNDS);

    const admin = repo.create({
      fullName: 'Super Admin',
      email: SEED_EMAIL,
      password: hashed,
      role: AdminUserRole.SUPER_ADMIN,
      isActive: true,
      createdBy: 'system',
    });

    await repo.save(admin);

    console.log('[seed] Super-admin created successfully.');
    console.log(`  Email   : ${SEED_EMAIL}`);
    console.log(`  Password: ${SEED_PASSWORD}`);
    console.log('  Change this password immediately after first login.');
  } finally {
    await AppDataSource.destroy();
  }
}

run().catch((err) => {
  console.error('[seed] Failed:', err);
  process.exit(1);
});
