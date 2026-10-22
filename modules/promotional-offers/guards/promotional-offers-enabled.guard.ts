import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isPromotionalOffersEnabled } from '../utils/promotional-offers-enabled.util';

@Injectable()
export class PromotionalOffersEnabledGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(_context: ExecutionContext): boolean {
    if (!isPromotionalOffersEnabled(this.configService)) throw new NotFoundException();
    return true;
  }
}
