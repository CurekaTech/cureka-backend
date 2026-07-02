import { NotFoundException } from '@nestjs/common';
import { AdminSettingsService } from './admin-settings.service';
import { AdminSettingsRepository } from '../repositories/admin-settings.repository';
import { AdminSettingStatus } from '../enums/admin-setting-status.enum';
import { AdminSettingEntity } from '../entities/admin-setting.entity';

describe('AdminSettingsService', () => {
  let service: AdminSettingsService;
  let repository: jest.Mocked<AdminSettingsRepository>;

  beforeEach(() => {
    repository = {
      findAll: jest.fn(),
      findByKey: jest.fn(),
      updateByKey: jest.fn(),
      existsByRefId: jest.fn(),
      transaction: jest.fn().mockImplementation((cb) => cb({} as any)),
    } as unknown as jest.Mocked<AdminSettingsRepository>;

    service = new AdminSettingsService(repository);
  });

  describe('toggleStatus', () => {
    it('should throw NotFoundException if setting is not found', async () => {
      repository.findByKey.mockResolvedValue(null);

      await expect(
        service.toggleStatus('invalid_key', { status: AdminSettingStatus.ACTIVE }, 'user@test.com'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should toggle a non-payment setting status without touching others', async () => {
      const mockEntity = {
        id: '1',
        refId: 'SET001',
        key: 'discount_charges',
        value: '900',
        status: AdminSettingStatus.INACTIVE,
        description: 'discount charge',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as AdminSettingEntity;

      const mockUpdatedEntity = {
        ...mockEntity,
        status: AdminSettingStatus.ACTIVE,
      } as AdminSettingEntity;

      repository.findByKey
        .mockResolvedValueOnce(mockEntity) // first call inside transaction check
        .mockResolvedValueOnce(mockUpdatedEntity); // second call inside transaction return

      const result = await service.toggleStatus(
        'discount_charges',
        { status: AdminSettingStatus.ACTIVE },
        'user@test.com',
      );

      expect(repository.updateByKey).toHaveBeenCalledTimes(1);
      expect(repository.updateByKey).toHaveBeenCalledWith(
        'discount_charges',
        { status: AdminSettingStatus.ACTIVE, updatedBy: 'user@test.com' },
        expect.any(Object),
      );
      expect(result.status).toBe(AdminSettingStatus.ACTIVE);
    });

    it('should deactivate other payment gateways when activating cash_free', async () => {
      const mockEntity = {
        id: '1',
        refId: 'SET002',
        key: 'cash_free',
        value: '1',
        status: AdminSettingStatus.INACTIVE,
        description: 'cashfree',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as AdminSettingEntity;

      const mockUpdatedEntity = {
        ...mockEntity,
        status: AdminSettingStatus.ACTIVE,
      } as AdminSettingEntity;

      repository.findByKey
        .mockResolvedValueOnce(mockEntity)
        .mockResolvedValueOnce(mockUpdatedEntity);

      const result = await service.toggleStatus(
        'cash_free',
        { status: AdminSettingStatus.ACTIVE },
        'user@test.com',
      );

      expect(repository.updateByKey).toHaveBeenCalledTimes(3);
      // Verify other gateways are set to inactive
      expect(repository.updateByKey).toHaveBeenCalledWith(
        'razor_pay',
        { status: AdminSettingStatus.INACTIVE, updatedBy: 'user@test.com' },
        expect.any(Object),
      );
      expect(repository.updateByKey).toHaveBeenCalledWith(
        'pay_you',
        { status: AdminSettingStatus.INACTIVE, updatedBy: 'user@test.com' },
        expect.any(Object),
      );
      // Verify target gateway is set to active
      expect(repository.updateByKey).toHaveBeenCalledWith(
        'cash_free',
        { status: AdminSettingStatus.ACTIVE, updatedBy: 'user@test.com' },
        expect.any(Object),
      );
      expect(result.status).toBe(AdminSettingStatus.ACTIVE);
    });

    it('should not deactivate other payment gateways when setting cash_free to inactive', async () => {
      const mockEntity = {
        id: '1',
        refId: 'SET002',
        key: 'cash_free',
        value: '1',
        status: AdminSettingStatus.ACTIVE,
        description: 'cashfree',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as AdminSettingEntity;

      const mockUpdatedEntity = {
        ...mockEntity,
        status: AdminSettingStatus.INACTIVE,
      } as AdminSettingEntity;

      repository.findByKey
        .mockResolvedValueOnce(mockEntity)
        .mockResolvedValueOnce(mockUpdatedEntity);

      const result = await service.toggleStatus(
        'cash_free',
        { status: AdminSettingStatus.INACTIVE },
        'user@test.com',
      );

      expect(repository.updateByKey).toHaveBeenCalledTimes(1);
      expect(repository.updateByKey).toHaveBeenCalledWith(
        'cash_free',
        { status: AdminSettingStatus.INACTIVE, updatedBy: 'user@test.com' },
        expect.any(Object),
      );
      expect(result.status).toBe(AdminSettingStatus.INACTIVE);
    });
  });
});
