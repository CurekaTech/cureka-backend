import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { AdminSettingsRepository } from '../repositories/admin-settings.repository';
import { UpdateSettingValueDto, ToggleSettingStatusDto, BulkUpdateSettingsDto } from '../dto/admin-setting.dto';
import { mapAdminSettingEntitiesToResponse, mapAdminSettingEntityToResponse } from '../mappers/admin-setting.mapper';
import { IAdminSetting } from '../interfaces/admin-setting.interface';
import { AdminSettingStatus } from '../enums/admin-setting-status.enum';
import { AdminSettingEntity } from '../entities/admin-setting.entity';

const SHIPROCKET_CHECKOUT_ENABLED_KEY = 'shiprocketCheckoutEnabled';
const GOKWIK_CHECKOUT_ENABLED_KEY = 'gokwikCheckoutEnabled';
const PAYMENT_GATEWAY_KEYS = ['razor_pay', 'pay_you', 'cash_free'];
const PAYMENT_SETTING_KEYS = [
  ...PAYMENT_GATEWAY_KEYS,
  SHIPROCKET_CHECKOUT_ENABLED_KEY,
  GOKWIK_CHECKOUT_ENABLED_KEY,
];
const BOOLEAN_SETTING_KEYS = [SHIPROCKET_CHECKOUT_ENABLED_KEY, GOKWIK_CHECKOUT_ENABLED_KEY];

@Injectable()
export class AdminSettingsService {
  constructor(private readonly adminSettingsRepository: AdminSettingsRepository) {}

  async findAll(type?: string): Promise<IAdminSetting[]> {
    const entities = await this.adminSettingsRepository.findAll();
    const response = mapAdminSettingEntitiesToResponse(entities);

    if (!type) {
      return response;
    }

    const normalizedType = type.toLowerCase().trim();

    if (normalizedType === 'payment_setting' || normalizedType === 'payment_methods') {
      return response.filter((setting) => PAYMENT_SETTING_KEYS.includes(setting.key));
    }

    if (normalizedType === 'payment_charges' || normalizedType === 'cart_charges') {
      const chargeKeys = [
        'shipping_charge',
        'shipping_charge_threshold',
        'handling_charge',
        'handling_charge_threshold',
        'platform_fee',
        'platform_fee_threshold',
        'cod_charge',
        'cod_charge_threshold',
        'prepaid_charge',
        'prepaid_charge_threshold',
      ];
      return response.filter((setting) => chargeKeys.includes(setting.key));
    }

    if (normalizedType === 'logistic_partners') {
      return [];
    }

    return response;
  }

  async bulkUpdate(
    type: string,
    dto: BulkUpdateSettingsDto,
    updatedBy: string,
  ): Promise<IAdminSetting[]> {
    const normalizedType = type.toLowerCase().trim();
    const validTypes = ['cart_charges', 'payment_charges', 'payment_methods', 'payment_setting', 'logistic_partners'];
    if (!validTypes.includes(normalizedType)) {
      throw new BadRequestException(`Invalid setting type: "${type}"`);
    }

    if (normalizedType === 'logistic_partners') {
      return [];
    }

    const cartChargesKeys = [
      'shipping_charge',
      'shipping_charge_threshold',
      'handling_charge',
      'handling_charge_threshold',
      'platform_fee',
      'platform_fee_threshold',
      'cod_charge',
      'cod_charge_threshold',
      'prepaid_charge',
      'prepaid_charge_threshold',
    ];

    const allowedKeys =
      normalizedType === 'cart_charges' || normalizedType === 'payment_charges'
        ? cartChargesKeys
        : PAYMENT_SETTING_KEYS;

    for (const item of dto.settings) {
      if (!allowedKeys.includes(item.key)) {
        throw new BadRequestException(
          `Setting key "${item.key}" is not allowed for type "${type}"`,
        );
      }
      this.validateSettingValue(item.key, item.value);
    }

    const updatedEntities = await this.adminSettingsRepository.transaction(async (manager) => {
      const keysToUpdate = dto.settings.map((s) => s.key);
      const existingEntities = await this.adminSettingsRepository.findByKeys(keysToUpdate, manager);
      const existingMap = new Map(existingEntities.map((e) => [e.key, e]));

      if (normalizedType === 'payment_methods' || normalizedType === 'payment_setting') {
        const activeItem = dto.settings.find((s) => PAYMENT_GATEWAY_KEYS.includes(s.key) && s.status === AdminSettingStatus.ACTIVE);
        if (activeItem) {
          const otherKeys = PAYMENT_GATEWAY_KEYS.filter((k) => k !== activeItem.key);
          for (const otherKey of otherKeys) {
            await this.adminSettingsRepository.updateByKey(
              otherKey,
              {
                status: AdminSettingStatus.INACTIVE,
                updatedBy,
              },
              manager,
            );
          }
        }
      }

      for (const item of dto.settings) {
        const existing = existingMap.get(item.key);
        if (!existing) {
          throw new NotFoundException(`Setting with key "${item.key}" not found`);
        }

        const updateData: Partial<AdminSettingEntity> = { updatedBy };
        if (item.value !== undefined) {
          updateData.value = item.value;
        }
        if (item.status !== undefined) {
          updateData.status = item.status;
        }

        await this.adminSettingsRepository.updateByKey(item.key, updateData, manager);
      }

      return this.adminSettingsRepository.findByKeys(allowedKeys, manager);
    });

    return mapAdminSettingEntitiesToResponse(updatedEntities);
  }

  async updateValue(key: string, dto: UpdateSettingValueDto, updatedBy: string): Promise<IAdminSetting> {
    const existing = await this.adminSettingsRepository.findByKey(key);
    if (!existing) {
      throw new NotFoundException(`Setting with key "${key}" not found`);
    }
    this.validateSettingValue(key, dto.value);

    await this.adminSettingsRepository.updateByKey(key, {
      value: dto.value,
      updatedBy,
    });

    const updated = await this.adminSettingsRepository.findByKey(key);
    return mapAdminSettingEntityToResponse(updated!);
  }

  async toggleStatus(key: string, dto: ToggleSettingStatusDto, updatedBy: string): Promise<IAdminSetting> {
    const updatedEntity = await this.adminSettingsRepository.transaction(async (manager) => {
      const existing = await this.adminSettingsRepository.findByKey(key, manager);
      if (!existing) {
        throw new NotFoundException(`Setting with key "${key}" not found`);
      }

      if (PAYMENT_GATEWAY_KEYS.includes(key) && dto.status === AdminSettingStatus.ACTIVE) {
        const otherKeys = PAYMENT_GATEWAY_KEYS.filter((k) => k !== key);
        for (const otherKey of otherKeys) {
          await this.adminSettingsRepository.updateByKey(
            otherKey,
            {
              status: AdminSettingStatus.INACTIVE,
              updatedBy,
            },
            manager,
          );
        }
      }

      await this.adminSettingsRepository.updateByKey(
        key,
        {
          status: dto.status,
          updatedBy,
        },
        manager,
      );

      const updated = await this.adminSettingsRepository.findByKey(key, manager);
      return updated!;
    });

    return mapAdminSettingEntityToResponse(updatedEntity);
  }

  private validateSettingValue(key: string, value?: string): void {
    if (value === undefined || !BOOLEAN_SETTING_KEYS.includes(key)) {
      return;
    }

    const normalized = value.toLowerCase().trim();
    if (!['true', 'false', '1', '0'].includes(normalized)) {
      throw new BadRequestException(`Setting "${key}" must be a boolean value`);
    }
  }
}
