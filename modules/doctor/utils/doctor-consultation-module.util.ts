import { ConfigService } from '@nestjs/config';

/**
 * Temporary: hide Doctors from the admin sidebar even if
 * DOCTOR_CONSULTATION_MODULE_ENABLED=true. Set to false to restore the menu.
 */
export const HIDE_DOCTORS_FROM_ADMIN_MENU = true;

/** True only when DOCTOR_CONSULTATION_MODULE_ENABLED=true. Unset stays off. */
export const isDoctorConsultationModuleEnabled = (
  configService: ConfigService,
): boolean => configService.get<boolean>('doctorConsultation.moduleEnabled') === true;
