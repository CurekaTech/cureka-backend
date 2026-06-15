import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RefIdPipe, ResponseMessage } from '@packages/common';
import { JwtAuthGuard, RolesGuard, Roles, CurrentAdminUser, IAdminJwtPayload } from '@packages/auth';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { ProductWizardService } from '../services/product-wizard.service';
import {
  ProductWizardStep1Dto,
  ProductWizardStep2Dto,
  ProductWizardStep3Dto,
  ProductWizardStep4Dto,
  RejectProductWizardDto,
} from '../dto/product-wizard.dto';

@ApiTags('Product Wizard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class ProductWizardController {
  constructor(private readonly wizardService: ProductWizardService) {}

  @ApiOperation({ summary: 'Step 1 — Create product draft (Identity & Classification)' })
  @ResponseMessage('Product wizard step 1 saved')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Post('products/wizard/step-1')
  @HttpCode(HttpStatus.CREATED)
  createStep1(@Body() dto: ProductWizardStep1Dto, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.wizardService.createStep1(dto, user.email);
  }

  @ApiOperation({ summary: 'Step 1 — Update Identity & Classification' })
  @ResponseMessage('Product wizard step 1 saved')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Patch('products/:refId/wizard/step-1')
  saveStep1(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: ProductWizardStep1Dto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.wizardService.saveStep1(refId, dto, user.email);
  }

  @ApiOperation({ summary: 'Step 2 — Content & Media' })
  @ResponseMessage('Product wizard step 2 saved')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Patch('products/:refId/wizard/step-2')
  saveStep2(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: ProductWizardStep2Dto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.wizardService.saveStep2(refId, dto, user.email);
  }

  @ApiOperation({ summary: 'Step 3 — Pricing & Inventory' })
  @ResponseMessage('Product wizard step 3 saved')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Patch('products/:refId/wizard/step-3')
  saveStep3(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: ProductWizardStep3Dto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.wizardService.saveStep3(refId, dto, user.email);
  }

  @ApiOperation({ summary: 'Step 4 — Policies & Recommendations' })
  @ResponseMessage('Product wizard step 4 saved')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Patch('products/:refId/wizard/step-4')
  saveStep4(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: ProductWizardStep4Dto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.wizardService.saveStep4(refId, dto, user.email);
  }

  @ApiOperation({ summary: 'Get wizard state — step completion & product snapshot' })
  @ResponseMessage('Product wizard state retrieved')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Get('products/:refId/wizard')
  getWizardState(@Param('refId', RefIdPipe) refId: string) {
    return this.wizardService.getWizardState(refId);
  }

  @ApiOperation({ summary: 'Step 5 — Submit product for checker review' })
  @ResponseMessage('Product submitted for review')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Post('products/:refId/wizard/submit')
  submitForReview(
    @Param('refId', RefIdPipe) refId: string,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.wizardService.submitForReview(refId, user.email);
  }

  @ApiOperation({ summary: 'Checker — Approve submitted product' })
  @ResponseMessage('Product approved')
  @Roles(AdminUserRole.SUPER_ADMIN)
  @Post('products/:refId/wizard/approve')
  approve(@Param('refId', RefIdPipe) refId: string, @CurrentAdminUser() user: IAdminJwtPayload) {
    return this.wizardService.approve(refId, user.email);
  }

  @ApiOperation({ summary: 'Checker — Reject submitted product' })
  @ResponseMessage('Product rejected')
  @Roles(AdminUserRole.SUPER_ADMIN)
  @Post('products/:refId/wizard/reject')
  reject(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: RejectProductWizardDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.wizardService.reject(refId, dto.reason, user.email);
  }
}
