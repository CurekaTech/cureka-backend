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
import { RefIdPipe, PaginationQueryDto, ResponseMessage } from '@packages/common';
import { JwtAuthGuard, RolesGuard, Roles, CurrentAdminUser, IAdminJwtPayload } from '@packages/auth';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { SubscriptionFrequenciesService } from '../services/subscription-frequencies.service';
import {
  CreateSubscriptionFrequencyDto,
  UpdateSubscriptionFrequencyDto,
  UpdateSubscriptionFrequencyStatusDto,
} from '../dto/subscription-frequency.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('master/subscription-frequencies')
export class SubscriptionFrequenciesController {
  constructor(
    private readonly subscriptionFrequenciesService: SubscriptionFrequenciesService,
  ) {}

  @ResponseMessage('Subscription frequency created successfully')
  @Roles(AdminUserRole.SUPER_ADMIN)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: CreateSubscriptionFrequencyDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.subscriptionFrequenciesService.create(dto, user.email);
  }

  @ResponseMessage('Subscription frequencies retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.subscriptionFrequenciesService.findAll(query);
  }

  @ResponseMessage('Subscription frequency retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Get(':refId')
  findOne(@Param('refId', RefIdPipe) refId: string) {
    return this.subscriptionFrequenciesService.findOne(refId);
  }

  @ResponseMessage('Subscription frequency status updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Patch(':refId/status')
  updateStatus(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateSubscriptionFrequencyStatusDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.subscriptionFrequenciesService.updateStatus(refId, dto, user.email);
  }

  @ResponseMessage('Subscription frequency updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Patch(':refId')
  update(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateSubscriptionFrequencyDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.subscriptionFrequenciesService.update(refId, dto, user.email);
  }

  @ResponseMessage('Subscription frequency deleted successfully')
  @Roles(AdminUserRole.SUPER_ADMIN)
  @Delete(':refId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('refId', RefIdPipe) refId: string) {
    return this.subscriptionFrequenciesService.remove(refId);
  }
}
