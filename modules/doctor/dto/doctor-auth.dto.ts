import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class DoctorLoginDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  email!: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}

export class DoctorRefreshDto {
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

export class DoctorChangePasswordDto {
  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  currentPassword!: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}

export class AcceptLegalDocumentItemDto {
  @IsUUID()
  versionId!: string;
}

export class AcceptLegalDocumentsDto {
  @ValidateNested({ each: true })
  @Type(() => AcceptLegalDocumentItemDto)
  @ArrayMinSize(1)
  @IsArray()
  acceptances!: AcceptLegalDocumentItemDto[];
}
