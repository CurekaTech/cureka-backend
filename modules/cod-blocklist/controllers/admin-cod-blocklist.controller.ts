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
import { CurrentAdminUser, IAdminJwtPayload, JwtAuthGuard, Roles, RolesGuard } from '@packages/auth';
import { ResponseMessage } from '@packages/common';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { RequirePermissions } from '@modules/roles/decorators/permissions.decorator';
import { PermissionsGuard } from '@modules/roles/guards/permissions.guard';
import {
  CodBlocklistListQueryDto,
  CreateCodBlocklistEntryDto,
  SearchCodBlocklistCustomersDto,
  UpdateCodBlocklistEntryDto,
} from '../dto/cod-blocklist.dto';
import { CodBlocklistService } from '../services/cod-blocklist.service';

@ApiTags('Admin COD Blocklist')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN, AdminUserRole.MODERATOR)
@Controller('admin/cod-blocklist')
export class AdminCodBlocklistController {
  constructor(private readonly codBlocklistService: CodBlocklistService) {}

  @ApiOperation({ summary: 'List COD blocklist entries' })
  @ResponseMessage('COD blocklist retrieved successfully')
  @RequirePermissions('cod_blocklist.read')
  @Get()
  list(@Query() query: CodBlocklistListQueryDto) {
    return this.codBlocklistService.list(query);
  }

  @ApiOperation({
    summary: 'Search customers to add to the COD blocklist',
    description: 'Search by first name, last name, full name, or mobile number. Minimum 2 characters.',
  })
  @ResponseMessage('Customers retrieved successfully')
  @RequirePermissions('cod_blocklist.read')
  @Get('customers/search')
  searchCustomers(@Query() query: SearchCodBlocklistCustomersDto) {
    return this.codBlocklistService.searchCustomers(query);
  }

  @ApiOperation({ summary: 'Get a COD blocklist entry' })
  @ResponseMessage('COD blocklist entry retrieved successfully')
  @RequirePermissions('cod_blocklist.read')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.codBlocklistService.findOne(id);
  }

  @ApiOperation({ summary: 'Create a COD blocklist entry' })
  @ResponseMessage('COD blocklist entry created successfully')
  @RequirePermissions('cod_blocklist.create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateCodBlocklistEntryDto, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.codBlocklistService.create(dto, user.email);
  }

  @ApiOperation({ summary: 'Update a COD blocklist entry' })
  @ResponseMessage('COD blocklist entry updated successfully')
  @RequirePermissions('cod_blocklist.status')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCodBlocklistEntryDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.codBlocklistService.update(id, dto, user.email);
  }

  @ApiOperation({ summary: 'Delete a COD blocklist entry' })
  @ResponseMessage('COD blocklist entry deleted successfully')
  @RequirePermissions('cod_blocklist.delete')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.codBlocklistService.remove(id);
  }
}
