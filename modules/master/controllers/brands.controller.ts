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
  Req,
  UseGuards,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { RefIdPipe, ResponseMessage } from '@packages/common';
import { JwtAuthGuard, RolesGuard, Roles, CurrentAdminUser, IAdminJwtPayload } from '@packages/auth';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { RequirePermissions } from '@modules/roles/decorators/permissions.decorator';
import { PermissionsGuard } from '@modules/roles/guards/permissions.guard';
import { BrandsService } from '../services/brands.service';
import { UpdateBrandStatusDto } from '../dto/brand.dto';
import { MasterListQueryDto } from '../dto/master-list-query.dto';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN, AdminUserRole.MODERATOR)
@Controller('master/brands')
export class BrandsController {
  constructor(private readonly brandsService: BrandsService) {}

  @ResponseMessage('Brand created successfully')
  @RequirePermissions('brands.create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Req() req: FastifyRequest, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.brandsService.createFromRequest(req, user.email);
  }

  @ResponseMessage('Brands retrieved successfully')
  @RequirePermissions('brands.read')
  @Get()
  findAll(@Query() query: MasterListQueryDto) {
    return this.brandsService.findAll(query);
  }

  @ResponseMessage('Brand retrieved successfully')
  @RequirePermissions('brands.read')
  @Get(':refId')
  findOne(@Param('refId', RefIdPipe) refId: string) {
    return this.brandsService.findOne(refId);
  }

  @ResponseMessage('Brand status updated successfully')
  @RequirePermissions('brands.status')
  @Patch(':refId/status')
  updateStatus(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateBrandStatusDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.brandsService.updateStatus(refId, dto, user.email);
  }

  @ResponseMessage('Brand updated successfully')
  @RequirePermissions('brands.update')
  @Patch(':refId')
  update(
    @Param('refId', RefIdPipe) refId: string,
    @Req() req: FastifyRequest,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.brandsService.updateFromRequest(refId, req, user.email);
  }

  @ResponseMessage('Brand deleted successfully')
  @RequirePermissions('brands.delete')
  @Delete(':refId')
  @HttpCode(HttpStatus.OK)
  remove(@Param('refId', RefIdPipe) refId: string) {
    return this.brandsService.remove(refId);
  }
}
