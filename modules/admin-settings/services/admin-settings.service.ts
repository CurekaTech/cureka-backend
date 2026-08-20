import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { generateUniqueRefId } from '@packages/common';
import { AdminSettingsRepository } from '../repositories/admin-settings.repository';
import { UpdateSettingValueDto, ToggleSettingStatusDto, BulkUpdateSettingsDto } from '../dto/admin-setting.dto';
import { mapAdminSettingEntitiesToResponse, mapAdminSettingEntityToResponse } from '../mappers/admin-setting.mapper';
import { IAdminSetting } from '../interfaces/admin-setting.interface';
import { AdminSettingStatus } from '../enums/admin-setting-status.enum';
import { AdminSettingEntity } from '../entities/admin-setting.entity';

const SHIPROCKET_CHECKOUT_ENABLED_KEY = 'shiprocketCheckoutEnabled';
const GOKWIK_CHECKOUT_ENABLED_KEY = 'gokwikCheckoutEnabled';
const GOKWIK_SHIPPING_SLABS_KEY = 'gokwik_shipping_slabs';
const COD_CHARGE_KEY = 'cod_charge';
const PAYMENT_GATEWAY_KEYS = ['razor_pay', 'pay_you', 'cash_free', 'shipway'];
const PAYMENT_SETTING_KEYS = [
  ...PAYMENT_GATEWAY_KEYS,
  SHIPROCKET_CHECKOUT_ENABLED_KEY,
  GOKWIK_CHECKOUT_ENABLED_KEY,
];
const BOOLEAN_SETTING_KEYS = [SHIPROCKET_CHECKOUT_ENABLED_KEY, GOKWIK_CHECKOUT_ENABLED_KEY];

/**
 * These two gateways are the native fallback when GoKwik is disabled.
 * At least one of them must always remain active so website checkout
 * (legacy mode) can still process prepaid orders.
 */
const REQUIRED_NATIVE_PG_KEYS = ['razor_pay', 'cash_free'];
const ALLOW_GUEST_LOGIN_KEY = 'allowGuestLogin';

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
        'cod_min_order_amount',
        'cod_max_order_amount',
        'prepaid_charge',
        'prepaid_charge_threshold',
        'prepaid_discount_percent',
        GOKWIK_SHIPPING_SLABS_KEY,
      ];
      return response.filter((setting) => chargeKeys.includes(setting.key));
    }

    if (normalizedType === 'logistic_partners') {
      return [];
    }

    return response;
  }

  async getAllowGuestLogin(): Promise<{ allowGuestLogin: boolean }> {
    const setting = await this.ensureAllowGuestLoginSetting();
    return { allowGuestLogin: this.toBoolean(setting.value) };
  }

  async updateAllowGuestLogin(
    enabled: boolean,
    updatedBy: string,
  ): Promise<{ allowGuestLogin: boolean }> {
    const setting = await this.ensureAllowGuestLoginSetting();
    await this.adminSettingsRepository.updateByKey(ALLOW_GUEST_LOGIN_KEY, {
      value: enabled ? 'true' : 'false',
      status: enabled ? AdminSettingStatus.ACTIVE : AdminSettingStatus.INACTIVE,
      updatedBy,
    });
    return { allowGuestLogin: enabled };
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
      'cod_min_order_amount',
      'cod_max_order_amount',
      'prepaid_charge',
      'prepaid_charge_threshold',
      'prepaid_discount_percent',
      GOKWIK_SHIPPING_SLABS_KEY,
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
                value: '0',
                updatedBy,
              },
              manager,
            );
          }
        }

        // Build effective post-update status map for native PG keys and validate
        // that at least one of razor_pay / cash_free will remain active.
        const nativePgPendingMap = new Map<string, AdminSettingStatus>();
        for (const item of dto.settings) {
          if (REQUIRED_NATIVE_PG_KEYS.includes(item.key) && item.status !== undefined) {
            nativePgPendingMap.set(item.key, item.status);
          }
        }
        // When another native PG is activated, the mutual-exclusivity logic above
        // deactivates razor_pay / cash_free — reflect that in the pending map.
        if (activeItem && !REQUIRED_NATIVE_PG_KEYS.includes(activeItem.key)) {
          for (const key of REQUIRED_NATIVE_PG_KEYS) {
            if (!nativePgPendingMap.has(key)) {
              nativePgPendingMap.set(key, AdminSettingStatus.INACTIVE);
            }
          }
        }
        if (nativePgPendingMap.size) {
          await this.validateNativeGatewayConstraint(nativePgPendingMap, manager);
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

        if (BOOLEAN_SETTING_KEYS.includes(item.key)) {
          Object.assign(updateData, this.syncBooleanSettingFields(item.status, item.value));
        }
        // Gateway toggles often send only status; keep value 1/0 aligned.
        if (PAYMENT_GATEWAY_KEYS.includes(item.key) && item.status !== undefined && item.value === undefined) {
          updateData.value = item.status === AdminSettingStatus.ACTIVE ? '1' : '0';
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

    const updateData: Partial<AdminSettingEntity> = {
      value: dto.value,
      updatedBy,
    };
    if (BOOLEAN_SETTING_KEYS.includes(key)) {
      Object.assign(updateData, this.syncBooleanSettingFields(undefined, dto.value));
    }

    await this.adminSettingsRepository.updateByKey(key, updateData);

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
              // Keep value in sync so gateway resolvers that still read value stay correct.
              value: '0',
              updatedBy,
            },
            manager,
          );
        }
      }

      // When deactivating a native PG, ensure the other one is still active.
      if (REQUIRED_NATIVE_PG_KEYS.includes(key) && dto.status === AdminSettingStatus.INACTIVE) {
        await this.validateNativeGatewayConstraint(new Map([[key, AdminSettingStatus.INACTIVE]]), manager);
      }

      const updateData: Partial<AdminSettingEntity> = {
        status: dto.status,
        updatedBy,
      };
      if (BOOLEAN_SETTING_KEYS.includes(key)) {
        Object.assign(updateData, this.syncBooleanSettingFields(dto.status, undefined));
      }
      if (PAYMENT_GATEWAY_KEYS.includes(key)) {
        updateData.value = dto.status === AdminSettingStatus.ACTIVE ? '1' : '0';
      }

      await this.adminSettingsRepository.updateByKey(key, updateData, manager);

      const updated = await this.adminSettingsRepository.findByKey(key, manager);
      return updated!;
    });

    return mapAdminSettingEntityToResponse(updatedEntity);
  }

  /**
   * Keep checkout boolean flags consistent: status active ↔ value true/1.
   * Admin UI often toggles only one of the two fields.
   */
  private syncBooleanSettingFields(
    status?: AdminSettingStatus,
    value?: string,
  ): Partial<Pick<AdminSettingEntity, 'status' | 'value'>> {
    if (status !== undefined) {
      return {
        status,
        value: status === AdminSettingStatus.ACTIVE ? 'true' : 'false',
      };
    }

    if (value === undefined) {
      return {};
    }

    const normalized = value.toLowerCase().trim();
    const enabled = ['1', 'true', 'yes', 'on'].includes(normalized);
    return {
      value: enabled ? 'true' : 'false',
      status: enabled ? AdminSettingStatus.ACTIVE : AdminSettingStatus.INACTIVE,
    };
  }

  /**
   * Ensures that after applying a batch of status updates, at least one of
   * razor_pay / cash_free will still be active.
   *
   * `pendingUpdates` maps native-PG key → the status it will be set to.
   * Current DB values for keys absent from the map are loaded via `manager`.
   */
  private async validateNativeGatewayConstraint(
    pendingUpdates: Map<string, AdminSettingStatus>,
    manager?: Parameters<AdminSettingsRepository['findByKeys']>[1],
  ): Promise<void> {
    const nativePgSettings = await this.adminSettingsRepository.findByKeys(
      REQUIRED_NATIVE_PG_KEYS,
      manager,
    );
    const effectiveStatus = new Map(nativePgSettings.map((s) => [s.key, s.status]));

    for (const [key, status] of pendingUpdates.entries()) {
      if (REQUIRED_NATIVE_PG_KEYS.includes(key)) {
        effectiveStatus.set(key, status);
      }
    }

    const anyActive = REQUIRED_NATIVE_PG_KEYS.some(
      (k) => effectiveStatus.get(k) === AdminSettingStatus.ACTIVE,
    );

    if (!anyActive) {
      throw new BadRequestException(
        'At least one payment gateway (Razorpay or Cashfree) must remain active at all times',
      );
    }
  }

  private validateSettingValue(key: string, value?: string): void {
    if (key === GOKWIK_SHIPPING_SLABS_KEY && value !== undefined) {
      this.validateChargeSlabs(value, GOKWIK_SHIPPING_SLABS_KEY);
      return;
    }
    if (key === COD_CHARGE_KEY && value !== undefined && value.trim().startsWith('[')) {
      this.validateChargeSlabs(value, COD_CHARGE_KEY);
      return;
    }
    if (value === undefined || !BOOLEAN_SETTING_KEYS.includes(key)) {
      return;
    }

    const normalized = value.toLowerCase().trim();
    if (!['true', 'false', '1', '0'].includes(normalized)) {
      throw new BadRequestException(`Setting "${key}" must be a boolean value`);
    }
  }

  private validateChargeSlabs(value: string, key: string): void {
    try {
      const slabs = JSON.parse(value) as unknown;
      if (!Array.isArray(slabs) || !slabs.length) {
        throw new Error();
      }
      for (const item of slabs) {
        if (!item || typeof item !== 'object') throw new Error();
        const slab = item as Record<string, unknown>;
        const min = Number(slab['min']);
        const max = slab['max'] === null ? null : Number(slab['max']);
        const charge = Number(slab['charge']);
        if (
          !Number.isFinite(min) ||
          min < 0 ||
          (max !== null && (!Number.isFinite(max) || max < min)) ||
          !Number.isFinite(charge) ||
          charge < 0
        ) {
          throw new Error();
        }
      }
    } catch {
      throw new BadRequestException(
        `Setting "${key}" must be a valid charge-slab JSON array`,
      );
    }
  }

  private toBoolean(value: string): boolean {
    const normalized = value.toLowerCase().trim();
    return ['1', 'true', 'yes', 'on'].includes(normalized);
  }

  private async ensureAllowGuestLoginSetting(): Promise<AdminSettingEntity> {
    const existing = await this.adminSettingsRepository.findByKey(ALLOW_GUEST_LOGIN_KEY);
    if (existing) {
      return existing;
    }

    const refId = await generateUniqueRefId('SET', (candidate) =>
      this.adminSettingsRepository.existsByRefId(candidate),
    );

    return this.adminSettingsRepository.create({
      refId,
      key: ALLOW_GUEST_LOGIN_KEY,
      value: 'false',
      status: AdminSettingStatus.INACTIVE,
      description: 'Controls whether guest login is allowed on storefront.',
      createdBy: 'system',
      updatedBy: 'system',
    });
  }
}
