import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LibrarySectionsController } from './library-sections.controller';
import { LibrarySectionsService } from './library-sections.service';

@Module({
  imports: [AuthModule],
  controllers: [LibrarySectionsController],
  providers: [LibrarySectionsService],
})
export class LibraryModule {}
