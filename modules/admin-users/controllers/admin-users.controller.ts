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
import { RefIdPipe } from '@packages/common';
import { AdminUsersService } from '../services/admin-users.service';
import { CreateAdminUserDto, UpdateAdminUserDto } from '../dto/admin-user.dto';
import { PaginationQueryDto } from '@packages/common';
import { JwtAuthGuard } from '@packages/auth';
import { RolesGuard } from '@packages/auth';
import { Roles } from '@packages/auth';
import { AdminUserRole } from '../enums/admin-user-role.enum';
import { CurrentAdminUser } from '@packages/auth';
import { IAdminJwtPayload } from '@packages/auth';

@Controller('admin-users')
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AdminUserRole.SUPER_ADMIN)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateAdminUserDto, @CurrentAdminUser() user: IAdminJwtPayload) {
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
  @Get(':refId')
  findOne(@Param('refId', RefIdPipe) refId: string) {
    return this.adminUsersService.findOne(refId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AdminUserRole.SUPER_ADMIN)
  @Patch(':refId')
  update(@Param('refId', RefIdPipe) refId: string, @Body() dto: UpdateAdminUserDto) {
    return this.adminUsersService.update(refId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AdminUserRole.SUPER_ADMIN)
  @Delete(':refId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('refId', RefIdPipe) refId: string) {
    return this.adminUsersService.remove(refId);
  }
}
