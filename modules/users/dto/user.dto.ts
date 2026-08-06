import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { PaginationQueryDto } from '@packages/common';
import { UserStatus } from '../enums/user-status.enum';
import { UserRole } from '../enums/user-role.enum';
import { UserGender } from '../enums/user-gender.enum';
import { UserMaritalStatus } from '../enums/user-marital-status.enum';
import { AdminCustomerAddressDto, CreateUserAddressDto } from './user-address.dto';
import {
  INDIAN_MOBILE_REGEX,
  INDIAN_MOBILE_VALIDATION_MESSAGE,
  normalizeMobileNumber,
} from '@modules/auth/utils/mobile-number.util';

const normalizeMobileField = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? normalizeMobileNumber(value) : value;

const parseBoolean = ({ value }: { value: unknown }): boolean | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return undefined;
};

/** Admin list filter: guest checkout users vs registered customers. */
export enum AdminUserTypeFilter {
  GUEST = 'guest',
  CUSTOMER = 'customer',
}

/** DTO for website users updating their own profile. */
export class UpdateUserProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  mobileNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  profileImageUrl?: string;

  @IsOptional()
  @IsEnum(UserGender)
  gender?: UserGender;

  @IsOptional()
  @IsEnum(UserMaritalStatus)
  maritalStatus?: UserMaritalStatus;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === null || value === '' || value === undefined) return undefined;
    return value;
  })
  @IsDateString({}, { message: 'dateOfBirth must be a valid ISO 8601 date string (e.g. 1990-06-15)' })
  dateOfBirth?: string;
}

/** DTO for admin-facing user profile updates (includes status). */
export class UpdateUserProfileAdminDto extends UpdateUserProfileDto {
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}

/** Admin customer update — profile fields plus address sync. */
export class UpdateAdminCustomerDto extends UpdateUserProfileAdminDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdminCustomerAddressDto)
  addresses?: AdminCustomerAddressDto[];
}

/** Create vendor / telecaller staff in users table (admin panel). */
export class CreateStaffUserDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  firstName!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  lastName!: string;

  @Transform(normalizeMobileField)
  @IsNotEmpty({ message: 'Mobile number is required.' })
  @IsString()
  @Matches(INDIAN_MOBILE_REGEX, { message: INDIAN_MOBILE_VALIDATION_MESSAGE })
  mobileNumber!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsNotEmpty()
  @IsIn([UserRole.VENDOR, UserRole.TELECALLER])
  role!: UserRole;
}

/** Update staff user profile or role. */
export class UpdateStaffUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @Transform(normalizeMobileField)
  @IsString()
  @Matches(INDIAN_MOBILE_REGEX, { message: INDIAN_MOBILE_VALIDATION_MESSAGE })
  mobileNumber?: string;

  @IsOptional()
  @IsIn([UserRole.VENDOR, UserRole.TELECALLER])
  role?: UserRole;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}

/** List staff users with optional role filter. */
export class StaffUserQueryDto {
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn([UserRole.VENDOR, UserRole.TELECALLER])
  role?: UserRole;
}

/**
 * List users with optional status / guest-customer filters (admin panel).
 * When filters are omitted, both ACTIVE/INACTIVE and guest/customer users are returned.
 *
 * Sortable `sortBy` values:
 * createdAt, updatedAt, firstName, lastName, email, mobileNumber, refId,
 * status, lastLoginAt, isGuest, isRegistered, totalOrders, totalSpend, lastOrderAt
 */
export class UserListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsEnum(UserStatus)
  status?: UserStatus;

  /**
   * Menu-friendly filter: `guest` → isGuest=true, `customer` → isGuest=false.
   * Takes precedence over `isGuest` when both are sent.
   */
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEnum(AdminUserTypeFilter)
  userType?: AdminUserTypeFilter;

  /** Filter guest checkout users (`true`) vs registered customers (`false`). */
  @IsOptional()
  @Transform(parseBoolean)
  @IsBoolean()
  isGuest?: boolean;

  /** Default: `createdAt` (newest users first when combined with sortOrder=DESC). */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  sortBy?: string = 'createdAt';

  /** Default: `DESC`. Accepts `desc` / `asc` from the admin UI. */
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC' = 'DESC';
}

/** Resolve guest/customer filter from `userType` (wins) or `isGuest`. */
export const resolveAdminUserIsGuestFilter = (query: {
  userType?: AdminUserTypeFilter;
  isGuest?: boolean;
}): boolean | undefined => {
  if (query.userType === AdminUserTypeFilter.GUEST) return true;
  if (query.userType === AdminUserTypeFilter.CUSTOMER) return false;
  return query.isGuest;
};

/** PATCH /users/:refId/status */
export class UpdateUserStatusDto {
  @IsNotEmpty()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsEnum(UserStatus)
  status!: UserStatus;
}

/** Admin DTO to create a new customer user (used in payment-request wizard). */
export class CreateAdminCustomerDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  firstName!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  lastName!: string;

  @Transform(normalizeMobileField)
  @IsNotEmpty({ message: 'Mobile number is required.' })
  @IsString()
  @Matches(INDIAN_MOBILE_REGEX, { message: INDIAN_MOBILE_VALIDATION_MESSAGE })
  mobileNumber!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateUserAddressDto)
  addresses?: CreateUserAddressDto[];
}
