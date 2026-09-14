import { CurrentSessionUser } from '@modules/auth/decorators/current-session-user.decorator';
import { SessionCookieGuard } from '@modules/auth/guards/session-cookie.guard';
import { VerifiedUserGuard } from '@modules/auth/guards/verified-user.guard';
import { IUserSessionContext } from '@modules/auth/interfaces/session.interface';
import { ReasonWorkflow } from '@modules/master/enums/reason-workflow.enum';
import { UploadFolder } from '@modules/uploads/enums/upload-folder.enum';
import { MultipartFormService } from '@modules/uploads/services/multipart-form.service';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PaginationQueryDto, ResponseMessage } from '@packages/common';
import { FastifyRequest } from 'fastify';
import {
  CancelReturnRequestDto,
  CreateReturnRequestDto,
  ReturnEligibilityQueryDto,
  SubmitAdditionalInformationDto,
  SubmitReturnBankDetailsDto,
} from '../dto/return-request.dto';
import { ReturnRequestedByType } from '../enums/return-requested-by-type.enum';
import { ReturnActor } from '../interfaces/return-request.interface';
import { ReturnEvidenceService } from '../services/return-evidence.service';
import { ReturnRequestsService } from '../services/return-requests.service';

@ApiTags('Returns')
@ApiBearerAuth()
@UseGuards(SessionCookieGuard, VerifiedUserGuard)
@Controller('returns')
export class ReturnsController {
  constructor(
    private readonly returnRequestsService: ReturnRequestsService,
    private readonly evidenceService: ReturnEvidenceService,
    private readonly multipartFormService: MultipartFormService,
  ) {}

  @ApiOperation({
    summary: 'List the reasons a customer can pick for a return or replacement',
    description: 'Reasons come from the shared Reason Master; internal-only reasons are excluded.',
  })
  @ResponseMessage('Return reasons retrieved successfully')
  @Get('reasons/:workflow')
  reasons(@Param('workflow', new ParseEnumPipe(ReasonWorkflow)) workflow: ReasonWorkflow) {
    return this.returnRequestsService.listReasonsForCustomer(workflow);
  }

  @ApiOperation({
    summary: 'Check which items of an order can be returned',
    description:
      'Returns per-item eligibility, the remaining returnable quantity and the window expiry.',
  })
  @ResponseMessage('Return eligibility retrieved successfully')
  @Get('eligibility/:orderId')
  eligibility(
    @CurrentSessionUser() user: IUserSessionContext,
    @Param('orderId') orderId: string,
    @Query() query: ReturnEligibilityQueryDto,
  ) {
    return this.returnRequestsService.getEligibilityForCustomer(
      orderId,
      user.sub,
      query.expiredProductClaim ?? false,
    );
  }

  @ApiOperation({
    summary: 'Submit a return request',
    description:
      'Creates a request for review. Submitting a return never issues a refund on its own.',
  })
  @ResponseMessage('Return request submitted successfully')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentSessionUser() user: IUserSessionContext,
    @Body() dto: CreateReturnRequestDto,
  ) {
    return this.returnRequestsService.createForCustomer(dto, this.toActor(user));
  }

  @ApiOperation({
    summary: 'Submit a return request with photo or video evidence',
    description:
      'Send the request body as a JSON "data" field plus files named evidenceFile0, evidenceFile1, …',
  })
  @ApiConsumes('multipart/form-data')
  @ResponseMessage('Return request submitted successfully')
  @Post('with-evidence')
  @HttpCode(HttpStatus.CREATED)
  async createWithEvidence(
    @CurrentSessionUser() user: IUserSessionContext,
    @Req() req: FastifyRequest,
  ) {
    const { dto, uploadedUrls } = await this.multipartFormService.parseAndValidate(
      req,
      CreateReturnRequestDto,
      {},
      { indexedFileFields: [{ prefix: 'evidenceFile', folder: UploadFolder.RETURN_EVIDENCE }] },
    );
    return this.returnRequestsService.createForCustomer(
      dto,
      this.toActor(user),
      this.evidenceService.fromUploadedUrls(uploadedUrls),
    );
  }

  @ApiOperation({ summary: 'List my return requests' })
  @ResponseMessage('Return requests retrieved successfully')
  @Get()
  list(@CurrentSessionUser() user: IUserSessionContext, @Query() query: PaginationQueryDto) {
    return this.returnRequestsService.listForCustomer(user.sub, query);
  }

  @ApiOperation({ summary: 'Get one of my return requests' })
  @ResponseMessage('Return request retrieved successfully')
  @Get(':id')
  getOne(@CurrentSessionUser() user: IUserSessionContext, @Param('id') id: string) {
    return this.returnRequestsService.getForCustomer(id, user.sub);
  }

  @ApiOperation({
    summary: 'Cancel my return request',
    description: 'Allowed until operations commit to a pickup.',
  })
  @ResponseMessage('Return request cancelled successfully')
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @CurrentSessionUser() user: IUserSessionContext,
    @Param('id') id: string,
    @Body() dto: CancelReturnRequestDto,
  ) {
    return this.returnRequestsService.cancelByCustomer(id, user.sub, dto);
  }

  @ApiOperation({ summary: 'Reply to a request for more information' })
  @ResponseMessage('Additional information submitted successfully')
  @Post(':id/additional-information')
  @HttpCode(HttpStatus.OK)
  submitAdditionalInformation(
    @CurrentSessionUser() user: IUserSessionContext,
    @Param('id') id: string,
    @Body() dto: SubmitAdditionalInformationDto,
  ) {
    return this.returnRequestsService.submitAdditionalInformation(id, user.sub, dto);
  }

  @ApiOperation({ summary: 'Reply to a request for more information with extra evidence' })
  @ApiConsumes('multipart/form-data')
  @ResponseMessage('Additional information submitted successfully')
  @Post(':id/additional-information/with-evidence')
  @HttpCode(HttpStatus.OK)
  async submitAdditionalInformationWithEvidence(
    @CurrentSessionUser() user: IUserSessionContext,
    @Param('id') id: string,
    @Req() req: FastifyRequest,
  ) {
    const { dto, uploadedUrls } = await this.multipartFormService.parseAndValidate(
      req,
      SubmitAdditionalInformationDto,
      {},
      { indexedFileFields: [{ prefix: 'evidenceFile', folder: UploadFolder.RETURN_EVIDENCE }] },
    );
    return this.returnRequestsService.submitAdditionalInformation(
      id,
      user.sub,
      dto,
      this.evidenceService.fromUploadedUrls(uploadedUrls),
    );
  }

  @ApiOperation({
    summary: 'Add or correct COD refund bank / wallet details',
    description:
      'Allowed until the return is approved. Account number is encrypted at rest; confirmation is never stored.',
  })
  @ResponseMessage('Refund destination updated')
  @Post(':id/bank-details')
  @HttpCode(HttpStatus.OK)
  updateBankDetails(
    @CurrentSessionUser() user: IUserSessionContext,
    @Param('id') id: string,
    @Body() dto: SubmitReturnBankDetailsDto,
  ) {
    return this.returnRequestsService.updateBankDetails(id, user.sub, dto);
  }

  private toActor(user: IUserSessionContext): ReturnActor {
    return {
      id: user.sub,
      email: user.profile?.email ?? undefined,
      role: 'CUSTOMER',
      type: ReturnRequestedByType.CUSTOMER,
    };
  }
}
