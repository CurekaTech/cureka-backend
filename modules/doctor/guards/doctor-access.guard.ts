import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DoctorsRepository } from '../repositories/doctors.repository';
import { DoctorLegalDocumentsService } from '../services/doctor-legal-documents.service';
import { SKIP_DOCTOR_ACCESS_CHECKS_KEY } from '../decorators/skip-doctor-access-checks.decorator';
import { IDoctorJwtPayload } from '../interfaces/doctor-jwt-payload.interface';

@Injectable()
export class DoctorAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly doctorsRepository: DoctorsRepository,
    private readonly legalDocumentsService: DoctorLegalDocumentsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_DOCTOR_ACCESS_CHECKS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    const request = context.switchToHttp().getRequest<{ user?: IDoctorJwtPayload }>();
    const user = request.user;
    if (!user?.sub) return true;

    const doctor = await this.doctorsRepository.findById(user.sub);
    if (!doctor) {
      throw new ForbiddenException('Doctor account not found');
    }

    if (doctor.mustChangePassword) {
      throw new ForbiddenException({
        code: 'MUST_CHANGE_PASSWORD',
        message: 'Password change required before continuing',
      });
    }

    const pending = await this.legalDocumentsService.pendingLegalAcceptances(doctor.id);
    if (pending.length > 0) {
      throw new ForbiddenException({
        code: 'LEGAL_ACCEPTANCE_REQUIRED',
        message: 'Accept updated legal documents to continue',
        pendingDocuments: pending,
      });
    }

    return true;
  }
}
