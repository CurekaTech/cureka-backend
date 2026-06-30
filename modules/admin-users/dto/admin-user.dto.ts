import { PartialType, OmitType } from '@nestjs/mapped-types';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { AdminUserRole } from '../enums/admin-user-role.enum';
import { UserRole } from '@modules/users/enums/user-role.enum';
import { UserStatus } from '@modules/users/enums/user-status.enum';
import { IsRefId } from '@packages/common';

export class CreateAdminUserDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  fullName!: string;

  @IsNotEmpty()
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message:
      'Password must contain at least one uppercase letter, one lowercase letter, and one number',
  })
  password!: string;

  @IsOptional()
  @IsEnum(AdminUserRole)
  role?: AdminUserRole = AdminUserRole.ADMIN;

  @IsOptional()
  @IsRefId()
  roleRefId?: string;
}

export class UpdateAdminUserDto extends PartialType(
  OmitType(CreateAdminUserDto, ['email', 'password', 'role'] as const),
) {
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsIn([...Object.values(AdminUserRole), ...Object.values(UserRole)])
  role?: AdminUserRole | UserRole;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}
