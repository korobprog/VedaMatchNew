import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { VedabaseModule } from '../vedabase/vedabase.module';
import { MotivationController } from './motivation.controller';
import { MotivationGenerationService } from './motivation-generation.service';
import { MotivationService } from './motivation.service';
import { MotivationWorkerService } from './motivation-worker.service';
import { QuoteVerificationService } from './quote-verification.service';

@Module({ imports: [AuthModule, VedabaseModule], controllers: [MotivationController], providers: [MotivationService, MotivationGenerationService, MotivationWorkerService, QuoteVerificationService], exports: [MotivationService, QuoteVerificationService] })
export class MotivationModule {}
