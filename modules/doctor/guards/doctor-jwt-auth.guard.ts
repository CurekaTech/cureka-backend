import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class DoctorJwtAuthGuard extends AuthGuard('doctor-jwt') {}
