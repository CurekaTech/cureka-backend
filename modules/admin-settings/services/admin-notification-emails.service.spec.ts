import { ConflictException, NotFoundException } from '@nestjs/common';
import { AdminNotificationEmailType } from '../enums/admin-notification-email-type.enum';
import { AdminNotificationEmailsService } from './admin-notification-emails.service';

describe('AdminNotificationEmailsService', () => {
  const repo = {
    findByEmailAndType: jest.fn(),
    existsByRefId: jest.fn(),
    create: jest.fn(),
    findAllPaginated: jest.fn(),
    findByRefId: jest.fn(),
    updateByRefId: jest.fn(),
    softDeleteByRefId: jest.fn(),
    findActiveEmailsByType: jest.fn(),
    countActiveByType: jest.fn(),
  };

  const service = new AdminNotificationEmailsService(repo as never);

  beforeEach(() => {
    jest.clearAllMocks();
    repo.existsByRefId.mockResolvedValue(false);
  });

  it('rejects duplicate email+type on create', async () => {
    repo.findByEmailAndType.mockResolvedValue({ id: '1' });
    await expect(
      service.create({ email: 'Ops@Cureka.com', type: AdminNotificationEmailType.PRODUCT_OOS }, 'admin'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('creates lowercased email with default type', async () => {
    repo.findByEmailAndType.mockResolvedValue(null);
    repo.create.mockImplementation(async (data) => ({
      id: 'uuid',
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      ...data,
    }));

    const result = await service.create({ email: 'Ops@Cureka.com' }, 'admin');
    expect(result.email).toBe('ops@cureka.com');
    expect(result.type).toBe(AdminNotificationEmailType.PRODUCT_OOS);
    expect(result.isActive).toBe(true);
  });

  it('throws NotFound on missing refId', async () => {
    repo.findByRefId.mockResolvedValue(null);
    await expect(service.findOne('missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
