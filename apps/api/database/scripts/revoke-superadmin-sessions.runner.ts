/**
 * Revokes every open session for superadmin@cureka.com.
 * Does not change the password and does not touch any other admin.
 *
 * Usage (on the server whose DATABASE_URL is the live database):
 *   npm run admin:revoke-superadmin-sessions
 */
import 'reflect-metadata';
import { AppDataSource } from '../data-source';

const SUPERADMIN_EMAIL = 'superadmin@cureka.com';

async function run(): Promise<void> {
  await AppDataSource.initialize();
  try {
    const admins: Array<{ id: string }> = await AppDataSource.query(
      `SELECT id
       FROM admin_users
       WHERE LOWER(TRIM(email)) = $1`,
      [SUPERADMIN_EMAIL],
    );
    if (!admins.length) {
      throw new Error(`No admin user found for ${SUPERADMIN_EMAIL}`);
    }

    const revoked: Array<{ id: string }> = await AppDataSource.query(
      `UPDATE admin_sessions
       SET revoked_at = now()
       WHERE admin_user_id = ANY($1::uuid[])
         AND revoked_at IS NULL
       RETURNING id`,
      [admins.map((admin) => admin.id)],
    );

    console.log(`[admin] Revoked ${revoked.length} session(s) for ${SUPERADMIN_EMAIL}`);
  } finally {
    await AppDataSource.destroy();
  }
}

run().catch((err) => {
  console.error('[admin] Failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
