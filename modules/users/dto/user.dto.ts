import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { UserStatus } from '../enums/user-status.enum';
import { UserGender } from '../enums/user-gender.enum';
import { UserMaritalStatus } from '../enums/user-marital-status.enum';

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
