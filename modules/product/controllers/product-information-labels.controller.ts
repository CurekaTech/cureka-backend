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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RefIdPipe, ResponseMessage } from '@packages/common';
import { JwtAuthGuard, RolesGuard, Roles, CurrentAdminUser, IAdminJwtPayload } from '@packages/auth';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { ProductInformationLabelsService } from '../services/product-information-labels.service';
import {
  CreateProductInformationLabelDto,
  UpdateProductInformationLabelDto,
  UpdateProductInformationLabelStatusDto,
  ReorderProductInformationLabelsDto,
} from '../dto/product-information-label.dto';
import { MasterListQueryDto } from '@modules/master/dto/master-list-query.dto';

@ApiTags('Product Information Labels')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('product-information-labels')
export class ProductInformationLabelsController {
  constructor(
    private readonly productInformationLabelsService: ProductInformationLabelsService,
  ) {}

  @ApiOperation({ summary: 'Create product information label' })
  @ResponseMessage('Product information label created successfully')
  @Roles(AdminUserRole.SUPER_ADMIN)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: CreateProductInformationLabelDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.productInformationLabelsService.create(dto, user.email);
  }

  @ApiOperation({ summary: 'List product information labels' })
  @ResponseMessage('Product information labels retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Get()
  findAll(@Query() query: MasterListQueryDto) {
    return this.productInformationLabelsService.findAll(query);
  }

  @ApiOperation({ summary: 'Reorder product information labels' })
  @ResponseMessage('Product information labels reordered successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Patch('reorder')
  reorder(
    @Body() dto: ReorderProductInformationLabelsDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.productInformationLabelsService.reorder(dto, user.email);
  }

  @ApiOperation({ summary: 'Get product information label by refId' })
  @ResponseMessage('Product information label retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Get(':refId')
  findOne(@Param('refId', RefIdPipe) refId: string) {
    return this.productInformationLabelsService.findOne(refId);
  }

  @ApiOperation({ summary: 'Update product information label status' })
  @ResponseMessage('Product information label status updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Patch(':refId/status')
  updateStatus(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateProductInformationLabelStatusDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.productInformationLabelsService.updateStatus(refId, dto, user.email);
  }

  @ApiOperation({ summary: 'Update product information label' })
  @ResponseMessage('Product information label updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Patch(':refId')
  update(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateProductInformationLabelDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.productInformationLabelsService.update(refId, dto, user.email);
  }

  @ApiOperation({ summary: 'Delete product information label' })
  @ResponseMessage('Product information label deleted successfully')
  @Roles(AdminUserRole.SUPER_ADMIN)
  @Delete(':refId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('refId', RefIdPipe) refId: string) {
    return this.productInformationLabelsService.remove(refId);
  }
}
