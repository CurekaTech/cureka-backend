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
import { RefIdPipe } from '@common/pipes/ref-id.pipe';
import { CitiesService } from '../services/cities.service';
import {
  CreateCityDto,
  UpdateCityDto,
  UpdateCityStatusDto,
  CityQueryDto,
} from '../dto/city.dto';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@modules/auth/guards/roles.guard';
import { Roles } from '@modules/auth/decorators/roles.decorator';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import { IJwtPayload } from '@modules/auth/interfaces/auth.interface';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { ResponseMessage } from '@common/decorators/response-message.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('master/cities')
export class CitiesController {
  constructor(private readonly citiesService: CitiesService) {}

  @ResponseMessage('City created successfully')
  @Roles(AdminUserRole.SUPER_ADMIN)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateCityDto, @CurrentUser() user: IJwtPayload) {
    return this.citiesService.create(dto, user.email);
  }

  @ResponseMessage('Cities retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Get()
  findAll(@Query() query: CityQueryDto) {
    return this.citiesService.findAll(query);
  }

  @ResponseMessage('City retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Get(':refId')
  findOne(@Param('refId', RefIdPipe) refId: string) {
    return this.citiesService.findOne(refId);
  }

  @ResponseMessage('City status updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Patch(':refId/status')
  updateStatus(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateCityStatusDto,
    @CurrentUser() user: IJwtPayload,
  ) {
    return this.citiesService.updateStatus(refId, dto, user.email);
  }

  @ResponseMessage('City updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Patch(':refId')
  update(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateCityDto,
    @CurrentUser() user: IJwtPayload,
  ) {
    return this.citiesService.update(refId, dto, user.email);
  }

  @ResponseMessage('City deleted successfully')
  @Roles(AdminUserRole.SUPER_ADMIN)
  @Delete(':refId')
  @HttpCode(HttpStatus.OK)
  remove(@Param('refId', RefIdPipe) refId: string) {
    return this.citiesService.remove(refId);
  }
}
