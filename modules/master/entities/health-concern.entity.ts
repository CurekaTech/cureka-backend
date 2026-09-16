import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { IStorageFileReference, storageFileReferenceColumn } from '@packages/storage';
import { MasterStatus } from '../enums/master-status.enum';
import { PatientAudience } from '../enums/patient-audience.enum';

@Entity('health_concerns')
export class HealthConcernEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column(storageFileReferenceColumn())
  icon!: IStorageFileReference | null;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 300 })
  slug!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'meta_title', type: 'varchar', length: 255, nullable: true })
  metaTitle!: string | null;

  @Column({ name: 'meta_description', type: 'text', nullable: true })
  metaDescription!: string | null;

  @Column({ name: 'medical_condition_name', type: 'varchar', length: 255, nullable: true })
  medicalConditionName!: string | null;

  @Column({
    name: 'patient_audience',
    type: 'enum',
    enum: PatientAudience,
    enumName: 'health_concerns_patient_audience_enum',
    nullable: true,
  })
  patientAudience!: PatientAudience | null;

  @Column(storageFileReferenceColumn())
  banner!: IStorageFileReference | null;

  @Column(storageFileReferenceColumn({ name: 'faq_banner' }))
  faqBanner!: IStorageFileReference | null;

  @Index()
  @Column({
    type: 'enum',
    enum: MasterStatus,
    enumName: 'brands_status_enum',
    default: MasterStatus.ACTIVE,
  })
  status!: MasterStatus;

  @Column({ name: 'in_home_page', type: 'boolean', default: false })
  inHomePage!: boolean;

  /**
   * Display order for homepage listing. Lower value = shown first.
   * NULL means unordered; nulls are sorted after explicit indices.
   */
  @Column({ name: 'sort_index', type: 'int', nullable: true, default: null })
  sortIndex!: number | null;

  @Column({ type: 'jsonb', nullable: false, default: () => "'[]'" })
  faqs!: Array<{ question: string; answer: string; sequence?: number }>;
}
