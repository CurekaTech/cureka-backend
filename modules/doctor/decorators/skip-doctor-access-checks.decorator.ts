import { SetMetadata } from '@nestjs/common';

export const SKIP_DOCTOR_ACCESS_CHECKS_KEY = 'skipDoctorAccessChecks';

/** Routes that bypass must-change-password and pending legal acceptance checks. */
export const SkipDoctorAccessChecks = () => SetMetadata(SKIP_DOCTOR_ACCESS_CHECKS_KEY, true);
