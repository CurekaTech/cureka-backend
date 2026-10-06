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
import { CountriesService } from '../services/countries.service';
import {
  CreateCountryDto,
  UpdateCountryDto,
  UpdateCountryStatusDto,
} from '../dto/country.dto';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN, AdminUserRole.MODERATOR)
@Controller('master/countries')
export class CountriesController {
  constructor(private readonly countriesService: CountriesService) {}

  @ResponseMessage('Country created successfully')
  @RequirePermissions('countries.create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateCountryDto, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.countriesService.create(dto, user.email);
  }

  @ResponseMessage('Countries retrieved successfully')
  @RequirePermissions('countries.read')
  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.countriesService.findAll(query);
  }

  @ResponseMessage('Country retrieved successfully')
  @RequirePermissions('countries.read')
  @Get(':refId')
  findOne(@Param('refId', RefIdPipe) refId: string) {
    return this.countriesService.findOne(refId);
  }

  @ResponseMessage('Country status updated successfully')
  @RequirePermissions('countries.status')
  @Patch(':refId/status')
  updateStatus(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateCountryStatusDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.countriesService.updateStatus(refId, dto, user.email);
  }

  @ResponseMessage('Country updated successfully')
  @RequirePermissions('countries.update')
  @Patch(':refId')
  update(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateCountryDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.countriesService.update(refId, dto, user.email);
  }

  @ResponseMessage('Country deleted successfully')
  @RequirePermissions('countries.delete')
  @Delete(':refId')
  @HttpCode(HttpStatus.OK)
  remove(@Param('refId', RefIdPipe) refId: string) {
    return this.countriesService.remove(refId);
  }
}
