import { Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FastifyReply, FastifyRequest } from 'fastify';
import { RawResponse, ResponseMessage } from '@packages/common';
import { VendorSource } from '../enums/vendor-source.enum';
import { VendorsService } from '../services/vendors.service';

@ApiTags('Public Vendors')
@Controller('public/vendors')
export class PublicVendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  @ApiOperation({
    summary: 'Download sample product Excel sheet for vendor onboarding',
    description:
      'Returns the same XLSX template used by admin product bulk upload. ' +
      'Wire a button: GET this URL (or window.location / <a download>).',
  })
  @RawResponse()
  @Get('product-sample-sheet')
  async downloadProductSampleSheet(@Res() reply: FastifyReply) {
    const { fileName, fileBuffer } = await this.vendorsService.getProductSampleSheet();
    return reply
      .code(200)
      .header(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      )
      .header('Content-Disposition', `attachment; filename="${fileName}"`)
      .send(fileBuffer);
  }

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
