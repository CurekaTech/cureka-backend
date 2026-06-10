import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RefIdPipe, ResponseMessage } from '@packages/common';
import { JwtAuthGuard, RolesGuard, Roles, CurrentAdminUser, IAdminJwtPayload } from '@packages/auth';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { ProductFaqsService } from '../services/product-faqs.service';
import { CreateProductFaqDto, MapProductFaqDto } from '../dto/product-support.dto';
import { Param } from '@nestjs/common';

@ApiTags('Product FAQs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class ProductFaqsController {
  constructor(private readonly faqsService: ProductFaqsService) {}

  @ApiOperation({ summary: 'Create reusable product FAQ' })
  @ResponseMessage('Product FAQ created successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Post('product-faqs')
  createProductFaq(@Body() dto: CreateProductFaqDto, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.faqsService.createProductFaq(dto, user.email);
  }

  @ApiOperation({ summary: 'Map product FAQs to product' })
  @ResponseMessage('Product FAQs mapped successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Post('products/:productRefId/product-faqs')
  mapFaqs(
    @Param('productRefId', RefIdPipe) productRefId: string,
    @Body() dto: MapProductFaqDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.faqsService.mapFaqsToProduct(productRefId, dto.faqRefIds, user.email);
  }
}
