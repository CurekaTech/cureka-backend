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
import { SubscriptionFrequenciesService } from '../services/subscription-frequencies.service';
import {
  CreateSubscriptionFrequencyDto,
  UpdateSubscriptionFrequencyDto,
  UpdateSubscriptionFrequencyStatusDto,
} from '../dto/subscription-frequency.dto';
import { MasterListQueryDto } from '../dto/master-list-query.dto';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN, AdminUserRole.MODERATOR)
@Controller('master/subscription-frequencies')
export class SubscriptionFrequenciesController {
  constructor(
    private readonly subscriptionFrequenciesService: SubscriptionFrequenciesService,
  ) {}

  @ResponseMessage('Subscription frequency created successfully')
  @RequirePermissions('subscription_frequencies.create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: CreateSubscriptionFrequencyDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.subscriptionFrequenciesService.create(dto, user.email);
  }

  @ResponseMessage('Subscription frequencies retrieved successfully')
  @RequirePermissions('subscription_frequencies.read')
  @Get()
  findAll(@Query() query: MasterListQueryDto) {
    return this.subscriptionFrequenciesService.findAll(query);
  }

  @ResponseMessage('Subscription frequency retrieved successfully')
  @RequirePermissions('subscription_frequencies.read')
  @Get(':refId')
  findOne(@Param('refId', RefIdPipe) refId: string) {
    return this.subscriptionFrequenciesService.findOne(refId);
  }

  @ResponseMessage('Subscription frequency status updated successfully')
  @RequirePermissions('subscription_frequencies.status')
  @Patch(':refId/status')
  updateStatus(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateSubscriptionFrequencyStatusDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.subscriptionFrequenciesService.updateStatus(refId, dto, user.email);
  }

  @ResponseMessage('Subscription frequency updated successfully')
  @RequirePermissions('subscription_frequencies.update')
  @Patch(':refId')
  update(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateSubscriptionFrequencyDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.subscriptionFrequenciesService.update(refId, dto, user.email);
  }

  @ResponseMessage('Subscription frequency deleted successfully')
  @RequirePermissions('subscription_frequencies.delete')
  @Delete(':refId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('refId', RefIdPipe) refId: string) {
    return this.subscriptionFrequenciesService.remove(refId);
  }
}
