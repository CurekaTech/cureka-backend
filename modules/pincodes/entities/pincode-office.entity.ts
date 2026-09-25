import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { PincodeEntity } from './pincode.entity';

/** One India Post office. Several offices can share the same pincode. */
@Entity('pincode_offices')
export class PincodeOfficeEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'pincode_id', type: 'uuid' })
  pincodeId!: string;

  @Index()
  @Column({ type: 'varchar', length: 6 })
  pincode!: string;

  @Column({ name: 'circlename', type: 'varchar', length: 255, default: '' })
  circleName!: string;

  @Column({ name: 'regionname', type: 'varchar', length: 255, default: '' })
  regionName!: string;

  @Column({ name: 'divisionname', type: 'varchar', length: 255, default: '' })
  divisionName!: string;

  @Column({ name: 'officename', type: 'varchar', length: 255, default: '' })
  officeName!: string;

  @Column({ name: 'officetype', type: 'varchar', length: 50, default: '' })
  officeType!: string;

  @Column({ type: 'varchar', length: 100, default: '' })
  delivery!: string;

  @Index()
  @Column({ type: 'varchar', length: 255, default: '' })
  district!: string;

  @Index()
  @Column({ name: 'statename', type: 'varchar', length: 255, default: '' })
  stateName!: string;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  latitude!: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  longitude!: string | null;

  @Index({ unique: true })
  @Column({ name: 'source_hash', type: 'varchar', length: 40 })
  sourceHash!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne('PincodeEntity', 'offices', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pincode_id' })
  canonical?: PincodeEntity;
}
