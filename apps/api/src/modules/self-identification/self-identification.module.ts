import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SelfIdentificationController } from './self-identification.controller';
import { SelfIdentificationService } from './self-identification.service';

@Module({
  imports: [AuthModule],
  controllers: [SelfIdentificationController],
  providers: [SelfIdentificationService],
})
export class SelfIdentificationModule {}
