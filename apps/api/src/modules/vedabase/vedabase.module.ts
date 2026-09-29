import { Module } from '@nestjs/common';
import { VedabaseAssistantListener } from './vedabase-assistant.listener';
import { AuthModule } from '../auth/auth.module';
import { GitabaseSyncController } from '../gitabase/gitabase-sync.controller';
import { GitabaseSyncService } from '../gitabase/gitabase-sync.service';
import { GitabaseUserStateService } from '../gitabase/gitabase-user-state.service';
import { VedabaseAdminController } from './vedabase-admin.controller';
import { VedabaseAdminService } from './vedabase-admin.service';
import { VedabaseContentController } from './vedabase-content.controller';
import { VedabaseContentRepository } from './vedabase-content.repository';
import { VedabaseContentService } from './vedabase-content.service';

@Module({
  imports: [AuthModule],
  controllers: [
    VedabaseContentController,
    VedabaseAdminController,
    GitabaseSyncController,
  ],
  providers: [
    VedabaseContentRepository,
    VedabaseContentService,
    VedabaseAdminService,
    GitabaseSyncService,
    GitabaseUserStateService,
    VedabaseAssistantListener,
  ],
  exports: [VedabaseContentRepository],
})
export class VedabaseModule {}
