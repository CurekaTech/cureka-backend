import { Body, Controller, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, CurrentUser, IJwtPayload } from '@packages/auth';
import { ResponseMessage } from '@packages/common';
import { VerifiedUserGuard } from '@modules/auth/guards/verified-user.guard';
import { UsersService } from '../services/users.service';
import { UpdateUserProfileDto } from '../dto/user.dto';
import { IUser } from '../interfaces/user.interface';

/**
 * Website user self-service endpoints.
 * Profile read is available at GET /auth/me; admin user management is not exposed here.
 */
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * PATCH /api/v1/users/me
   * Updates the authenticated user's profile (requires completed registration).
   */
  @ResponseMessage('Profile updated successfully')
  @UseGuards(JwtAuthGuard, VerifiedUserGuard)
  @Patch('me')
  updateProfile(
    @CurrentUser() user: IJwtPayload,
    @Body() dto: UpdateUserProfileDto,
  ): Promise<IUser> {
    return this.usersService.updateProfile(user.sub, dto);
  }
}
