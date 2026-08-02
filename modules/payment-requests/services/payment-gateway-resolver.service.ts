import { Injectable, BadRequestException } from '@nestjs/common';
import { AdminSettingsRepository } from '@modules/admin-settings/repositories/admin-settings.repository';
import { AdminSettingStatus } from '@modules/admin-settings/enums/admin-setting-status.enum';
import { AdminSettingEntity } from '@modules/admin-settings/entities/admin-setting.entity';
import { ConfigService } from '@nestjs/config';

type NativeGateway = 'cashfree' | 'razorpay' | 'payu';

type GatewayProbe = {
  key: string;
  gateway: NativeGateway;
  adminEnabled: boolean;
  hasCredentials: boolean;
  reasons: string[];
};

@Injectable()
export class PaymentGatewayResolverService {
  constructor(
    private readonly adminSettingsRepository: AdminSettingsRepository,
    private readonly configService: ConfigService,
  ) {}

  async getActiveGateway(): Promise<NativeGateway> {
    const settings = await this.adminSettingsRepository.findAll();

    const cashFree = this.probeCashfree(settings.find((s) => s.key === 'cash_free'));
    const razorPay = this.probeRazorpay(settings.find((s) => s.key === 'razor_pay'));
    const payYou = this.probePayu(settings.find((s) => s.key === 'pay_you'));

    if (cashFree.adminEnabled && cashFree.hasCredentials) {
      return 'cashfree';
    }
    if (razorPay.adminEnabled && razorPay.hasCredentials) {
      return 'razorpay';
    }
    if (payYou.adminEnabled) {
      return 'payu';
    }

    throw new BadRequestException(this.buildFailureMessage([cashFree, razorPay, payYou]));
  }

  private probeCashfree(setting?: AdminSettingEntity): GatewayProbe {
    const reasons: string[] = [];
    const adminEnabled = this.isAdminGatewayEnabled(setting, reasons, 'cash_free');

    const appId = this.configService.get<string>('CASHFREE_APP_ID')?.trim() ?? '';
    const secretKey = this.configService.get<string>('CASHFREE_SECRET_KEY')?.trim() ?? '';
    const hasCredentials = !!(appId && secretKey);

    if (adminEnabled && !hasCredentials) {
      const missing = [
        !appId ? 'CASHFREE_APP_ID' : null,
        !secretKey ? 'CASHFREE_SECRET_KEY' : null,
      ].filter(Boolean);
      reasons.push(
        `cash_free is active in admin but API env is missing ${missing.join(' and ')}`,
      );
    }

    return {
      key: 'cash_free',
      gateway: 'cashfree',
      adminEnabled,
      hasCredentials,
      reasons,
    };
  }

  private probeRazorpay(setting?: AdminSettingEntity): GatewayProbe {
    const reasons: string[] = [];
    const adminEnabled = this.isAdminGatewayEnabled(setting, reasons, 'razor_pay');

    const keyId = this.configService.get<string>('RAZORPAY_KEY_ID')?.trim() ?? '';
    const secret = this.configService.get<string>('RAZORPAY_SECRET')?.trim() ?? '';
    const hasCredentials = !!(keyId && secret);

    if (adminEnabled && !hasCredentials) {
      const missing = [
        !keyId ? 'RAZORPAY_KEY_ID' : null,
        !secret ? 'RAZORPAY_SECRET' : null,
      ].filter(Boolean);
      reasons.push(
        `razor_pay is active in admin but API env is missing ${missing.join(' and ')}`,
      );
    }

    return {
      key: 'razor_pay',
      gateway: 'razorpay',
      adminEnabled,
      hasCredentials,
      reasons,
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
