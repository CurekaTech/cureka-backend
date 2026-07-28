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
import { AttributesService } from '../services/attributes.service';
import {
  CreateAttributeDto,
  UpdateAttributeDto,
  UpdateAttributeStatusDto,
} from '../dto/attribute.dto';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('master/attributes')
export class AttributesController {
  constructor(private readonly attributesService: AttributesService) {}

  @ResponseMessage('Attribute created successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('attributes.create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateAttributeDto, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.attributesService.create(dto, user.email);
  }

  @ResponseMessage('Attributes retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('attributes.read')
  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.attributesService.findAll(query);
  }

  @ResponseMessage('Attribute retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('attributes.read')
  @Get(':refId')
  findOne(@Param('refId', RefIdPipe) refId: string) {
    return this.attributesService.findOne(refId);
  }

  @ResponseMessage('Attribute status updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('attributes.status')
  @Patch(':refId/status')
  updateStatus(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateAttributeStatusDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.attributesService.updateStatus(refId, dto, user.email);
  }

  @ResponseMessage('Attribute updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('attributes.update')
  @Patch(':refId')
  update(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateAttributeDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.attributesService.update(refId, dto, user.email);
  }

  @ResponseMessage('Attribute deleted successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('attributes.delete')
  @Delete(':refId')
  @HttpCode(HttpStatus.OK)
  remove(@Param('refId', RefIdPipe) refId: string) {
    return this.attributesService.remove(refId);
  }
}
