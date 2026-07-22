import {
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
  Body,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { RefIdPipe, ResponseMessage } from '@packages/common';
import { JwtAuthGuard, RolesGuard, Roles, CurrentAdminUser, IAdminJwtPayload } from '@packages/auth';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { TestimonialService } from '../services/testimonial.service';
import {
  TestimonialQueryDto,
  UpdateTestimonialStatusDto,
} from '../dto/testimonial.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('master/testimonials')
export class TestimonialController {
  constructor(private readonly testimonialService: TestimonialService) {}

  @ResponseMessage('Testimonial created successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Req() req: FastifyRequest, @CurrentAdminUser() user: IAdminJwtPayload) {
    const contentType = req.headers['content-type'] ?? '';
    if (contentType.includes('multipart/form-data')) {
      return this.testimonialService.createFromRequest(req, user.email);
    }
    return this.testimonialService.createFromJson(req.body, user.email);
  }

  @ResponseMessage('Testimonials retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Get()
  findAll(@Query() query: TestimonialQueryDto) {
    return this.testimonialService.findAll(query);
  }

  @ResponseMessage('Testimonial retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Get(':refId')
  findOne(@Param('refId', RefIdPipe) refId: string) {
    return this.testimonialService.findOne(refId);
  }

  @ResponseMessage('Testimonial status updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Patch(':refId/status')
  updateStatus(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateTestimonialStatusDto,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    return this.testimonialService.updateStatus(refId, dto, user.email);
  }

  @ResponseMessage('Testimonial updated successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Patch(':refId')
  update(
    @Param('refId', RefIdPipe) refId: string,
    @Req() req: FastifyRequest,
    @CurrentAdminUser() user: IAdminJwtPayload,
  ) {
    const contentType = req.headers['content-type'] ?? '';
    if (contentType.includes('multipart/form-data')) {
      return this.testimonialService.updateFromRequest(refId, req, user.email);
    }
    return this.testimonialService.updateFromJson(refId, req.body, user.email);
  }

  @ResponseMessage('Testimonial deleted successfully')
  @Roles(AdminUserRole.SUPER_ADMIN)
  @Delete(':refId')
  @HttpCode(HttpStatus.OK)
  remove(@Param('refId', RefIdPipe) refId: string) {
    return this.testimonialService.remove(refId);
  }
}
