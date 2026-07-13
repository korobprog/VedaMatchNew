import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GitabaseSyncController } from '../gitabase/gitabase-sync.controller';
import { GitabaseSyncService } from '../gitabase/gitabase-sync.service';
import { GitabaseUserStateService } from '../gitabase/gitabase-user-state.service';
import { VedabaseContentController } from './vedabase-content.controller';
import { VedabaseContentRepository } from './vedabase-content.repository';
import { VedabaseContentService } from './vedabase-content.service';

@Module({
  imports: [AuthModule],
  controllers: [VedabaseContentController, GitabaseSyncController],
  providers: [VedabaseContentRepository, VedabaseContentService, GitabaseSyncService, GitabaseUserStateService],
  exports: [VedabaseContentRepository],
})
export class VedabaseModule {}
