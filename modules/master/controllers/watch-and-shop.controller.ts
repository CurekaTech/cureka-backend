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
import { RequirePermissions } from '@modules/roles/decorators/permissions.decorator';
import { PermissionsGuard } from '@modules/roles/guards/permissions.guard';
import { WatchAndShopService } from '../services/watch-and-shop.service';
import {
  ReorderWatchAndShopItemsDto,
  UpdateWatchAndShopItemStatusDto,
  WatchAndShopItemQueryDto,
} from '../dto/watch-and-shop.dto';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN, AdminUserRole.MODERATOR)
@Controller('master/watch-and-shop')
export class WatchAndShopController {
  constructor(private readonly watchAndShopService: WatchAndShopService) {}

  @ResponseMessage('Watch & Shop item created successfully')
  @RequirePermissions('watch_and_shop.create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Req() req: FastifyRequest, @CurrentAdminUser() user: IAdminJwtPayload) {
    const contentType = req.headers['content-type'] ?? '';
    if (contentType.includes('multipart/form-data')) {
      return this.watchAndShopService.createFromRequest(req, user.email);
    }
    return this.watchAndShopService.createFromJson(req.body, user.email);
  }

  @ResponseMessage('Watch & Shop items retrieved successfully')
  @RequirePermissions('watch_and_shop.read')
  @Get()
  findAll(@Query() query: WatchAndShopItemQueryDto) {
    return this.watchAndShopService.findAll(query);
  }

  @ResponseMessage('Watch & Shop items reordered successfully')
  @RequirePermissions('watch_and_shop.update')
  @Patch('reorder')
  reorder(
    @Body() dto: ReorderWatchAndShopItemsDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.watchAndShopService.reorder(dto, user.email);
  }

  @ResponseMessage('Watch & Shop item retrieved successfully')
  @RequirePermissions('watch_and_shop.read')
  @Get(':refId')
  findOne(@Param('refId', RefIdPipe) refId: string) {
    return this.watchAndShopService.findOne(refId);
  }

  @ResponseMessage('Watch & Shop item status updated successfully')
  @RequirePermissions('watch_and_shop.status')
  @Patch(':refId/status')
  updateStatus(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateWatchAndShopItemStatusDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.watchAndShopService.updateStatus(refId, dto, user.email);
  }

  @ResponseMessage('Watch & Shop item updated successfully')
  @RequirePermissions('watch_and_shop.update')
  @Patch(':refId')
  update(
    @Param('refId', RefIdPipe) refId: string,
    @Req() req: FastifyRequest,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    const contentType = req.headers['content-type'] ?? '';
    if (contentType.includes('multipart/form-data')) {
      return this.watchAndShopService.updateFromRequest(refId, req, user.email);
    }
    return this.watchAndShopService.updateFromJson(refId, req.body, user.email);
  }

  @ResponseMessage('Watch & Shop item deleted successfully')
  @RequirePermissions('watch_and_shop.delete')
  @Delete(':refId')
  @HttpCode(HttpStatus.OK)
  remove(@Param('refId', RefIdPipe) refId: string) {
    return this.watchAndShopService.remove(refId);
  }
}
