import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { RefIdPipe, ResponseMessage } from '@packages/common';
import { CurrentAdminUser, IAdminJwtPayload, JwtAuthGuard, Roles, RolesGuard } from '@packages/auth';
import { RequirePermissions } from '@modules/roles/decorators/permissions.decorator';
import { PermissionsGuard } from '@modules/roles/guards/permissions.guard';
import {
  CreatePromotionalOfferDto,
  PromotionalOfferListQueryDto,
  UpdatePromotionalOfferStatusDto,
} from '../dto/promotional-offer.dto';
import { PromotionalOffersEnabledGuard } from '../guards/promotional-offers-enabled.guard';
import { PromotionalOffersService } from '../services/promotional-offers.service';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, PromotionalOffersEnabledGuard)
@Controller('master/promotional-offers')
export class AdminPromotionalOffersController {
  constructor(private readonly promotionalOffersService: PromotionalOffersService) {}

  @ResponseMessage('Promotional offer created successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN, AdminUserRole.MODERATOR)
  @RequirePermissions('promotional_offers.create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreatePromotionalOfferDto, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.promotionalOffersService.create(dto, user.email);
  }

  @ResponseMessage('Promotional offers retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN, AdminUserRole.MODERATOR)
  @RequirePermissions('promotional_offers.read')
  @Get()
  findAll(@Query() query: PromotionalOfferListQueryDto) {
    return this.promotionalOffersService.findAll(query);
  }

  @ResponseMessage('Promotional offer retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN, AdminUserRole.MODERATOR)
  @RequirePermissions('promotional_offers.read')
  @Get(':refId')
  findOne(@Param('refId', RefIdPipe) refId: string) {
    return this.promotionalOffersService.findOne(refId);
  }

  @ResponseMessage('Promotional offer status updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN, AdminUserRole.MODERATOR)
  @RequirePermissions('promotional_offers.status')
  @Patch(':refId/status')
  updateStatus(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdatePromotionalOfferStatusDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.promotionalOffersService.updateStatus(refId, dto, user.email);
  }

  @ResponseMessage('Promotional offer updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN, AdminUserRole.MODERATOR)
  @RequirePermissions('promotional_offers.update')
  @Patch(':refId')
  update(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: CreatePromotionalOfferDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.promotionalOffersService.update(refId, dto, user.email);
  }

  @ResponseMessage('Promotional offer deleted successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN, AdminUserRole.MODERATOR)
  @RequirePermissions('promotional_offers.delete')
  @Delete(':refId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('refId', RefIdPipe) refId: string) {
    return this.promotionalOffersService.remove(refId);
  }
}
