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
import { AttributesService } from '../services/attributes.service';
import { CreateAttributeDto, UpdateAttributeDto, UpdateAttributeStatusDto } from '../dto/attribute.dto';
import { PaginationQueryDto } from '@common/dto/pagination-query.dto';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@modules/auth/guards/roles.guard';
import { Roles } from '@modules/auth/decorators/roles.decorator';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import { IJwtPayload } from '@modules/auth/interfaces/auth.interface';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { ResponseMessage } from '@common/decorators/response-message.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('master/attributes')
export class AttributesController {
  constructor(private readonly attributesService: AttributesService) {}

  @ResponseMessage('Attribute created successfully')
  @Roles(AdminUserRole.SUPER_ADMIN)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateAttributeDto, @CurrentUser() user: IJwtPayload) {
    return this.attributesService.create(dto, user.email);
  }

  @ResponseMessage('Attributes retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.attributesService.findAll(query);
  }

  @ResponseMessage('Attribute retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.attributesService.findOne(id);
  }

  @ResponseMessage('Attribute status updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAttributeStatusDto,
    @CurrentUser() user: IJwtPayload,
  ) {
    return this.attributesService.updateStatus(id, dto, user.email);
  }

  @ResponseMessage('Attribute updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAttributeDto,
    @CurrentUser() user: IJwtPayload,
  ) {
    return this.attributesService.update(id, dto, user.email);
  }

  @ResponseMessage('Attribute deleted successfully')
  @Roles(AdminUserRole.SUPER_ADMIN)
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.attributesService.remove(id);
  }
}
