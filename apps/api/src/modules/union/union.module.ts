import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UnionMatchingService } from './union-matching.service';
import { UnionProfileController } from './union-profile.controller';
import { UnionProfileService } from './union-profile.service';
import { UnionRecommendationsController } from './union-recommendations.controller';

@Module({
  imports: [AuthModule],
  controllers: [UnionProfileController, UnionRecommendationsController],
  providers: [UnionProfileService, UnionMatchingService],
})
export class UnionModule {}
