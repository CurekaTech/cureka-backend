import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { ResponseMessage } from '@packages/common';
import { isDoctorConsultationModuleEnabled } from '../utils/doctor-consultation-module.util';

@ApiTags('Public Doctor Consultation Config')
@Controller('public/doctor-consultation')
export class PublicDoctorConsultationConfigController {
  constructor(private readonly configService: ConfigService) {}

  /** Always available — frontends use this to show/hide doctor & consultation UI. */
  @ResponseMessage('Doctor consultation module config retrieved successfully')
  @Get('config')
  getConfig(): { enabled: boolean } {
    return {
      enabled: isDoctorConsultationModuleEnabled(this.configService),
    };
  }
}
