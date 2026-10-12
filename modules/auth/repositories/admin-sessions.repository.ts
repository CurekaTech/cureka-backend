import { Injectable, UnauthorizedException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  ACTIVE_ADMIN_SESSION_PREDICATE,
  allocateSuperAdminSessionSlot,
} from '../utils/super-admin-session.util';

@Injectable()
export class AdminSessionsRepository {
  constructor(private readonly dataSource: DataSource) {}

  async allocate(adminUserId: string, expiresAt: Date): Promise<string> {
    return this.dataSource.transaction((manager) =>
      allocateSuperAdminSessionSlot(
        {
          lockAdminUser: async (id) => {
            const locked: Array<{ id: string }> = await manager.query(
              `SELECT id FROM admin_users WHERE id = $1 FOR UPDATE`,
              [id],
            );
            if (!locked.length) {
              throw new UnauthorizedException('Account is inactive or not found');
            }
          },
          countActive: (id) => this.countActive(manager, id),
          insertActive: (id, expiry) => this.insert(manager, id, expiry),
        },
        adminUserId,
        expiresAt,
      ),
    );
  }

  async revoke(sessionId: string, adminUserId: string): Promise<boolean> {
    const rows: Array<{ id: string }> = await this.dataSource.query(
      `UPDATE admin_sessions
       SET revoked_at = now()
       WHERE id = $1 AND admin_user_id = $2 AND revoked_at IS NULL
       RETURNING id`,
      [sessionId, adminUserId],
    );
    return rows.length > 0;
  }

  /** True only when the session belongs to this admin and is still active. */
  async isActiveForAdmin(sessionId: string, adminUserId: string): Promise<boolean> {
    const rows: Array<{ id: string }> = await this.dataSource.query(
      `SELECT id
       FROM admin_sessions
       WHERE id = $1 AND admin_user_id = $2 AND ${ACTIVE_ADMIN_SESSION_PREDICATE}
       LIMIT 1`,
      [sessionId, adminUserId],
    );
    return rows.length > 0;
  }

  private async countActive(manager: EntityManager, adminUserId: string): Promise<number> {
    const rows: Array<{ count: number | string }> = await manager.query(
      `SELECT COUNT(*)::int AS count
       FROM admin_sessions
       WHERE admin_user_id = $1 AND ${ACTIVE_ADMIN_SESSION_PREDICATE}`,
      [adminUserId],
    );
    return Number(rows[0]?.count ?? 0);
  }

  private async insert(manager: EntityManager, adminUserId: string, expiresAt: Date): Promise<string> {
    const rows: Array<{ id: string }> = await manager.query(
      `INSERT INTO admin_sessions (admin_user_id, expires_at)
       VALUES ($1, $2)
       RETURNING id`,
      [adminUserId, expiresAt],
    );
    return rows[0].id;
  }
}
