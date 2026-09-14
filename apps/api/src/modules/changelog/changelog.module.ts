import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import {
  AdminChangelogController,
  ChangelogController,
} from './changelog.controller';
import { AnnouncementImagesService } from './announcement-images.service';
import { ChangelogService } from './changelog.service';

@Module({
  imports: [AuthModule],
  controllers: [ChangelogController, AdminChangelogController],
  providers: [ChangelogService, AnnouncementImagesService],
})
export class ChangelogModule {}
