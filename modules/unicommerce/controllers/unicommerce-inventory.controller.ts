import { Body, Controller, Post, Res, UseFilters, UseGuards } from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { UnicommerceInventoryService } from '../services/unicommerce-inventory.service';
import { UnicommerceUpdateInventoryDto } from '../dto/unicommerce-update-inventory.dto';
import { UnicommerceApiKeyGuard } from '../guards/unicommerce-api-key.guard';
import { UnicommerceUnauthorizedFilter } from '../filters/unicommerce-exception.filter';

@Controller('unicommerce')
@UseFilters(UnicommerceUnauthorizedFilter)
export class UnicommerceInventoryController {
  constructor(private readonly inventoryService: UnicommerceInventoryService) {}

  @Post('updateInventory')
  @UseGuards(UnicommerceApiKeyGuard)
  async updateInventory(
    @Body() dto: UnicommerceUpdateInventoryDto,
    @Res() res: FastifyReply,
  ): Promise<void> {
    const result = await this.inventoryService.updateInventory(dto);
    void res.send(result);
  }
}
