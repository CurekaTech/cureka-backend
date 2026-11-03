import { ConfigService } from '@nestjs/config';

/** True only when DOCTOR_CONSULTATION_MODULE_ENABLED=true. Unset stays off. */
export const isDoctorConsultationModuleEnabled = (
  configService: ConfigService,
): boolean => configService.get<boolean>('doctorConsultation.moduleEnabled') === true;
