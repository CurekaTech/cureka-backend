import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ResponseMessage } from '@packages/common';
import { PincodesService } from '../services/pincodes.service';

@ApiTags('Public Pincodes')
@Controller('public/pincodes')
export class PublicPincodesController {
  constructor(private readonly pincodesService: PincodesService) {}

  @ApiOperation({ summary: 'Validate a shopper-selected Indian pincode' })
  @ResponseMessage('Pincode retrieved successfully')
  @Get(':pincode')
  findOne(@Param('pincode') pincode: string) {
    return this.pincodesService.findPublicByCode(pincode);
  }
}
