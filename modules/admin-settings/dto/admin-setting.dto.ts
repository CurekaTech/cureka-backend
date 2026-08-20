import { IsEnum, IsNotEmpty, IsString, IsArray, IsOptional, ValidateNested, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { AdminSettingStatus } from '../enums/admin-setting-status.enum';

export class UpdateSettingValueDto {
  @IsString()
  @IsNotEmpty()
  value!: string;
}

export class ToggleSettingStatusDto {
  @IsEnum(AdminSettingStatus)
  @IsNotEmpty()
  status!: AdminSettingStatus;
}

export class BulkUpdateSettingItemDto {
  @IsString()
  @IsNotEmpty()
  key!: string;

  @IsString()
  @IsOptional()
  value?: string;

  @IsEnum(AdminSettingStatus)
  @IsOptional()
  status?: AdminSettingStatus;
}

export class BulkUpdateSettingsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkUpdateSettingItemDto)
  settings!: BulkUpdateSettingItemDto[];
}

export class UpdateAllowGuestLoginDto {
  @IsBoolean()
  enabled!: boolean;
}

