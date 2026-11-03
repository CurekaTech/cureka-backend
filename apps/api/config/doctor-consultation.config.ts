import { registerAs } from '@nestjs/config';

const asBool = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined || value === '') return fallback;
  return value.toLowerCase() === 'true';
};

/**
 * Doctor + Consultation module kill-switch.
 * Default false — Admin Doctors menu, Doctor Panel APIs, and storefront
 * discovery/booking stay hidden until explicitly enabled.
 */
export const doctorConsultationConfig = registerAs('doctorConsultation', () => ({
  moduleEnabled: asBool(process.env['DOCTOR_CONSULTATION_MODULE_ENABLED'], false),
}));
