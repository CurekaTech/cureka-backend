import { NotFoundException, BadRequestException } from '@nestjs/common';
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
      findByKeys: jest.fn(),
      updateByKey: jest.fn(),
      existsByRefId: jest.fn(),
      transaction: jest.fn().mockImplementation((cb) => cb({} as any)),
    } as unknown as jest.Mocked<AdminSettingsRepository>;

    service = new AdminSettingsService(repository);
  });

  describe('findAll', () => {
    it('should return all settings if no type is provided', async () => {
      const mockEntities = [
        { key: 'razor_pay', value: '1' },
        { key: 'shipping_charge', value: '50' },
        { key: 'discount_charges', value: '900' },
      ] as AdminSettingEntity[];

      repository.findAll.mockResolvedValue(mockEntities);

      const result = await service.findAll();
      expect(result).toHaveLength(3);
      expect(result[0].key).toBe('razor_pay');
    });

    it('should return only payment settings if type is payment_setting', async () => {
      const mockEntities = [
        { key: 'razor_pay', value: '1' },
        { key: 'shipping_charge', value: '50' },
        { key: 'cash_free', value: '0' },
      ] as AdminSettingEntity[];

      repository.findAll.mockResolvedValue(mockEntities);

      const result = await service.findAll('payment_setting');
      expect(result).toHaveLength(2);
      expect(result.map((r) => r.key)).toEqual(['razor_pay', 'cash_free']);
    });

    it('should return only charges and thresholds if type is payment_charges', async () => {
      const mockEntities = [
        { key: 'razor_pay', value: '1' },
        { key: 'shipping_charge', value: '50' },
        { key: 'shipping_charge_threshold', value: '900' },
        { key: 'handling_charge_threshold', value: '900' },
      ] as AdminSettingEntity[];

      repository.findAll.mockResolvedValue(mockEntities);

      const result = await service.findAll('payment_charges');
      expect(result).toHaveLength(3);
      expect(result.map((r) => r.key)).toEqual([
        'shipping_charge',
        'shipping_charge_threshold',
        'handling_charge_threshold',
      ]);
    });
  });

  describe('bulkUpdate', () => {
    it('should throw BadRequestException if type is invalid', async () => {
      await expect(
        service.bulkUpdate('invalid_type', { settings: [] }, 'user@test.com'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should return empty list if type is logistic_partners', async () => {
      const result = await service.bulkUpdate('logistic_partners', { settings: [] }, 'user@test.com');
      expect(result).toEqual([]);
    });

    it('should throw BadRequestException if a key is not allowed for the type', async () => {
      await expect(
        service.bulkUpdate(
          'cart_charges',
          { settings: [{ key: 'razor_pay', value: '1' }] },
          'user@test.com',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should update cart charges successfully', async () => {
      const mockEntities = [
        { key: 'shipping_charge', value: '50' },
        { key: 'shipping_charge_threshold', value: '900' },
      ] as AdminSettingEntity[];

      repository.findByKeys.mockResolvedValue(mockEntities);

      const result = await service.bulkUpdate(
        'cart_charges',
        {
          settings: [
            { key: 'shipping_charge', value: '60' },
            { key: 'shipping_charge_threshold', value: '1000' },
          ],
        },
        'user@test.com',
      );

      expect(repository.updateByKey).toHaveBeenCalledTimes(2);
      expect(repository.updateByKey).toHaveBeenCalledWith(
        'shipping_charge',
        { value: '60', updatedBy: 'user@test.com' },
        expect.any(Object),
      );
    });

    it('should deactivate other payment methods when activating one', async () => {
      const mockEntities = [{ key: 'razor_pay', status: AdminSettingStatus.INACTIVE }] as AdminSettingEntity[];

      repository.findByKeys
        .mockResolvedValueOnce(mockEntities) // checking existing
        .mockResolvedValueOnce([
          { key: 'razor_pay', status: AdminSettingStatus.ACTIVE },
          { key: 'cash_free', status: AdminSettingStatus.INACTIVE },
          { key: 'pay_you', status: AdminSettingStatus.INACTIVE },
        ] as AdminSettingEntity[]); // returning all for type

      const result = await service.bulkUpdate(
        'payment_methods',
        {
          settings: [{ key: 'razor_pay', status: AdminSettingStatus.ACTIVE }],
        },
        'user@test.com',
      );

      // Verify other gateways are set to inactive
      expect(repository.updateByKey).toHaveBeenCalledWith(
        'cash_free',
        { status: AdminSettingStatus.INACTIVE, updatedBy: 'user@test.com' },
        expect.any(Object),
      );
      expect(repository.updateByKey).toHaveBeenCalledWith(
        'pay_you',
        { status: AdminSettingStatus.INACTIVE, updatedBy: 'user@test.com' },
        expect.any(Object),
      );
      // Verify target gateway is updated
      expect(repository.updateByKey).toHaveBeenCalledWith(
        'razor_pay',
        { status: AdminSettingStatus.ACTIVE, updatedBy: 'user@test.com' },
        expect.any(Object),
      );
    });
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
