import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { PaginationQueryDto, RefIdPipe, ResponseMessage } from '@packages/common';
import { JwtAuthGuard, RolesGuard, Roles } from '@packages/auth';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { VerifiedUserGuard } from '@modules/auth/guards/verified-user.guard';
import { SessionCookieGuard } from '@modules/auth/guards/session-cookie.guard';
import { CurrentSessionUser } from '@modules/auth/decorators/current-session-user.decorator';
import { IUserSessionContext } from '@modules/auth/interfaces/session.interface';
import { UploadsService } from '@modules/uploads/services/uploads.service';
import { UploadFolder } from '@modules/uploads/enums/upload-folder.enum';
import { UsersService } from '../services/users.service';
import { UpdateUserProfileDto } from '../dto/user.dto';
import { IUser } from '../interfaces/user.interface';

/**
 * Website user endpoints and super-admin user management.
 * Profile read for the logged-in customer is available at GET /auth/me.
 */
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly uploadsService: UploadsService,
  ) {}

  /**
   * GET /api/v1/users
   * Paginated list of all website users (super admin only).
   */
  @ResponseMessage('Users retrieved successfully')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AdminUserRole.SUPER_ADMIN)
  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.usersService.findAll(query);
  }

  /**
   * GET /api/v1/users/:refId
   * Full user details by refId (super admin only).
   */
  @ResponseMessage('User retrieved successfully')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AdminUserRole.SUPER_ADMIN)
  @Get(':refId')
  findOne(@Param('refId', RefIdPipe) refId: string) {
    return this.usersService.findOne(refId);
  }

  /**
   * PATCH /api/v1/users/me
   * Updates the authenticated user's profile (requires completed registration).
   */
  @ResponseMessage('Profile updated successfully')
  @UseGuards(SessionCookieGuard, VerifiedUserGuard)
  @Patch('me')
  updateProfile(
    @CurrentSessionUser() user: IUserSessionContext,
    @Body() dto: UpdateUserProfileDto,
  ): Promise<IUser> {
    return this.usersService.updateProfile(user.sub, dto);
  }

  /**
   * POST /api/v1/users/me/profile-image
   * Multipart upload for profile photo; stores URL on user record.
   */
  @ResponseMessage('Profile image uploaded successfully')
  @UseGuards(SessionCookieGuard, VerifiedUserGuard)
  @Post('me/profile-image')
  async uploadProfileImage(
    @CurrentSessionUser() user: IUserSessionContext,
    @Req() req: FastifyRequest,
  ): Promise<IUser> {
    const uploaded = await this.uploadsService.uploadFromRequest(UploadFolder.AVATARS, req);
    return this.usersService.setProfileImageUrl(user.sub, uploaded.path);
  }
}
