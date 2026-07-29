import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { LibrarySectionsService } from './library-sections.service';

@Controller('library/sections')
@UseGuards(AuthGuard)
export class LibrarySectionsController {
  constructor(private readonly sections: LibrarySectionsService) {}

  @Get()
  list() {
    return this.sections.list();
  }
}
