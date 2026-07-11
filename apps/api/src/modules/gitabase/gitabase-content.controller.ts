import {
  Controller,
  Get,
  Param,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { createReadStream } from 'node:fs';
import { AuthGuard } from '../auth/auth.guard';
import { GitabaseContentService } from './gitabase-content.service';

@Controller('gitabase')
@UseGuards(AuthGuard)
export class GitabaseContentController {
  constructor(private readonly content: GitabaseContentService) {}

  @Get('library')
  getLibrary(@Res({ passthrough: true }) response: Response) {
    response.setHeader('Cache-Control', 'no-cache');
    return this.content.getLibraryManifest();
  }

  @Get('books/:bookSlug/manifest')
  getBookManifest(
    @Param('bookSlug') bookSlug: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-cache');
    return this.content.getBookManifest(bookSlug);
  }

  @Get('content/:bookSlug/:version/*path')
  async getContent(
    @Param('bookSlug') bookSlug: string,
    @Param('version') version: string,
    @Param('path') requestPath: string | string[],
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const file = await this.content.resolveContentFile(
      bookSlug,
      version,
      requestPath,
    );
    response.setHeader('Content-Length', file.bytes.toString());
    response.setHeader('ETag', file.etag);
    response.setHeader('Cache-Control', 'private, max-age=31536000, immutable');

    return new StreamableFile(createReadStream(file.absolutePath), {
      type: file.contentType,
      length: file.bytes,
    });
  }
}
