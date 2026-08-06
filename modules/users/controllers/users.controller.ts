import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { RefIdPipe, ResponseMessage } from '@packages/common';
import { JwtAuthGuard, RolesGuard, Roles } from '@packages/auth';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { VerifiedUserGuard } from '@modules/auth/guards/verified-user.guard';
import { SessionCookieGuard } from '@modules/auth/guards/session-cookie.guard';
import { CurrentSessionUser } from '@modules/auth/decorators/current-session-user.decorator';
import { IUserSessionContext } from '@modules/auth/interfaces/session.interface';
import { UploadsService } from '@modules/uploads/services/uploads.service';
import { UploadFolder } from '@modules/uploads/enums/upload-folder.enum';
import { UsersService } from '../services/users.service';
import {
  PatchUserDto,
  UpdateUserProfileDto,
  UpdateUserStatusDto,
  UserListQueryDto,
} from '../dto/user.dto';
import { CreateUserAddressDto } from '../dto/user-address.dto';
import { ICustomerDetail, IUser } from '../interfaces/user.interface';

/**
 * Website user endpoints and admin user management.
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
   * Paginated admin users list with totalOrders / totalSpend.
   */
  @ResponseMessage('Users retrieved successfully')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Get()
  findAll(@Query() query: UserListQueryDto) {
    return this.usersService.findAll(query);
  }

  /**
   * GET /api/v1/users/customers
   * Paginated list of normal customer users for admin panel.
   */
  @ResponseMessage('Customer users retrieved successfully')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Get('customers')
  findCustomers(@Query() query: UserListQueryDto) {
    return this.usersService.findCustomers(query);
  }

  /**
   * PATCH /api/v1/users/profile
   * Register / update the authenticated user after OTP login.
   * Uses session cookie or Bearer token from verify-otp.
   * Accepts mobileNumber + profile fields + optional multiple addresses.
   * Allowed for unregistered users (SessionCookieGuard only).
   */
  @ResponseMessage('User registered successfully')
  @UseGuards(SessionCookieGuard)
  @Patch('profile')
  registerOrUpdateProfile(
    @CurrentSessionUser() user: IUserSessionContext,
    @Body() dto: PatchUserDto,
  ): Promise<ICustomerDetail> {
    return this.usersService.registerOrUpdateUser(user.sub, dto);
  }

  /**
   * PATCH /api/v1/users/me
   * Updates the authenticated user's profile (requires completed registration).
   * Declared before :refId routes so "me" is not captured as a refId.
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

  /**
   * GET /api/v1/users/:refId
   * Admin user detail — profile, addresses, recent orders, order metrics.
   */
  @ResponseMessage('User details retrieved successfully')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Get(':refId')
  findOne(@Param('refId', RefIdPipe) refId: string) {
    return this.usersService.findOne(refId);
  }

  /**
   * PATCH /api/v1/users/:refId/status
   * Toggle user ACTIVE / INACTIVE.
   */
  @ResponseMessage('User status updated successfully')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Patch(':refId/status')
  updateStatus(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: UpdateUserStatusDto,
  ) {
    return this.usersService.updateStatus(refId, dto);
  }

  /**
   * POST /api/v1/users/:refId/addresses
   * Add a new address for a user (admin).
   */
  @ResponseMessage('Address created successfully')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @Post(':refId/addresses')
  createAddress(
    @Param('refId', RefIdPipe) refId: string,
    @Body() dto: CreateUserAddressDto,
  ) {
    return this.usersService.createAddressForUser(refId, dto);
  }
}
