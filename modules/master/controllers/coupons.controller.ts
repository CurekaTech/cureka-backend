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
import { CouponsService } from '../services/coupons.service';
import { CreateCouponDto, UpdateCouponDto, UpdateCouponStatusDto } from '../dto/coupon.dto';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('master/coupons')
export class CouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  @ResponseMessage('Coupon created successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('coupon_codes.create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateCouponDto, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.couponsService.create(dto, user.email);
  }

  @ResponseMessage('Coupons retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('coupon_codes.read')
  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.couponsService.findAll(query);
  }

  @ResponseMessage('Coupon retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('coupon_codes.read')
  @Get(':refId')
  findOne(@Param('refId', RefIdPipe) refId: string) {
    return this.couponsService.findOne(refId);
  }

  @ResponseMessage('Coupon status updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('coupon_codes.status')
  @Patch(':refId/status')
  updateStatus(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateCouponStatusDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.couponsService.updateStatus(refId, dto, user.email);
  }

  @ResponseMessage('Coupon updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('coupon_codes.update')
  @Patch(':refId')
  update(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateCouponDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.couponsService.update(refId, dto, user.email);
  }

  @ResponseMessage('Coupon deleted successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('coupon_codes.delete')
  @Delete(':refId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('refId', RefIdPipe) refId: string) {
    return this.couponsService.remove(refId);
  }
}
