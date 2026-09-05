import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CommunitiesModule } from '../communities/communities.module';
import { LibraryAdminController } from './library-admin.controller';
import { LibrarySectionRequestsController } from './library-section-requests.controller';
import { LibrarySectionRequestsService } from './library-section-requests.service';
import { LibraryAdminService } from './library-admin.service';
import { LibraryCategoriesController } from './library-categories.controller';
import { LibraryCategoriesService } from './library-categories.service';
import { LibraryBookmarksService } from './library-bookmarks.service';
import { LibraryCommentsService } from './library-comments.service';
import {
  LibraryCommentsController,
  LibraryEntriesController,
} from './library-entries.controller';
import { LibraryEntriesService } from './library-entries.service';
import { LibraryPreferencesController } from './library-preferences.controller';
import { LibraryPreferencesService } from './library-preferences.service';
import { LibraryPreviewsService } from './library-previews.service';

@Module({
  // CommunitiesModule — портальная инфраструктура, разрешённая контрактом:
  // материал можно выложить от имени общины, и право на это спрашивается у
  // владельца справочника, а не проверяется копией правил внутри сервиса.
  imports: [AuthModule, CommunitiesModule],
  controllers: [
    LibraryCategoriesController,
    LibraryEntriesController,
    LibraryCommentsController,
    LibraryPreferencesController,
    LibraryAdminController,
    LibrarySectionRequestsController,
  ],
  providers: [
    LibraryCategoriesService,
    LibraryEntriesService,
    LibraryPreferencesService,
    LibraryPreviewsService,
    LibraryBookmarksService,
    LibraryCommentsService,
    LibraryAdminService,
    LibrarySectionRequestsService,
  ],
})
export class LibraryModule {}
