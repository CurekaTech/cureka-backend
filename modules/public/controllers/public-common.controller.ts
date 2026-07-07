import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ResponseMessage } from '@packages/common';
import { PublicMasterQueryDto } from '../dto/public-master-query.dto';
import { PublicCommonService } from '../services/public-common.service';

@ApiTags('Public')
@Controller('public')
export class PublicCommonController {
  constructor(private readonly publicCommonService: PublicCommonService) {}

  @ResponseMessage('Active coupons retrieved successfully')
  @Get('coupons')
  findActiveCoupons() {
    return this.publicCommonService.findActiveCoupons();
  }

  @ApiOperation({
    summary: 'Get active brands or categories (paginated)',
    description:
      'Pass `type=brand` or `type=category` with optional page, limit, search, sortBy, and sortOrder.',
  })
  @ResponseMessage('Active masters retrieved successfully')
  @Get('masters')
  findMasters(@Query() query: PublicMasterQueryDto) {
    return this.publicCommonService.findMasters(query);
  }
}
