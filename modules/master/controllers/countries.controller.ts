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
import { CountriesService } from '../services/countries.service';
import {
  CreateCountryDto,
  UpdateCountryDto,
  UpdateCountryStatusDto,
} from '../dto/country.dto';
import { PaginationQueryDto } from '@common/dto/pagination-query.dto';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@modules/auth/guards/roles.guard';
import { Roles } from '@modules/auth/decorators/roles.decorator';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import { IJwtPayload } from '@modules/auth/interfaces/auth.interface';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { ResponseMessage } from '@common/decorators/response-message.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('master/countries')
export class CountriesController {
  constructor(private readonly countriesService: CountriesService) {}

  @ResponseMessage('Country created successfully')
  @Roles(AdminUserRole.SUPER_ADMIN)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateCountryDto, @CurrentUser() user: IJwtPayload) {
    return this.countriesService.create(dto, user.email);
  }

  @ResponseMessage('Countries retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.countriesService.findAll(query);
  }

  @ResponseMessage('Country retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Get(':refId')
  findOne(@Param('refId', RefIdPipe) refId: string) {
    return this.countriesService.findOne(refId);
  }

  @ResponseMessage('Country status updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Patch(':refId/status')
  updateStatus(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateCountryStatusDto,
    @CurrentUser() user: IJwtPayload,
  ) {
    return this.countriesService.updateStatus(refId, dto, user.email);
  }

  @ResponseMessage('Country updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Patch(':refId')
  update(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateCountryDto,
    @CurrentUser() user: IJwtPayload,
  ) {
    return this.countriesService.update(refId, dto, user.email);
  }

  @ResponseMessage('Country deleted successfully')
  @Roles(AdminUserRole.SUPER_ADMIN)
  @Delete(':refId')
  @HttpCode(HttpStatus.OK)
  remove(@Param('refId', RefIdPipe) refId: string) {
    return this.countriesService.remove(refId);
  }
}
