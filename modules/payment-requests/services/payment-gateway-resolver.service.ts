import { Injectable, BadRequestException } from '@nestjs/common';
import { AdminSettingsRepository } from '@modules/admin-settings/repositories/admin-settings.repository';
import { AdminSettingStatus } from '@modules/admin-settings/enums/admin-setting-status.enum';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PaymentGatewayResolverService {
  constructor(
    private readonly adminSettingsRepository: AdminSettingsRepository,
    private readonly configService: ConfigService,
  ) {}

  async getActiveGateway(): Promise<'cashfree' | 'razorpay' | 'payu'> {
    const settings = await this.adminSettingsRepository.findAll();

    const cashFreeSetting = settings.find(s => s.key === 'cash_free');
    const razorPaySetting = settings.find(s => s.key === 'razor_pay');
    const payYouSetting = settings.find(s => s.key === 'pay_you');

    const cashFreeAppId = this.configService.get<string>('CASHFREE_APP_ID');
    const cashFreeSecretKey = this.configService.get<string>('CASHFREE_SECRET_KEY');
    const hasCashFreeCreds = !!(cashFreeAppId && cashFreeAppId.trim() && cashFreeSecretKey && cashFreeSecretKey.trim());

    const razorPayKeyId = this.configService.get<string>('RAZORPAY_KEY_ID');
    const razorPaySecret = this.configService.get<string>('RAZORPAY_SECRET');
    const hasRazorPayCreds = !!(razorPayKeyId && razorPayKeyId.trim() && razorPaySecret && razorPaySecret.trim());

    const isCashFreeEnabled = cashFreeSetting && cashFreeSetting.value === '1' && cashFreeSetting.status === AdminSettingStatus.ACTIVE && hasCashFreeCreds;
    const isRazorPayEnabled = razorPaySetting && razorPaySetting.value === '1' && razorPaySetting.status === AdminSettingStatus.ACTIVE && hasRazorPayCreds;
    const isPayYouEnabled = payYouSetting && payYouSetting.value === '1' && payYouSetting.status === AdminSettingStatus.ACTIVE;

    if (isCashFreeEnabled) {
      return 'cashfree';
    }
    if (isRazorPayEnabled) {
      return 'razorpay';
    }
    if (isPayYouEnabled) {
      return 'payu';
    }

    // Default fallback to razorpay if it has credentials
    if (hasRazorPayCreds) {
      return 'razorpay';
    }

    throw new BadRequestException('No payment gateway is currently available');
  }
}
