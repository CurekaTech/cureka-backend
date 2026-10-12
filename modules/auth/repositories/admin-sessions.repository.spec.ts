import { ACTIVE_ADMIN_SESSION_PREDICATE } from '../utils/super-admin-session.util';
import { AdminSessionsRepository } from './admin-sessions.repository';

describe('AdminSessionsRepository ownership', () => {
  it('checks session id, admin user id, and the active predicate together', async () => {
    const query = jest.fn().mockResolvedValue([{ id: 'session-1' }]);
    const repository = new AdminSessionsRepository({ query } as never);
    await expect(repository.isActiveForAdmin('session-1', 'admin-1')).resolves.toBe(true);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('id = $1 AND admin_user_id = $2'), [
      'session-1',
      'admin-1',
    ]);
    expect(query.mock.calls[0][0]).toContain(ACTIVE_ADMIN_SESSION_PREDICATE);
  });

  it('revokes only an open session owned by that admin', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const repository = new AdminSessionsRepository({ query } as never);
    await expect(repository.revoke('session-1', 'admin-1')).resolves.toBe(false);
    expect(query.mock.calls[0][0]).toContain('admin_user_id = $2');
    expect(query.mock.calls[0][0]).toContain('revoked_at IS NULL');
    expect(query.mock.calls[0][1]).toEqual(['session-1', 'admin-1']);
  });
});
