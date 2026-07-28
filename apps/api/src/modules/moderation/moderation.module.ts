import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import {
  AdminModerationController,
  ModerationController,
} from './moderation.controller';
import { ModerationService } from './moderation.service';

@Module({
  imports: [AuthModule],
  controllers: [ModerationController, AdminModerationController],
  providers: [ModerationService],
  exports: [ModerationService],
})
export class ModerationModule {}
