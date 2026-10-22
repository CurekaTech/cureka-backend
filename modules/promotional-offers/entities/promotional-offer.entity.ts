import { BaseEntity } from '@packages/database';
import { MasterStatus } from '@modules/master/enums/master-status.enum';
import { Column, Entity, Index, OneToMany } from 'typeorm';
import { PromotionalOfferType } from '../enums/promotional-offer-type.enum';
import { PromotionalOfferTargetEntity } from './promotional-offer-target.entity';
import { PromotionalOfferReservationEntity } from './promotional-offer-reservation.entity';

@Entity('promotional_offers')
export class PromotionalOfferEntity extends BaseEntity {
  @Index()
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ name: 'internal_description', type: 'text', nullable: true })
  internalDescription!: string | null;

  @Column({ name: 'customer_message', type: 'varchar', length: 500 })
  customerMessage!: string;

  @Index()
  @Column({
    name: 'offer_type',
    type: 'enum',
    enum: PromotionalOfferType,
    enumName: 'promotional_offers_offer_type_enum',
  })
  offerType!: PromotionalOfferType;

  @Index()
  @Column({
    type: 'enum',
    enum: MasterStatus,
    enumName: 'brands_status_enum',
    default: MasterStatus.INACTIVE,
  })
  status!: MasterStatus;

  @Column({ name: 'start_date', type: 'timestamptz' })
  startDate!: Date;

  @Column({ name: 'expiry_date', type: 'timestamptz' })
  expiryDate!: Date;

  @Column({ type: 'varchar', length: 100, nullable: true })
  code!: string | null;

  @Column({ name: 'usage_limit', type: 'int', nullable: true })
  usageLimit!: number | null;

  @Column({ name: 'same_user_limit', type: 'int', nullable: true })
  sameUserLimit!: number | null;

  @Column({ type: 'jsonb', default: {} })
  config!: Record<string, unknown>;

  @OneToMany(() => PromotionalOfferTargetEntity, (target) => target.offer)
  targets?: PromotionalOfferTargetEntity[];

  @OneToMany(() => PromotionalOfferReservationEntity, (reservation) => reservation.offer)
  reservations?: PromotionalOfferReservationEntity[];
}
