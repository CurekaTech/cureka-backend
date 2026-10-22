import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { PromotionalOfferReservationEntity } from '../entities/promotional-offer-reservation.entity';
import { PromotionalOfferReservationStatus } from '../enums/promotional-offer-reservation-status.enum';

@Injectable()
export class PromotionalOfferReservationsRepository {
  constructor(
    @InjectRepository(PromotionalOfferReservationEntity)
    private readonly repo: Repository<PromotionalOfferReservationEntity>,
  ) {}

  async countActive(offerId: string, userId?: string, manager?: EntityManager): Promise<number> {
    const repository = manager ? manager.getRepository(PromotionalOfferReservationEntity) : this.repo;
    const qb = repository
      .createQueryBuilder('reservation')
      .where('reservation.offerId = :offerId', { offerId })
      .andWhere(
        `(reservation.status = :consumed OR (
            reservation.status = :reserved
            AND (
              reservation.expires_at IS NULL
              OR reservation.expires_at > NOW()
              OR EXISTS (
                SELECT 1 FROM payment_requests pr
                WHERE pr.id = reservation.payment_request_id
                  AND pr.deleted_at IS NULL
                  AND pr.status IN (:pending, :linkGenerated)
              )
            )
          ))`,
        {
          consumed: PromotionalOfferReservationStatus.CONSUMED,
          reserved: PromotionalOfferReservationStatus.RESERVED,
          pending: 'PAYMENT_PENDING',
          linkGenerated: 'LINK_GENERATED',
        },
      );
    if (userId) qb.andWhere('reservation.userId = :userId', { userId });
    return qb.getCount();
  }

  save(data: Partial<PromotionalOfferReservationEntity>, manager: EntityManager): Promise<PromotionalOfferReservationEntity> {
    const repository = manager.getRepository(PromotionalOfferReservationEntity);
    return repository.save(repository.create(data));
  }

  async consumeByPaymentRequest(paymentRequestId: string, orderId: string, manager: EntityManager): Promise<void> {
    await manager.getRepository(PromotionalOfferReservationEntity).update(
      { paymentRequestId, status: PromotionalOfferReservationStatus.RESERVED },
      { status: PromotionalOfferReservationStatus.CONSUMED, orderId },
    );
    await manager.getRepository(PromotionalOfferReservationEntity).update(
      { paymentRequestId, status: PromotionalOfferReservationStatus.RELEASED },
      { status: PromotionalOfferReservationStatus.CONSUMED, orderId },
    );
  }

  async releaseByPaymentRequest(paymentRequestId: string, manager?: EntityManager): Promise<void> {
    const repository = manager ? manager.getRepository(PromotionalOfferReservationEntity) : this.repo;
    await repository.update(
      { paymentRequestId, status: PromotionalOfferReservationStatus.RESERVED },
      { status: PromotionalOfferReservationStatus.RELEASED },
    );
  }

  countByOffer(offerId: string, manager?: EntityManager): Promise<number> {
    const repository = manager ? manager.getRepository(PromotionalOfferReservationEntity) : this.repo;
    return repository.count({ where: { offerId } });
  }
}
