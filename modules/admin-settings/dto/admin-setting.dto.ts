import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
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
