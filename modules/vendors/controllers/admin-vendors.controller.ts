import {
  Controller,
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
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FastifyRequest } from 'fastify';
import { CurrentAdminUser, IAdminJwtPayload, JwtAuthGuard, Roles, RolesGuard } from '@packages/auth';
import { RefIdPipe, ResponseMessage } from '@packages/common';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { RequirePermissions } from '@modules/roles/decorators/permissions.decorator';
import { PermissionsGuard } from '@modules/roles/guards/permissions.guard';
import { VendorListQueryDto } from '../dto/register-vendor.dto';
import { VendorSource } from '../enums/vendor-source.enum';
import { VendorsService } from '../services/vendors.service';

@ApiTags('Admin Vendors')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('admin/vendors')
export class AdminVendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  @ApiOperation({ summary: 'Register a vendor from the admin panel (multipart form-data)' })
  @ResponseMessage('Vendor registered successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('vendors.create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Req() req: FastifyRequest, @CurrentAdminUser() user: IAdminJwtPayload) {
    const contentType = req.headers['content-type'] ?? '';
    if (contentType.includes('multipart/form-data')) {
      return this.vendorsService.registerFromRequest(req, VendorSource.ADMIN, user.email);
    }
    return this.vendorsService.registerFromJson(req.body, VendorSource.ADMIN, user.email);
  }

  @ApiOperation({
    summary: 'List registered vendors',
    description:
      'Supports page, limit, search, status, sortBy, sortOrder. ' +
      'sortBy: createdAt, updatedAt, companyName, contactPerson, email, mobileNumber, status, source, gstNumber, panNumber, warehousePincode, refId',
  })
  @ResponseMessage('Vendors retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('vendors.read')
  @Get()
  findAll(@Query() query: VendorListQueryDto) {
    return this.vendorsService.findAll(query);
  }

  @ApiOperation({ summary: 'Get vendor details by refId' })
  @ResponseMessage('Vendor retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('vendors.read')
  @Get(':refId')
  findOne(@Param('refId', RefIdPipe) refId: string) {
    return this.vendorsService.findOne(refId);
  }

  @ApiOperation({
    summary: 'Update vendor (multipart form-data or JSON)',
    description:
      'All fields optional. Omit file fields to keep existing documents. Optional status update.',
  })
  @ResponseMessage('Vendor updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('vendors.update')
  @Patch(':refId')
  update(
    @Param('refId', RefIdPipe) refId: string,
    @Req() req: FastifyRequest,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    const contentType = req.headers['content-type'] ?? '';
    if (contentType.includes('multipart/form-data')) {
      return this.vendorsService.updateFromRequest(refId, req, user.email);
    }
    return this.vendorsService.updateFromJson(refId, req.body, user.email);
  }
}
