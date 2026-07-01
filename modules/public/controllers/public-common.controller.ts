import { Controller, Get } from '@nestjs/common';
import { ResponseMessage } from '@packages/common';
import { PublicCommonService } from '../services/public-common.service';

@Controller('public')
export class PublicCommonController {
  constructor(private readonly publicCommonService: PublicCommonService) {}

  @ResponseMessage('Active coupons retrieved successfully')
  @Get('coupons')
  findActiveCoupons() {
    return this.publicCommonService.findActiveCoupons();
  }
}
