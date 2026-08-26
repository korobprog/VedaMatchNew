import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { ModerationModule } from '../moderation/moderation.module';
import { MotivationModule } from '../motivation/motivation.module';
import { UnionAdminController } from './union-admin.controller';
import { UnionAdminService } from './union-admin.service';
import { UnionArchiveController } from './union-archive.controller';
import { UnionArchiveService } from './union-archive.service';
import { UnionFavoritesController } from './union-favorites.controller';
import { UnionFavoritesService } from './union-favorites.service';
import { UnionBoostController } from './union-boost.controller';
import { UnionBoostService } from './union-boost.service';
import { UnionConnectionController } from './union-connection.controller';
import { UnionConnectionService } from './union-connection.service';
import { UnionMatchingService } from './union-matching.service';
import { UnionProfileController } from './union-profile.controller';
import { UnionProfileService } from './union-profile.service';
import { UnionRecommendationsController } from './union-recommendations.controller';
import { UnionShowcaseController } from './union-showcase.controller';
import { UnionShowcaseService } from './union-showcase.service';
import { UnionSwipeController } from './union-swipe.controller';
import { UnionSwipeService } from './union-swipe.service';

@Module({
  imports: [AuthModule, UsersModule, ModerationModule, MotivationModule],
  controllers: [
    UnionProfileController,
    UnionRecommendationsController,
    UnionConnectionController,
    UnionSwipeController,
    UnionBoostController,
    UnionAdminController,
    UnionArchiveController,
    UnionFavoritesController,
    UnionShowcaseController,
  ],
  providers: [
    UnionProfileService,
    UnionMatchingService,
    UnionConnectionService,
    UnionSwipeService,
    UnionBoostService,
    UnionAdminService,
    UnionArchiveService,
    UnionFavoritesService,
    UnionShowcaseService,
  ],
})
export class UnionModule {}
