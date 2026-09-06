import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { VedabaseModule } from '../vedabase/vedabase.module';
import { MotivationAdminController } from './motivation-admin.controller';
import { MotivationHealthService } from './motivation-health.service';
import { MotivationAssistantListener } from './motivation-assistant.listener';
import { MotivationController } from './motivation.controller';
import { MotivationGenerationService } from './motivation-generation.service';
import { MotivationService } from './motivation.service';
import { MotivationWorkerService } from './motivation-worker.service';
import { QuoteVerificationService } from './quote-verification.service';
import { ApprovedWebSourceService } from './approved-web-source.service';
import { QuoteDiscoveryService } from './quote-discovery.service';
import { MotivationBooksService } from './motivation-books.service';
import { MotivationCategoriesService } from './motivation-categories.service';
import { MotivationCopyService } from './motivation-copy.service';
import { MotivationManualPostService } from './motivation-manual-post.service';
import { MotivationStoryRebuildService } from './motivation-story-rebuild.service';
import { MotivationModerationService } from './motivation-moderation.service';
import { MotivationAuthorSearchService } from './motivation-author-search.service';
import { MotivationSourceFetchService } from './motivation-source-fetch.service';
import { FalImageService } from './fal-image.service';
import { FalVideoService } from './fal-video.service';
import { FalAudioService } from './fal-audio.service';
import { MotivationSettingsService } from './motivation-settings.service';
import { MotivationMusicService } from './motivation-music.service';
import { MotivationVideoWorkerService } from './motivation-video-worker.service';
import { MotivationReelsService } from './motivation-reels.service';
import { MotivationAdminReelsService } from './motivation-admin-reels.service';
import { MotivationPostcardsService } from './motivation-postcards.service';
import { MotivationAnalyticsService } from './motivation-analytics.service';

@Module({
  imports: [AuthModule, VedabaseModule],
  controllers: [MotivationController, MotivationAdminController],
  providers: [
    MotivationService,
    MotivationGenerationService,
    MotivationWorkerService,
    QuoteVerificationService,
    ApprovedWebSourceService,
    QuoteDiscoveryService,
    MotivationBooksService,
    MotivationCategoriesService,
    MotivationCopyService,
    MotivationManualPostService,
    MotivationStoryRebuildService,
    MotivationModerationService,
    MotivationReelsService,
    MotivationAdminReelsService,
    MotivationPostcardsService,
    MotivationAnalyticsService,
    MotivationAuthorSearchService,
    MotivationSourceFetchService,
    FalImageService,
    FalVideoService,
    FalAudioService,
    MotivationSettingsService,
    MotivationMusicService,
    MotivationVideoWorkerService,
    MotivationHealthService,
    MotivationAssistantListener,
  ],

  exports: [
    MotivationService,
    MotivationGenerationService,
    QuoteVerificationService,
    QuoteDiscoveryService,
    MotivationCategoriesService,
    MotivationCopyService,
    MotivationModerationService,
  ],
})
export class MotivationModule {}
