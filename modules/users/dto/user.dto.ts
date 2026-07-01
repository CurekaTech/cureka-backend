import {
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
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { UserStatus } from '../enums/user-status.enum';
import { UserRole } from '../enums/user-role.enum';
import { UserGender } from '../enums/user-gender.enum';
import { UserMaritalStatus } from '../enums/user-marital-status.enum';
import {
  INDIAN_MOBILE_REGEX,
  INDIAN_MOBILE_VALIDATION_MESSAGE,
  normalizeMobileNumber,
} from '@modules/auth/utils/mobile-number.util';

const normalizeMobileField = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? normalizeMobileNumber(value) : value;

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
  @IsDateString()
  dateOfBirth?: string;
}

/** DTO for admin-facing user profile updates (includes status). */
export class UpdateUserProfileAdminDto extends UpdateUserProfileDto {
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
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
}
