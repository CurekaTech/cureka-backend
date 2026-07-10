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
  Req,
  UseGuards,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { RefIdPipe, ResponseMessage } from '@packages/common';
import { JwtAuthGuard, RolesGuard, Roles, CurrentAdminUser, IAdminJwtPayload } from '@packages/auth';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { ExpertTalkService } from '../services/expert-talk.service';
import {
  ExpertTalkItemQueryDto,
  ReorderExpertTalkItemsDto,
  UpdateExpertTalkItemStatusDto,
} from '../dto/expert-talk.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('master/expert-talks')
export class ExpertTalkController {
  constructor(private readonly expertTalkService: ExpertTalkService) {}

  @ResponseMessage('Expert talk item created successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Req() req: FastifyRequest, @CurrentAdminUser() user: IAdminJwtPayload) {
    const contentType = req.headers['content-type'] ?? '';
    if (contentType.includes('multipart/form-data')) {
      return this.expertTalkService.createFromRequest(req, user.email);
    }
    return this.expertTalkService.createFromJson(req.body, user.email);
  }

  @ResponseMessage('Expert talk items retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Get()
  findAll(@Query() query: ExpertTalkItemQueryDto) {
    return this.expertTalkService.findAll(query);
  }

  @ResponseMessage('Expert talk items reordered successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Patch('reorder')
  reorder(
    @Body() dto: ReorderExpertTalkItemsDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.expertTalkService.reorder(dto, user.email);
  }

  @ResponseMessage('Expert talk item retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Get(':refId')
  findOne(@Param('refId', RefIdPipe) refId: string) {
    return this.expertTalkService.findOne(refId);
  }

  @ResponseMessage('Expert talk item status updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Patch(':refId/status')
  updateStatus(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateExpertTalkItemStatusDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.expertTalkService.updateStatus(refId, dto, user.email);
  }

  @ResponseMessage('Expert talk item updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Patch(':refId')
  update(
    @Param('refId', RefIdPipe) refId: string,
    @Req() req: FastifyRequest,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    const contentType = req.headers['content-type'] ?? '';
    if (contentType.includes('multipart/form-data')) {
      return this.expertTalkService.updateFromRequest(refId, req, user.email);
    }
    return this.expertTalkService.updateFromJson(refId, req.body, user.email);
  }

  @ResponseMessage('Expert talk item deleted successfully')
  @Roles(AdminUserRole.SUPER_ADMIN)
  @Delete(':refId')
  @HttpCode(HttpStatus.OK)
  remove(@Param('refId', RefIdPipe) refId: string) {
    return this.expertTalkService.remove(refId);
  }
}
