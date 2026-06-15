import { Module } from '@nestjs/common';
import { MasterModule } from '@modules/master/master.module';
import { HomepageController } from './controllers/homepage.controller';
import { HomepageService } from './services/homepage.service';

@Module({
  imports: [MasterModule],
  controllers: [HomepageController],
  providers: [HomepageService],
})
export class PublicModule {}
