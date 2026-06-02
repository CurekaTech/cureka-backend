import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminUsersService } from '../services/admin-users.service';
import { CreateAdminUserDto, UpdateAdminUserDto } from '../dto/admin-user.dto';
import { PaginationQueryDto } from '@common/dto/pagination-query.dto';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@modules/auth/guards/roles.guard';
import { Roles } from '@modules/auth/decorators/roles.decorator';
import { AdminUserRole } from '../enums/admin-user-role.enum';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import { IJwtPayload } from '@modules/auth/interfaces/auth.interface';

@Controller('admin-users')
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AdminUserRole.SUPER_ADMIN)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateAdminUserDto, @CurrentUser() user: IJwtPayload) {
    return this.adminUsersService.create(dto, user.email);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.adminUsersService.findAll(query);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminUsersService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AdminUserRole.SUPER_ADMIN)
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAdminUserDto) {
    return this.adminUsersService.update(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AdminUserRole.SUPER_ADMIN)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminUsersService.remove(id);
  }
}

