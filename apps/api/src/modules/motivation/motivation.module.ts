import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { VedabaseModule } from '../vedabase/vedabase.module';
import { MotivationController } from './motivation.controller';
import { MotivationGenerationService } from './motivation-generation.service';
import { MotivationService } from './motivation.service';
import { MotivationWorkerService } from './motivation-worker.service';
import { QuoteVerificationService } from './quote-verification.service';
import { ApprovedWebSourceService } from './approved-web-source.service';
import { QuoteDiscoveryService } from './quote-discovery.service';
import { MotivationCopyService } from './motivation-copy.service';
import { MotivationModerationService } from './motivation-moderation.service';
import { MotivationAuthorSearchService } from './motivation-author-search.service';
import { MotivationSourceFetchService } from './motivation-source-fetch.service';

@Module({
  imports: [AuthModule, VedabaseModule],
  controllers: [MotivationController],
  providers: [
    MotivationService,
    MotivationGenerationService,
    MotivationWorkerService,
    QuoteVerificationService,
    ApprovedWebSourceService,
    QuoteDiscoveryService,
    MotivationCopyService,
    MotivationModerationService,
    MotivationAuthorSearchService,
    MotivationSourceFetchService,
  ],
  exports: [MotivationService, QuoteVerificationService, QuoteDiscoveryService, MotivationCopyService, MotivationModerationService],
})
export class MotivationModule {}
