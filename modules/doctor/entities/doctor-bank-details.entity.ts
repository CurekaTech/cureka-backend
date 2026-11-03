import { Column, Entity, Index, JoinColumn, OneToOne } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { DoctorEntity } from './doctor.entity';

@Entity('doctor_bank_details')
export class DoctorBankDetailsEntity extends BaseEntity {
  @Index('UQ_doctor_bank_details_doctor_id', { unique: true })
  @Column({ name: 'doctor_id', type: 'uuid' })
  doctorId!: string;

  @OneToOne(() => DoctorEntity, (doctor) => doctor.bankDetails, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'doctor_id' })
  doctor!: DoctorEntity;

  @Column({ name: 'account_holder_name', type: 'varchar', length: 255 })
  accountHolderName!: string;

  /** Encrypted / vaulted account number — never return raw in public APIs. */
  @Column({ name: 'account_number_encrypted', type: 'text', select: false })
  accountNumberEncrypted!: string;

  @Column({ name: 'account_last4', type: 'varchar', length: 4 })
  accountLast4!: string;

  @Column({ name: 'ifsc_code', type: 'varchar', length: 20 })
  ifscCode!: string;

  @Column({ name: 'bank_name', type: 'varchar', length: 255, nullable: true })
  bankName!: string | null;
}
