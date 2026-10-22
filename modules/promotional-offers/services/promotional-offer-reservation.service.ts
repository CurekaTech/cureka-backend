import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EntityManager } from 'typeorm';
import { generateUniqueRefId } from '@packages/common';
import { toMoneyString } from '@modules/orders/utils/money.util';
import { PromotionalOfferReservationEntity } from '../entities/promotional-offer-reservation.entity';
import { PromotionalOfferReservationStatus } from '../enums/promotional-offer-reservation-status.enum';
import { PromotionalOfferReservationsRepository } from '../repositories/promotional-offer-reservations.repository';
import { PromotionalOffersRepository } from '../repositories/promotional-offers.repository';

export type PromotionHold = {
  offerId: string;
  discountAmount: number;
};

@Injectable()
export class PromotionalOfferReservationService {
  constructor(
    private readonly offersRepository: PromotionalOffersRepository,
    private readonly reservationsRepository: PromotionalOfferReservationsRepository,
    private readonly configService: ConfigService,
  ) {}

  async filterReservable(
    manager: EntityManager,
    userId: string,
    holds: PromotionHold[],
  ): Promise<{ accepted: PromotionHold[]; rejectedOfferIds: string[] }> {
    const accepted: PromotionHold[] = [];
    const rejectedOfferIds: string[] = [];
    for (const hold of holds) {
      const offer = await this.offersRepository.findByIdForUpdate(hold.offerId, manager);
      if (!offer) {
        rejectedOfferIds.push(hold.offerId);
        continue;
      }
      const [globalCount, userCount] = await Promise.all([
        this.reservationsRepository.countActive(offer.id, undefined, manager),
        this.reservationsRepository.countActive(offer.id, userId, manager),
      ]);
      const globalOk = offer.usageLimit === null || globalCount < offer.usageLimit;
      const userOk = offer.sameUserLimit === null || userCount < offer.sameUserLimit;
      if (!globalOk || !userOk) rejectedOfferIds.push(hold.offerId);
      else accepted.push(hold);
    }
    return { accepted, rejectedOfferIds };
  }

  async insertReservations(
    manager: EntityManager,
    params: {
      userId: string;
      paymentRequestId?: string | null;
      orderId?: string | null;
      holds: PromotionHold[];
      status: PromotionalOfferReservationStatus;
      expiresAt?: Date | null;
    },
  ): Promise<void> {
    const repository = manager.getRepository(PromotionalOfferReservationEntity);
    for (const hold of params.holds) {
      const refId = await generateUniqueRefId('PR', async (candidate) => {
        const existing = await repository.findOne({ where: { refId: candidate } });
        return Boolean(existing);
      });
      await this.reservationsRepository.save(
        {
          refId,
          offerId: hold.offerId,
          userId: params.userId,
          paymentRequestId: params.paymentRequestId ?? null,
          orderId: params.orderId ?? null,
          status: params.status,
          discountAmount: toMoneyString(hold.discountAmount),
          expiresAt: params.expiresAt ?? null,
          idempotencyKey: `promo:${params.paymentRequestId ?? params.orderId}:${hold.offerId}`,
          createdBy: params.userId,
          updatedBy: params.userId,
        },
        manager,
      );
    }
  }

  defaultExpiry(): Date {
    const minutes = this.configService.get<number>('wallet.reservationTtlMinutes') ?? 60;
    return new Date(Date.now() + minutes * 60_000);
  }

  consumeByPaymentRequest(paymentRequestId: string, orderId: string, manager: EntityManager): Promise<void> {
    return this.reservationsRepository.consumeByPaymentRequest(paymentRequestId, orderId, manager);
  }

  releaseByPaymentRequest(paymentRequestId: string, manager?: EntityManager): Promise<void> {
    return this.reservationsRepository.releaseByPaymentRequest(paymentRequestId, manager);
  }
}
