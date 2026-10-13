import { BadRequestException } from '@nestjs/common';
import { MasterStatus } from '../enums/master-status.enum';
import { CouponsService } from './coupons.service';

describe('CouponsService expiry', () => {
  const couponsRepository = {
    deactivateExpired: jest.fn(),
    findAllPaginated: jest.fn(),
    findByRefId: jest.fn(),
    updateByRefId: jest.fn(),
  };
  const service = new CouponsService(
    {} as never,
    couponsRepository as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { recordWrite: jest.fn() } as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deactivates expired coupons before the admin list is read', async () => {
    couponsRepository.findAllPaginated.mockResolvedValue({ data: [], total: 0 });
    await service.findAll({});
    expect(couponsRepository.deactivateExpired).toHaveBeenCalled();
  });

  it('rejects activating a coupon whose expiry is already past', async () => {
    couponsRepository.findByRefId.mockResolvedValue({
      refId: 'CPN1',
      status: MasterStatus.INACTIVE,
      expiryDate: new Date('2020-01-01T00:00:00.000Z'),
    });
    await expect(
      service.updateStatus('CPN1', { status: MasterStatus.ACTIVE }, 'admin@cureka.com'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(couponsRepository.updateByRefId).not.toHaveBeenCalled();
  });

  it('allows activating a coupon that has not expired', async () => {
    const coupon = {
      id: 'id-1',
      refId: 'CPN1',
      title: 'Save',
      status: MasterStatus.ACTIVE,
      expiryDate: new Date('2099-01-01T00:00:00.000Z'),
    };
    couponsRepository.findByRefId.mockResolvedValue(coupon);
    couponsRepository.updateByRefId.mockResolvedValue(coupon);
    await service.updateStatus('CPN1', { status: MasterStatus.ACTIVE }, 'admin@cureka.com');
    expect(couponsRepository.updateByRefId).toHaveBeenCalledWith('CPN1', {
      status: MasterStatus.ACTIVE,
      updatedBy: 'admin@cureka.com',
    });
  });
});
