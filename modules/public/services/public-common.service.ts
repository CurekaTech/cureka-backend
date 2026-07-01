import { Injectable } from '@nestjs/common';
import { CouponsRepository } from '@modules/master/repositories/coupons.repository';
import { IPublicCoupon } from '../interfaces/public-coupon.interface';
import { mapCouponEntitiesToPublic } from '../mappers/public-coupon.mapper';

@Injectable()
export class PublicCommonService {
  constructor(private readonly couponsRepository: CouponsRepository) {}

  async findActiveCoupons(): Promise<IPublicCoupon[]> {
    const coupons = await this.couponsRepository.findAllActiveValid();
    return mapCouponEntitiesToPublic(coupons);
  }
}
