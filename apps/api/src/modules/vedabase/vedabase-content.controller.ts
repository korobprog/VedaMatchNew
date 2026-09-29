import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { VedabaseContentService } from './vedabase-content.service';
import { VedabaseFilesService } from './vedabase-files.service';

@Controller('vedabase')
@UseGuards(AuthGuard)
export class VedabaseContentController {
  constructor(
    private readonly content: VedabaseContentService,
    private readonly files: VedabaseFilesService,
  ) {}
  @Get('library') getLibrary() {
    return this.content.getLibrary();
  }
  @Get('books/:bookSlug') getBook(@Param('bookSlug') slug: string) {
    return this.content.getBook(slug);
  }
  @Get('books/:bookSlug/chapters/:chapterSlug')
  async getChapter(
    @Param('bookSlug') bookSlug: string,
    @Param('chapterSlug') chapterSlug: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.content.getChapter(bookSlug, chapterSlug);
    response.setHeader('ETag', `"${result.sha256}"`);
    response.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    return result.chapter;
  }
  /** Файлы книги для скачивания: epub, fb2, pdf (VED-662). */
  @Get('books/:bookSlug/files') getFiles(@Param('bookSlug') slug: string) {
    return this.files.forBook(slug, { includeBlocked: false });
  }
  @Get('books/:bookSlug/search-index') getSearchIndex(
    @Param('bookSlug') slug: string,
  ) {
    return this.content.getSearchIndex(slug);
  }
  @Get('search') search(
    @Query('q') query: string,
    @Query('limit') limit?: string,
  ) {
    return this.content.search(query, limit);
  }
}
