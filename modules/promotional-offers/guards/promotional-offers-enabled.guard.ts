import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { AdminSettingsService } from '@modules/admin-settings/services/admin-settings.service';

@Injectable()
export class PromotionalOffersEnabledGuard implements CanActivate {
  constructor(private readonly adminSettingsService: AdminSettingsService) {}

  async canActivate(_context: ExecutionContext): Promise<boolean> {
    const enabled = await this.adminSettingsService.isPromotionalOffersEnabled();
    if (!enabled) throw new NotFoundException();
    return true;
  }
}
