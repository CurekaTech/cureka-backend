import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RefIdPipe } from '@common/pipes/ref-id.pipe';
import { UsersService } from '../services/users.service';
import { UpdateUserProfileAdminDto } from '../dto/user.dto';
import { PaginationQueryDto } from '@common/dto/pagination-query.dto';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@modules/auth/guards/roles.guard';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.usersService.findAll(query);
  }

  @Get(':refId')
  findOne(@Param('refId', RefIdPipe) refId: string) {
    return this.usersService.findOne(refId);
  }

  @Patch(':refId')
  update(@Param('refId', RefIdPipe) refId: string, @Body() dto: UpdateUserProfileAdminDto) {
    return this.usersService.update(refId, dto);
  }

  @Delete(':refId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('refId', RefIdPipe) refId: string) {
    return this.usersService.remove(refId);
  }
}
