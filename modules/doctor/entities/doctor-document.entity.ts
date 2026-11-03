import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { IStorageFileReference, storageFileReferenceColumn } from '@packages/storage';
import { DoctorDocumentType } from '../enums/doctor-document-type.enum';
import { DoctorEntity } from './doctor.entity';

@Entity('doctor_documents')
export class DoctorDocumentEntity extends BaseEntity {
  @Index('IDX_doctor_documents_doctor_id')
  @Column({ name: 'doctor_id', type: 'uuid' })
  doctorId!: string;

  @ManyToOne(() => DoctorEntity, (doctor) => doctor.documents, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'doctor_id' })
  doctor!: DoctorEntity;

  @Column({
    name: 'doc_type',
    type: 'enum',
    enum: DoctorDocumentType,
    enumName: 'doctor_documents_doc_type_enum',
    default: DoctorDocumentType.SUPPORTING,
  })
  docType!: DoctorDocumentType;

  @Column(storageFileReferenceColumn({ name: 'file', nullable: false }))
  file!: IStorageFileReference;

  @Column({ name: 'mime_type', type: 'varchar', length: 120, nullable: true })
  mimeType!: string | null;

  @Column({ name: 'original_name', type: 'varchar', length: 255, nullable: true })
  originalName!: string | null;
}
