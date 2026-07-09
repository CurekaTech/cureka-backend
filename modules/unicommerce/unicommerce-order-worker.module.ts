import { Module } from '@nestjs/common';
import { UnicommerceOrderModule } from './unicommerce-order.module';
import { UnicommerceOrderProcessor } from './processors/unicommerce-order.processor';

@Module({
  imports: [UnicommerceOrderModule],
  providers: [UnicommerceOrderProcessor],
})
export class UnicommerceOrderWorkerModule {}
