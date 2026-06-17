import { Body, Controller, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { ResponseMessage } from '@packages/common';
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
 * Website user self-service endpoints.
 * Profile read is available at GET /auth/me; admin user management is not exposed here.
 */
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly uploadsService: UploadsService,
  ) {}

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
