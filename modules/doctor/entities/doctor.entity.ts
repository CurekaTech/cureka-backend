import { Column, Entity, Index, OneToMany, OneToOne } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { IStorageFileReference, storageFileReferenceColumn } from '@packages/storage';
import { DoctorCategory } from '../enums/doctor-category.enum';
import { DoctorStatus } from '../enums/doctor-status.enum';
import { DoctorBankDetailsEntity } from './doctor-bank-details.entity';
import { DoctorClinicAssociationEntity } from './doctor-clinic-association.entity';
import { DoctorConsultationConfigEntity } from './doctor-consultation-config.entity';
import { DoctorDocumentEntity } from './doctor-document.entity';
import { DoctorLanguageMapEntity } from './doctor-language-map.entity';
import { DoctorQualificationMapEntity } from './doctor-qualification-map.entity';
import { DoctorSpecializationMapEntity } from './doctor-specialization-map.entity';

@Entity('doctors')
export class DoctorEntity extends BaseEntity {
  @Index('IDX_doctors_category')
  @Column({
    type: 'enum',
    enum: DoctorCategory,
    enumName: 'doctors_category_enum',
  })
  category!: DoctorCategory;

  @Column({ name: 'full_name', type: 'varchar', length: 255 })
  fullName!: string;

  @Column(storageFileReferenceColumn({ name: 'profile_photo', nullable: true }))
  profilePhoto!: IStorageFileReference | null;

  @Index('UQ_doctors_email', { unique: true })
  @Column({ type: 'varchar', length: 255 })
  email!: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255, select: false })
  passwordHash!: string;

  @Column({ name: 'must_change_password', type: 'boolean', default: true })
  mustChangePassword!: boolean;

  @Index('IDX_doctors_phone')
  @Column({ type: 'varchar', length: 20, nullable: true })
  phone!: string | null;

  @Column({ name: 'registration_number', type: 'varchar', length: 100, nullable: true })
  registrationNumber!: string | null;

  @Column({ name: 'years_experience', type: 'int', default: 0 })
  yearsExperience!: number;

  @Column({ type: 'text', nullable: true })
  bio!: string | null;

  @Index('IDX_doctors_status')
  @Column({
    type: 'enum',
    enum: DoctorStatus,
    enumName: 'doctors_status_enum',
    default: DoctorStatus.DRAFT,
  })
  status!: DoctorStatus;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason!: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: false })
  isActive!: boolean;

  @Column({ name: 'is_bookable', type: 'boolean', default: false })
  isBookable!: boolean;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt!: Date | null;

  @Column({ name: 'slug', type: 'varchar', length: 280 })
  @Index('UQ_doctors_slug', { unique: true })
  slug!: string;

  @OneToMany(() => DoctorQualificationMapEntity, (row) => row.doctor)
  qualifications?: DoctorQualificationMapEntity[];

  @OneToMany(() => DoctorSpecializationMapEntity, (row) => row.doctor)
  specializations?: DoctorSpecializationMapEntity[];

  @OneToMany(() => DoctorLanguageMapEntity, (row) => row.doctor)
  languages?: DoctorLanguageMapEntity[];

  @OneToMany(() => DoctorDocumentEntity, (row) => row.doctor)
  documents?: DoctorDocumentEntity[];

  @OneToMany(() => DoctorClinicAssociationEntity, (row) => row.doctor)
  clinics?: DoctorClinicAssociationEntity[];

  @OneToOne(() => DoctorConsultationConfigEntity, (row) => row.doctor)
  consultationConfig?: DoctorConsultationConfigEntity;

  @OneToOne(() => DoctorBankDetailsEntity, (row) => row.doctor)
  bankDetails?: DoctorBankDetailsEntity;
}
