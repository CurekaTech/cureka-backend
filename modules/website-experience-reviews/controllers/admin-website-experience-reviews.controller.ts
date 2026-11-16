import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ResponseMessage } from '@packages/common';
import { JwtAuthGuard, Roles, RolesGuard } from '@packages/auth';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { PermissionsGuard } from '@modules/roles/guards/permissions.guard';
import { RequirePermissions } from '@modules/roles/decorators/permissions.decorator';
import { WebsiteExperienceReviewQueryDto } from '../dto/website-experience-review.dto';
import { WebsiteExperienceReviewsService } from '../services/website-experience-reviews.service';

@ApiTags('Admin Website Experience Reviews')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('website-experience-reviews')
export class AdminWebsiteExperienceReviewsController {
  constructor(private readonly reviewsService: WebsiteExperienceReviewsService) {}

  @ApiOperation({ summary: 'List submitted website experience reviews' })
  @ResponseMessage('Website experience reviews retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('website_experience_reviews.read')
  @Get()
  findAll(@Query() query: WebsiteExperienceReviewQueryDto) {
    return this.reviewsService.findAll(query);
  }
}
