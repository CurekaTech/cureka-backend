/**
 * Creates or updates two SUPER_ADMIN users with every permission attached.
 *
 * Usage (uses DATABASE_URL from .env):
 *   npm run admin:ensure-full-access
 */
import 'reflect-metadata';
import * as bcrypt from 'bcrypt';
import { generateUniqueRefId } from '@packages/common';
import { AdminUserEntity } from '../../../../modules/admin-users/entities/admin-user.entity';
import { AdminUserRole } from '../../../../modules/admin-users/enums/admin-user-role.enum';
import { MasterStatus } from '../../../../modules/master/enums/master-status.enum';
import { PermissionEntity } from '../../../../modules/roles/entities/permission.entity';
import { RoleEntity } from '../../../../modules/roles/entities/role.entity';
import { AppDataSource } from '../data-source';

const BCRYPT_ROUNDS = 12;
const ACTOR = 'ensure-full-access-admins.runner';
const ROLE_SLUG = 'full-access';

const ADMINS = [
  { email: 'dev-admin@gmail.com', password: 'Dev@123', fullName: 'Dev Admin' },
  { email: 'imran-admin@gmail.com', password: 'Imran@123', fullName: 'Imran Admin' },
] as const;

async function ensureFullAccessRole(): Promise<RoleEntity> {
  const roleRepo = AppDataSource.getRepository(RoleEntity);
  const permissionRepo = AppDataSource.getRepository(PermissionEntity);
  const permissions = await permissionRepo.find({
    where: { status: MasterStatus.ACTIVE },
  });
  if (permissions.length === 0) {
    throw new Error('No active permissions found. Seed permissions before creating admins.');
  }

  let role = await roleRepo.findOne({
    where: { slug: ROLE_SLUG },
    relations: { permissions: true },
  });
  if (!role) {
    role = roleRepo.create({
      refId: await generateUniqueRefId('Full Access', (candidate) =>
        roleRepo.exists({ where: { refId: candidate } }),
      ),
      name: 'Full Access',
      slug: ROLE_SLUG,
      description: 'All active permissions. Created by admin:ensure-full-access.',
      status: MasterStatus.ACTIVE,
      isSystem: true,
      createdBy: ACTOR,
      updatedBy: ACTOR,
    });
  }

  role.permissions = permissions;
  role.status = MasterStatus.ACTIVE;
  role.updatedBy = ACTOR;
  const saved = await roleRepo.save(role);
  console.log(`[admin] Role ${ROLE_SLUG} has ${permissions.length} permissions`);
  return saved;
}

async function upsertAdmin(
  input: (typeof ADMINS)[number],
  role: RoleEntity,
): Promise<void> {
  const repo = AppDataSource.getRepository(AdminUserEntity);
  const email = input.email.trim().toLowerCase();
  const password = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const existing = await repo
    .createQueryBuilder('admin_user')
    .where('LOWER(TRIM(admin_user.email)) = :email', { email })
    .getOne();

  if (existing) {
    await repo.update(
      { id: existing.id },
      {
        fullName: input.fullName,
        password,
        role: AdminUserRole.SUPER_ADMIN,
        roleId: role.id,
        isActive: true,
        updatedBy: ACTOR,
      },
    );
    console.log(`[admin] Updated ${email} (super_admin, full access)`);
    return;
  }

  await repo.save(
    repo.create({
      refId: await generateUniqueRefId(input.fullName, (candidate) =>
        repo.exists({ where: { refId: candidate } }),
      ),
      fullName: input.fullName,
      email,
      password,
      role: AdminUserRole.SUPER_ADMIN,
      roleId: role.id,
      isActive: true,
      createdBy: ACTOR,
      updatedBy: ACTOR,
    }),
  );
  console.log(`[admin] Created ${email} (super_admin, full access)`);
}

async function run(): Promise<void> {
  await AppDataSource.initialize();
  try {
    const role = await ensureFullAccessRole();
    for (const admin of ADMINS) {
      await upsertAdmin(admin, role);
    }
    console.log('[admin] Done. Log in with:');
    for (const admin of ADMINS) {
      console.log(`  ${admin.email} / ${admin.password}`);
    }
  } finally {
    await AppDataSource.destroy();
  }
}

run().catch((err) => {
  console.error('[admin] Failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
