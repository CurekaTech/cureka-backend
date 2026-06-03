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
} from '@nestjs/common';
import { RefIdPipe } from '@common/pipes/ref-id.pipe';
import { UsersService } from '../services/users.service';
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { PaginationQueryDto } from '@common/dto/pagination-query.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.usersService.findAll(query);
  }

  @Get(':refId')
  findOne(@Param('refId', RefIdPipe) refId: string) {
    return this.usersService.findOne(refId);
  }

  @Patch(':refId')
  update(@Param('refId', RefIdPipe) refId: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(refId, dto);
  }

  @Delete(':refId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('refId', RefIdPipe) refId: string) {
    return this.usersService.remove(refId);
  }
}
