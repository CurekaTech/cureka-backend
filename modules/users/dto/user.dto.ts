import { IsEmail, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { UserStatus } from '../enums/user-status.enum';

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
}

/** DTO for admin-facing user profile updates (includes status). */
export class UpdateUserProfileAdminDto extends UpdateUserProfileDto {
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}
