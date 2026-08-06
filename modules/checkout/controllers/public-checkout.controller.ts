import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ResponseMessage } from '@packages/common';
import { CheckoutResolverService } from '../services/checkout-resolver.service';

@ApiTags('Public Checkout')
@Controller('public/checkout')
export class PublicCheckoutController {
  constructor(private readonly checkoutResolver: CheckoutResolverService) {}

  @ApiOperation({
    summary: 'Resolve active checkout provider by admin priority',
    description:
      'Priority: gokwik > shiprocket > legacy. Returns the current provider based on active admin settings.',
  })
  @ResponseMessage('Checkout provider resolved successfully')
  @Get('provider')
  @HttpCode(HttpStatus.OK)
  async getProvider() {
    const checkoutProvider = await this.checkoutResolver.resolveProvider();
    return {
      checkoutProvider,
      gateway: checkoutProvider,
    };
  }
}
