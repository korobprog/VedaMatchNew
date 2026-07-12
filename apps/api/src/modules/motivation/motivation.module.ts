import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MotivationController } from './motivation.controller';
import { MotivationGenerationService } from './motivation-generation.service';
import { MotivationService } from './motivation.service';
import { MotivationWorkerService } from './motivation-worker.service';

@Module({ imports: [AuthModule], controllers: [MotivationController], providers: [MotivationService, MotivationGenerationService, MotivationWorkerService], exports: [MotivationService] })
export class MotivationModule {}
