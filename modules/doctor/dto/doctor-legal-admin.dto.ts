import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { DoctorLegalDocumentType } from '../enums/doctor-legal-document-type.enum';

export class CreateLegalDocumentDraftDto {
  @IsEnum(DoctorLegalDocumentType)
  type!: DoctorLegalDocumentType;

  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  title!: string;

  @IsNotEmpty()
  @IsString()
  contentHtml!: string;
}

export class CreateLegalDocumentVersionDto {
  @IsNotEmpty()
  @IsString()
  contentHtml!: string;
}

export class UpdateLegalDocumentTitleDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;
}
