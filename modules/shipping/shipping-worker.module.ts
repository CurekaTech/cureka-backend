import { Module } from '@nestjs/common';
import { ShippingModule } from './shipping.module';
import { ShippingProcessor } from './processors/shipping.processor';

@Module({
  imports: [ShippingModule],
  providers: [ShippingProcessor],
})
export class ShippingWorkerModule {}
