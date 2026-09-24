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
import { RefIdPipe, ResponseMessage } from '@packages/common';
import { JwtAuthGuard, RolesGuard, Roles, CurrentAdminUser, IAdminJwtPayload } from '@packages/auth';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { RequirePermissions } from '@modules/roles/decorators/permissions.decorator';
import { PermissionsGuard } from '@modules/roles/guards/permissions.guard';
import { CitiesService } from '../services/cities.service';
import {
  CreateCityDto,
  UpdateCityDto,
  UpdateCityStatusDto,
  CityQueryDto,
} from '../dto/city.dto';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN, AdminUserRole.MODERATOR)
@Controller('master/cities')
export class CitiesController {
  constructor(private readonly citiesService: CitiesService) {}

  @ResponseMessage('City created successfully')
  @RequirePermissions('cities.create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateCityDto, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.citiesService.create(dto, user.email);
  }

  @ResponseMessage('Cities retrieved successfully')
  @RequirePermissions('cities.read')
  @Get()
  findAll(@Query() query: CityQueryDto) {
    return this.citiesService.findAll(query);
  }

  @ResponseMessage('City retrieved successfully')
  @RequirePermissions('cities.read')
  @Get(':refId')
  findOne(@Param('refId', RefIdPipe) refId: string) {
    return this.citiesService.findOne(refId);
  }

  @ResponseMessage('City status updated successfully')
  @RequirePermissions('cities.status')
  @Patch(':refId/status')
  updateStatus(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateCityStatusDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.citiesService.updateStatus(refId, dto, user.email);
  }

  @ResponseMessage('City updated successfully')
  @RequirePermissions('cities.update')
  @Patch(':refId')
  update(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateCityDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.citiesService.update(refId, dto, user.email);
  }

  @ResponseMessage('City deleted successfully')
  @RequirePermissions('cities.delete')
  @Delete(':refId')
  @HttpCode(HttpStatus.OK)
  remove(@Param('refId', RefIdPipe) refId: string) {
    return this.citiesService.remove(refId);
  }
}
