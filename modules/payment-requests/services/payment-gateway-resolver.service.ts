import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { AdminSettingsRepository } from '@modules/admin-settings/repositories/admin-settings.repository';
import { AdminSettingStatus } from '@modules/admin-settings/enums/admin-setting-status.enum';
import { AdminSettingEntity } from '@modules/admin-settings/entities/admin-setting.entity';
import { ConfigService } from '@nestjs/config';
import {
  describeCashfreeEnv,
  maskSecret,
} from '../utils/payment-credential-log.util';

type NativeGateway = 'cashfree' | 'razorpay' | 'payu';

type GatewayProbe = {
  key: string;
  gateway: NativeGateway;
  adminEnabled: boolean;
  hasCredentials: boolean;
  reasons: string[];
  diagnostics: Record<string, unknown>;
};

@Injectable()
export class PaymentGatewayResolverService {
  private readonly logger = new Logger(PaymentGatewayResolverService.name);

  constructor(
    private readonly adminSettingsRepository: AdminSettingsRepository,
    private readonly configService: ConfigService,
  ) {}

  async getActiveGateway(): Promise<NativeGateway> {
    this.logger.log('[PG-RESOLVE] Starting native gateway resolution');

    const settings = await this.adminSettingsRepository.findAll();

    const cashFree = this.probeCashfree(settings.find((s) => s.key === 'cash_free'));
    const razorPay = this.probeRazorpay(settings.find((s) => s.key === 'razor_pay'));
    const payYou = this.probePayu(settings.find((s) => s.key === 'pay_you'));

    this.logger.log(
      {
        cashFree: {
          adminEnabled: cashFree.adminEnabled,
          hasCredentials: cashFree.hasCredentials,
          reasons: cashFree.reasons,
          diagnostics: cashFree.diagnostics,
        },
        razorPay: {
          adminEnabled: razorPay.adminEnabled,
          hasCredentials: razorPay.hasCredentials,
          reasons: razorPay.reasons,
          diagnostics: razorPay.diagnostics,
        },
        payYou: {
          adminEnabled: payYou.adminEnabled,
          hasCredentials: payYou.hasCredentials,
          reasons: payYou.reasons,
        },
      },
      '[PG-RESOLVE] Gateway probe results',
    );

    if (cashFree.adminEnabled && cashFree.hasCredentials) {
      this.logger.log(
        { gateway: 'cashfree', env: cashFree.diagnostics },
        '[PG-RESOLVE] Selected Cashfree',
      );
      return 'cashfree';
    }
    if (razorPay.adminEnabled && razorPay.hasCredentials) {
      this.logger.log({ gateway: 'razorpay' }, '[PG-RESOLVE] Selected Razorpay');
      return 'razorpay';
    }
    if (payYou.adminEnabled) {
      this.logger.log({ gateway: 'payu' }, '[PG-RESOLVE] Selected PayU');
      return 'payu';
    }

    const message = this.buildFailureMessage([cashFree, razorPay, payYou]);
    this.logger.error(
      {
        message,
        cashFree: cashFree.diagnostics,
        razorPay: razorPay.diagnostics,
        payYouReasons: payYou.reasons,
      },
      '[PG-RESOLVE] No native gateway available',
    );
    throw new BadRequestException(message);
  }

  private probeCashfree(setting?: AdminSettingEntity): GatewayProbe {
    const reasons: string[] = [];
    const adminEnabled = this.isAdminGatewayEnabled(setting, reasons, 'cash_free');

    const appId = this.configService.get<string>('CASHFREE_APP_ID')?.trim() ?? '';
    const secretKey = this.configService.get<string>('CASHFREE_SECRET_KEY')?.trim() ?? '';
    const envRaw = this.configService.get<string>('CASHFREE_ENV') ?? null;
    const envNormalized = (envRaw ?? 'sandbox').toLowerCase();
    const apiVersion = this.configService.get<string>('CASHFREE_API_VERSION') ?? '2023-08-01';
    const webhookSecret = this.configService.get<string>('CASHFREE_WEBHOOK_SECRET') ?? '';
    const baseUrl =
      envNormalized === 'production'
        ? 'https://api.cashfree.com/pg'
        : 'https://sandbox.cashfree.com/pg';
    const hasCredentials = !!(appId && secretKey);

    const diagnostics = {
      admin: setting
        ? { key: setting.key, status: setting.status, value: setting.value }
        : { key: 'cash_free', status: null, value: null, missing: true },
      env: describeCashfreeEnv({
        appId,
        secretKey,
        envRaw,
        envNormalized,
        apiVersion,
        baseUrl,
        webhookSecret,
      }),
    };

    if (adminEnabled && !hasCredentials) {
      const missing = [
        !appId ? 'CASHFREE_APP_ID' : null,
        !secretKey ? 'CASHFREE_SECRET_KEY' : null,
      ].filter(Boolean);
      reasons.push(
        `cash_free is active in admin but API env is missing ${missing.join(' and ')}`,
      );
      this.logger.error(
        { diagnostics, missing },
        '[PG-RESOLVE] Cashfree admin-enabled but credentials missing/empty',
      );
    }

    return {
      key: 'cash_free',
      gateway: 'cashfree',
      adminEnabled,
      hasCredentials,
      reasons,
      diagnostics,
    };
  }

  private probeRazorpay(setting?: AdminSettingEntity): GatewayProbe {
    const reasons: string[] = [];
    const adminEnabled = this.isAdminGatewayEnabled(setting, reasons, 'razor_pay');

    const keyId = this.configService.get<string>('RAZORPAY_KEY_ID')?.trim() ?? '';
    const secret = this.configService.get<string>('RAZORPAY_SECRET')?.trim() ?? '';
    const hasCredentials = !!(keyId && secret);

    const diagnostics = {
      admin: setting
        ? { key: setting.key, status: setting.status, value: setting.value }
        : { key: 'razor_pay', status: null, value: null, missing: true },
      env: {
        RAZORPAY_KEY_ID: keyId || null,
        RAZORPAY_KEY_ID_length: keyId.length,
        RAZORPAY_SECRET: maskSecret(secret),
      },
    };

    if (adminEnabled && !hasCredentials) {
      const missing = [
        !keyId ? 'RAZORPAY_KEY_ID' : null,
        !secret ? 'RAZORPAY_SECRET' : null,
      ].filter(Boolean);
      reasons.push(
        `razor_pay is active in admin but API env is missing ${missing.join(' and ')}`,
      );
      this.logger.error(
        { diagnostics, missing },
        '[PG-RESOLVE] Razorpay admin-enabled but credentials missing/empty',
      );
    }

    return {
      key: 'razor_pay',
      gateway: 'razorpay',
      adminEnabled,
      hasCredentials,
      reasons,
      diagnostics,
    };
  }

  private probePayu(setting?: AdminSettingEntity): GatewayProbe {
    const reasons: string[] = [];
    const adminEnabled = this.isAdminGatewayEnabled(setting, reasons, 'pay_you');
    return {
      key: 'pay_you',
      gateway: 'payu',
      adminEnabled,
      hasCredentials: true,
      reasons,
      diagnostics: {
        admin: setting
          ? { key: setting.key, status: setting.status, value: setting.value }
          : { key: 'pay_you', status: null, value: null, missing: true },
      },
    };
  }

  /**
   * Admin UI toggles gateway `status`. Value may stay "0"/"1"/"true".
   * Treat status=active as enabled; also accept truthy value for legacy rows.
   */
  private isAdminGatewayEnabled(
    setting: AdminSettingEntity | undefined,
    reasons: string[],
    key: string,
  ): boolean {
    if (!setting) {
      reasons.push(`${key} admin setting row is missing`);
      return false;
    }

    const valueEnabled = this.isTruthyFlag(setting.value);
    const statusEnabled = setting.status === AdminSettingStatus.ACTIVE;

    if (statusEnabled || valueEnabled) {
      return true;
    }

    reasons.push(
      `${key} is not enabled in admin (status=${setting.status}, value=${JSON.stringify(setting.value)})`,
    );
    return false;
  }

  private isTruthyFlag(value?: string | null): boolean {
    if (value == null) {
      return false;
    }
    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase().trim());
  }

  private buildFailureMessage(probes: GatewayProbe[]): string {
    const credentialBlocks = probes.filter((p) => p.adminEnabled && !p.hasCredentials);
    if (credentialBlocks.length) {
      return (
        'Native payment gateway is selected in admin but server credentials are missing. ' +
        credentialBlocks.flatMap((p) => p.reasons).join(' ') +
        '. Set the missing env vars on the API host and restart.'
      );
    }

    const details = probes.flatMap((p) => p.reasons);
    return (
      'No native payment gateway is enabled for checkout. ' +
      (details.length ? details.join(' ') + ' ' : '') +
      'Activate cash_free or razor_pay in admin payment settings (status=active).'
    );
  }
}
