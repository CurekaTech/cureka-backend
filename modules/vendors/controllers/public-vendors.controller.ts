import { Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FastifyRequest } from 'fastify';
import { ResponseMessage } from '@packages/common';
import { VendorSource } from '../enums/vendor-source.enum';
import { VendorsService } from '../services/vendors.service';

@ApiTags('Public Vendors')
@Controller('public/vendors')
export class PublicVendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  @ApiOperation({ summary: 'Public vendor onboarding registration (multipart form-data)' })
  @ResponseMessage('Vendor registration submitted successfully')
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(@Req() req: FastifyRequest) {
    const contentType = req.headers['content-type'] ?? '';
    if (contentType.includes('multipart/form-data')) {
      return this.vendorsService.registerFromRequest(req, VendorSource.PUBLIC);
    }
    return this.vendorsService.registerFromJson(req.body, VendorSource.PUBLIC);
  }
}
