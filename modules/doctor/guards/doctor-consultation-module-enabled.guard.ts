import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isDoctorConsultationModuleEnabled } from '../utils/doctor-consultation-module.util';

/** Hides doctor/consultation APIs unless DOCTOR_CONSULTATION_MODULE_ENABLED=true. */
@Injectable()
export class DoctorConsultationModuleEnabledGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(): boolean {
    if (!isDoctorConsultationModuleEnabled(this.configService)) {
      throw new NotFoundException();
    }
    return true;
  }
}
