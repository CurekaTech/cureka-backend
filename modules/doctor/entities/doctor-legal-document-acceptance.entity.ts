import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { DoctorLegalDocumentType } from '../enums/doctor-legal-document-type.enum';
import { DoctorEntity } from './doctor.entity';
import { DoctorLegalDocumentEntity } from './doctor-legal-document.entity';
import { DoctorLegalDocumentVersionEntity } from './doctor-legal-document-version.entity';

@Entity('doctor_legal_document_acceptances')
@Unique('UQ_doctor_legal_acceptances_doctor_version', ['doctorId', 'versionId'])
export class DoctorLegalDocumentAcceptanceEntity extends BaseEntity {
  @Index('IDX_doctor_legal_acceptances_doctor_id')
  @Column({ name: 'doctor_id', type: 'uuid' })
  doctorId!: string;

  @ManyToOne(() => DoctorEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'doctor_id' })
  doctor!: DoctorEntity;

  @Index('IDX_doctor_legal_acceptances_document_id')
  @Column({ name: 'document_id', type: 'uuid' })
  documentId!: string;

  @ManyToOne(() => DoctorLegalDocumentEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'document_id' })
  document!: DoctorLegalDocumentEntity;

  @Index('IDX_doctor_legal_acceptances_version_id')
  @Column({ name: 'version_id', type: 'uuid' })
  versionId!: string;

  @ManyToOne(() => DoctorLegalDocumentVersionEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'version_id' })
  version!: DoctorLegalDocumentVersionEntity;

  @Column({
    name: 'document_type',
    type: 'enum',
    enum: DoctorLegalDocumentType,
    enumName: 'doctor_legal_documents_type_enum',
  })
  documentType!: DoctorLegalDocumentType;

  @Column({ name: 'accepted_at', type: 'timestamptz' })
  acceptedAt!: Date;

  @Column({ name: 'ip_address', type: 'varchar', length: 45, nullable: true })
  ipAddress!: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 500, nullable: true })
  userAgent!: string | null;
}
