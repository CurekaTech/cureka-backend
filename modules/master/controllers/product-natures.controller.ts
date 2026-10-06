import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RefIdPipe, PaginationQueryDto, ResponseMessage } from '@packages/common';
import { JwtAuthGuard, RolesGuard, Roles, CurrentAdminUser, IAdminJwtPayload } from '@packages/auth';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { RequirePermissions } from '@modules/roles/decorators/permissions.decorator';
import { PermissionsGuard } from '@modules/roles/guards/permissions.guard';
import { ProductNaturesService } from '../services/product-natures.service';
import {
  CreateProductNatureDto,
  UpdateProductNatureDto,
  UpdateProductNatureStatusDto,
} from '../dto/product-nature.dto';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN, AdminUserRole.MODERATOR)
@Controller('master/product-natures')
export class ProductNaturesController {
  constructor(private readonly productNaturesService: ProductNaturesService) {}

  @ResponseMessage('Product nature created successfully')
  @RequirePermissions('product_natures.create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateProductNatureDto, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.productNaturesService.create(dto, user.email);
  }

  @ResponseMessage('Product natures retrieved successfully')
  @RequirePermissions('product_natures.read')
  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.productNaturesService.findAll(query);
  }

  @ResponseMessage('Product nature retrieved successfully')
  @RequirePermissions('product_natures.read')
  @Get(':refId')
  findOne(@Param('refId', RefIdPipe) refId: string) {
    return this.productNaturesService.findOne(refId);
  }

  @ResponseMessage('Product nature status updated successfully')
  @RequirePermissions('product_natures.status')
  @Patch(':refId/status')
  updateStatus(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateProductNatureStatusDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.productNaturesService.updateStatus(refId, dto, user.email);
  }

  @ResponseMessage('Product nature updated successfully')
  @RequirePermissions('product_natures.update')
  @Patch(':refId')
  update(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateProductNatureDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.productNaturesService.update(refId, dto, user.email);
  }

  @ResponseMessage('Product nature deleted successfully')
  @RequirePermissions('product_natures.delete')
  @Delete(':refId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('refId', RefIdPipe) refId: string) {
    return this.productNaturesService.remove(refId);
  }
}
