import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LibraryCategoriesController } from './library-categories.controller';
import { LibraryCategoriesService } from './library-categories.service';
import { LibrarySectionsController } from './library-sections.controller';
import { LibrarySectionsService } from './library-sections.service';

@Module({
  imports: [AuthModule],
  controllers: [LibrarySectionsController, LibraryCategoriesController],
  providers: [LibrarySectionsService, LibraryCategoriesService],
})
export class LibraryModule {}
