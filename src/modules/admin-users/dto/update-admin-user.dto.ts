import { PartialType, OmitType } from '@nestjs/mapped-types';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { CreateAdminUserDto } from './create-admin-user.dto';
import { AdminUserRole } from '../enums/admin-user-role.enum';

export class UpdateAdminUserDto extends PartialType(
  OmitType(CreateAdminUserDto, ['email', 'password'] as const),
) {
  @IsOptional()
  @IsEnum(AdminUserRole)
  role?: AdminUserRole;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
