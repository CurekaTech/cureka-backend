import { AdminNotificationEmailType } from '../enums/admin-notification-email-type.enum';
import { AdminNotificationEmailsRepository } from './admin-notification-emails.repository';

describe('AdminNotificationEmailsRepository active recipient filtering', () => {
  const find = jest.fn();
  const count = jest.fn();
  const repo = {
    find,
    count,
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    exists: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const repository = new AdminNotificationEmailsRepository(repo as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('findActiveEmailsByType queries only isActive=true (soft-deleted excluded by TypeORM)', async () => {
    find.mockResolvedValue([{ email: 'ops@cureka.com' }]);
    const emails = await repository.findActiveEmailsByType(AdminNotificationEmailType.PRODUCT_OOS);
    expect(find).toHaveBeenCalledWith({
      where: { type: AdminNotificationEmailType.PRODUCT_OOS, isActive: true },
      select: ['email'],
      order: { email: 'ASC' },
    });
    expect(emails).toEqual(['ops@cureka.com']);
  });

  it('countActiveByType counts only isActive=true', async () => {
    count.mockResolvedValue(2);
    await expect(
      repository.countActiveByType(AdminNotificationEmailType.PRODUCT_OOS),
    ).resolves.toBe(2);
    expect(count).toHaveBeenCalledWith({
      where: { type: AdminNotificationEmailType.PRODUCT_OOS, isActive: true },
    });
  });
});
