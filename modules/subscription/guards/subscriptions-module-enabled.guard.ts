import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isSubscriptionsModuleEnabled } from '../utils/subscriptions-module.util';

/** Hides subscription and membership APIs unless SUBSCRIPTIONS_MODULE_ENABLED=true. */
@Injectable()
export class SubscriptionsModuleEnabledGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(): boolean {
    if (!isSubscriptionsModuleEnabled(this.configService)) {
      throw new NotFoundException();
    }
    return true;
  }
}
