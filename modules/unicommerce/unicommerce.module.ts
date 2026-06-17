import { Module } from '@nestjs/common';
import { UnicommerceAuthController } from './controllers/unicommerce-auth.controller';
import { UnicommerceAuthService } from './services/unicommerce-auth.service';

@Module({
  controllers: [UnicommerceAuthController],
  providers: [UnicommerceAuthService],
})
export class UnicommerceModule {}
