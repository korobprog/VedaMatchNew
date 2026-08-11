import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
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
import { LibrarySectionsController } from './library-sections.controller';
import { LibrarySectionsService } from './library-sections.service';

@Module({
  imports: [AuthModule],
  controllers: [
    LibrarySectionsController,
    LibraryCategoriesController,
    LibraryEntriesController,
    LibraryCommentsController,
    LibraryPreferencesController,
  ],
  providers: [
    LibrarySectionsService,
    LibraryCategoriesService,
    LibraryEntriesService,
    LibraryPreferencesService,
    LibraryPreviewsService,
    LibraryBookmarksService,
    LibraryCommentsService,
  ],
})
export class LibraryModule {}
