import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import {
  AdminChangelogController,
  ChangelogController,
} from './changelog.controller';
import { ChangelogService } from './changelog.service';

@Module({
  imports: [AuthModule],
  controllers: [ChangelogController, AdminChangelogController],
  providers: [ChangelogService],
})
export class ChangelogModule {}
