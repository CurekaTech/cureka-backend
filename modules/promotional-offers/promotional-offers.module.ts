import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MasterModule } from '@modules/master/master.module';
import { AdminPromotionalOffersController } from './controllers/admin-promotional-offers.controller';
import { PromotionalOfferReservationEntity } from './entities/promotional-offer-reservation.entity';
import { PromotionalOfferTargetEntity } from './entities/promotional-offer-target.entity';
import { PromotionalOfferEntity } from './entities/promotional-offer.entity';
import { PromotionalOffersEnabledGuard } from './guards/promotional-offers-enabled.guard';
import { PromotionalOfferReservationsRepository } from './repositories/promotional-offer-reservations.repository';
import { PromotionalOffersRepository } from './repositories/promotional-offers.repository';
import { PromotionalOfferEvaluationService } from './services/promotional-offer-evaluation.service';
import { PromotionalOfferReservationService } from './services/promotional-offer-reservation.service';
import { PromotionalOffersService } from './services/promotional-offers.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PromotionalOfferEntity,
      PromotionalOfferTargetEntity,
      PromotionalOfferReservationEntity,
    ]),
    MasterModule,
  ],
  controllers: [AdminPromotionalOffersController],
  providers: [
    PromotionalOffersRepository,
    PromotionalOfferReservationsRepository,
    PromotionalOffersService,
    PromotionalOfferEvaluationService,
    PromotionalOfferReservationService,
    PromotionalOffersEnabledGuard,
  ],
  exports: [
    PromotionalOfferEvaluationService,
    PromotionalOfferReservationService,
    PromotionalOffersEnabledGuard,
  ],
})
export class PromotionalOffersModule {}
