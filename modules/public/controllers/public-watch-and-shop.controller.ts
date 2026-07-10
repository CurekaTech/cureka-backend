import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ResponseMessage } from '@packages/common';
import { PublicWatchAndShopQueryDto } from '@modules/master/dto/watch-and-shop.dto';
import { PublicWatchAndShopService } from '../services/public-watch-and-shop.service';

@ApiTags('Public Watch & Shop')
@Controller('public/watch-and-shop')
export class PublicWatchAndShopController {
  constructor(private readonly publicWatchAndShopService: PublicWatchAndShopService) {}

  @ApiOperation({ summary: 'List active Watch & Shop items (paginated)' })
  @ResponseMessage('Watch & Shop items retrieved successfully')
  @Get()
  getWatchAndShopItems(@Query() query: PublicWatchAndShopQueryDto) {
    return this.publicWatchAndShopService.findAll(query);
  }
}
