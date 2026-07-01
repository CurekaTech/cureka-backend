import { Injectable, BadRequestException } from '@nestjs/common';
import { AdminSettingsRepository } from '@modules/admin-settings/repositories/admin-settings.repository';
import { AdminSettingStatus } from '@modules/admin-settings/enums/admin-setting-status.enum';

@Injectable()
export class PaymentGatewayResolverService {
  constructor(private readonly adminSettingsRepository: AdminSettingsRepository) {}

  async getActiveGateway(): Promise<'cashfree' | 'razorpay' | 'payu'> {
    const settings = await this.adminSettingsRepository.findAll();

    const cashFreeSetting = settings.find(s => s.key === 'cash_free');
    const razorPaySetting = settings.find(s => s.key === 'razor_pay');
    const payYouSetting = settings.find(s => s.key === 'pay_you');

    const isCashFreeEnabled = cashFreeSetting && cashFreeSetting.value === '1' && cashFreeSetting.status === AdminSettingStatus.ACTIVE;
    const isRazorPayEnabled = razorPaySetting && razorPaySetting.value === '1' && razorPaySetting.status === AdminSettingStatus.ACTIVE;
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

    throw new BadRequestException('No payment gateway is currently available');
  }
}
