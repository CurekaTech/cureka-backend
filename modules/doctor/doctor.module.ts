import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConsultationEntity } from '@modules/consultation/entities/consultation.entity';
import { AdminDoctorLegalDocumentsController } from './controllers/admin-doctor-legal-documents.controller';
import { AdminDoctorMastersController } from './controllers/admin-doctor-masters.controller';
import { AdminDoctorsController } from './controllers/admin-doctors.controller';
import { DoctorEarningsController } from './controllers/doctor-earnings.controller';
import { DoctorAuthController } from './controllers/doctor-auth.controller';
import { PublicDoctorConsultationConfigController } from './controllers/public-doctor-consultation-config.controller';
import { PublicDoctorsController } from './controllers/public-doctors.controller';
import { DoctorAvailabilityEntity } from './entities/doctor-availability.entity';
import { DoctorBankDetailsEntity } from './entities/doctor-bank-details.entity';
import { DoctorClinicAssociationEntity } from './entities/doctor-clinic-association.entity';
import { DoctorConsultationConfigEntity } from './entities/doctor-consultation-config.entity';
import { DoctorDocumentEntity } from './entities/doctor-document.entity';
import { DoctorLanguageMapEntity } from './entities/doctor-language-map.entity';
import { DoctorLegalDocumentAcceptanceEntity } from './entities/doctor-legal-document-acceptance.entity';
import { DoctorLegalDocumentVersionEntity } from './entities/doctor-legal-document-version.entity';
import { DoctorLegalDocumentEntity } from './entities/doctor-legal-document.entity';
import { DoctorQualificationMapEntity } from './entities/doctor-qualification-map.entity';
import { DoctorSessionEntity } from './entities/doctor-session.entity';
import { DoctorSlotEntity } from './entities/doctor-slot.entity';
import { DoctorSpecializationMapEntity } from './entities/doctor-specialization-map.entity';
import { DoctorEntity } from './entities/doctor.entity';
import { LanguageEntity } from './entities/language.entity';
import { QualificationEntity } from './entities/qualification.entity';
import { SpecializationEntity } from './entities/specialization.entity';
import { DoctorAccessGuard } from './guards/doctor-access.guard';
import { DoctorConsultationModuleEnabledGuard } from './guards/doctor-consultation-module-enabled.guard';
import { DoctorJwtAuthGuard } from './guards/doctor-jwt-auth.guard';
import { DoctorSessionsRepository } from './repositories/doctor-sessions.repository';
import { DoctorsRepository } from './repositories/doctors.repository';
import { LanguagesRepository } from './repositories/languages.repository';
import { QualificationsRepository } from './repositories/qualifications.repository';
import { SpecializationsRepository } from './repositories/specializations.repository';
import { DoctorAuthService } from './services/doctor-auth.service';
import { DoctorLegalDocumentsService } from './services/doctor-legal-documents.service';
import { DoctorMastersService } from './services/doctor-masters.service';
import { DoctorEarningsService } from './services/doctor-earnings.service';
import { DoctorSlotsService } from './services/doctor-slots.service';
import { DoctorsService } from './services/doctors.service';
import { DoctorJwtStrategy } from './strategies/doctor-jwt.strategy';

const DOCTOR_ENTITIES = [
  DoctorEntity,
  DoctorSessionEntity,
  DoctorBankDetailsEntity,
  DoctorClinicAssociationEntity,
  DoctorConsultationConfigEntity,
  DoctorAvailabilityEntity,
  DoctorSlotEntity,
  DoctorDocumentEntity,
  DoctorQualificationMapEntity,
  DoctorSpecializationMapEntity,
  DoctorLanguageMapEntity,
  DoctorLegalDocumentEntity,
  DoctorLegalDocumentVersionEntity,
  DoctorLegalDocumentAcceptanceEntity,
  SpecializationEntity,
  LanguageEntity,
  QualificationEntity,
];

@Module({
  imports: [TypeOrmModule.forFeature([...DOCTOR_ENTITIES, ConsultationEntity])],
  controllers: [
    PublicDoctorConsultationConfigController,
    AdminDoctorMastersController,
    AdminDoctorsController,
    AdminDoctorLegalDocumentsController,
    DoctorAuthController,
    DoctorEarningsController,
    PublicDoctorsController,
  ],
  providers: [
    DoctorsRepository,
    DoctorSessionsRepository,
    SpecializationsRepository,
    LanguagesRepository,
    QualificationsRepository,
    DoctorsService,
    DoctorAuthService,
    DoctorLegalDocumentsService,
    DoctorMastersService,
    DoctorSlotsService,
    DoctorEarningsService,
    DoctorJwtStrategy,
    DoctorJwtAuthGuard,
    DoctorAccessGuard,
    DoctorConsultationModuleEnabledGuard,
  ],
  exports: [
    DoctorsService,
    DoctorSlotsService,
    DoctorLegalDocumentsService,
    DoctorsRepository,
    DoctorConsultationModuleEnabledGuard,
  ],
})
export class DoctorModule {}
