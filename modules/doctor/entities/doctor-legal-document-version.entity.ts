import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { DoctorLegalDocumentVersionStatus } from '../enums/doctor-legal-document-version-status.enum';
import { DoctorLegalDocumentEntity } from './doctor-legal-document.entity';

@Entity('doctor_legal_document_versions')
@Unique('UQ_doctor_legal_document_versions_doc_version', ['documentId', 'versionNumber'])
export class DoctorLegalDocumentVersionEntity extends BaseEntity {
  @Index('IDX_doctor_legal_document_versions_document_id')
  @Column({ name: 'document_id', type: 'uuid' })
  documentId!: string;

  @ManyToOne(() => DoctorLegalDocumentEntity, (doc) => doc.versions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'document_id' })
  document!: DoctorLegalDocumentEntity;

  @Column({ name: 'version_number', type: 'int' })
  versionNumber!: number;

  @Column({ name: 'content_html', type: 'text' })
  contentHtml!: string;

  @Index('IDX_doctor_legal_document_versions_status')
  @Column({
    type: 'enum',
    enum: DoctorLegalDocumentVersionStatus,
    enumName: 'doctor_legal_document_versions_status_enum',
    default: DoctorLegalDocumentVersionStatus.DRAFT,
  })
  status!: DoctorLegalDocumentVersionStatus;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;

  @Column({ name: 'published_by_admin_id', type: 'uuid', nullable: true })
  publishedByAdminId!: string | null;

  @Column({ name: 'published_by_email', type: 'varchar', length: 255, nullable: true })
  publishedByEmail!: string | null;
}
