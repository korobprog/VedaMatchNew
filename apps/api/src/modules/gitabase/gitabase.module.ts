import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GitabaseContentController } from './gitabase-content.controller';
import { GitabaseContentService } from './gitabase-content.service';
import { GitabaseSyncController } from './gitabase-sync.controller';
import { GitabaseSyncService } from './gitabase-sync.service';
import { GitabaseUserStateService } from './gitabase-user-state.service';

@Module({
  imports: [AuthModule],
  controllers: [GitabaseContentController, GitabaseSyncController],
  providers: [
    GitabaseContentService,
    GitabaseSyncService,
    GitabaseUserStateService,
  ],
})
export class GitabaseModule {}
