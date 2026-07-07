import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UnionChatController } from './union-chat.controller';
import { UnionChatService } from './union-chat.service';
import { UnionConnectionController } from './union-connection.controller';
import { UnionConnectionService } from './union-connection.service';
import { UnionMatchingService } from './union-matching.service';
import { UnionProfileController } from './union-profile.controller';
import { UnionProfileService } from './union-profile.service';
import { UnionRecommendationsController } from './union-recommendations.controller';

@Module({
  imports: [AuthModule],
  controllers: [
    UnionProfileController,
    UnionRecommendationsController,
    UnionConnectionController,
    UnionChatController,
  ],
  providers: [
    UnionProfileService,
    UnionMatchingService,
    UnionConnectionService,
    UnionChatService,
  ],
})
export class UnionModule {}
