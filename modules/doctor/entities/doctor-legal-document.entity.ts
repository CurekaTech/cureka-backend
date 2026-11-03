import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { DoctorLegalDocumentType } from '../enums/doctor-legal-document-type.enum';
import { DoctorLegalDocumentVersionEntity } from './doctor-legal-document-version.entity';

@Entity('doctor_legal_documents')
export class DoctorLegalDocumentEntity extends BaseEntity {
  @Index('UQ_doctor_legal_documents_type', { unique: true })
  @Column({
    type: 'enum',
    enum: DoctorLegalDocumentType,
    enumName: 'doctor_legal_documents_type_enum',
  })
  type!: DoctorLegalDocumentType;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ name: 'current_published_version_id', type: 'uuid', nullable: true })
  currentPublishedVersionId!: string | null;

  @ManyToOne(() => DoctorLegalDocumentVersionEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'current_published_version_id' })
  currentPublishedVersion?: DoctorLegalDocumentVersionEntity | null;

  @OneToMany(() => DoctorLegalDocumentVersionEntity, (version) => version.document)
  versions?: DoctorLegalDocumentVersionEntity[];
}
