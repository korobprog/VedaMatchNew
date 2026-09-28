import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { AccessTokenPayload } from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { isAdmin } from './is-admin';
import { parseArticleInput, parseCategoryInput, parsePage } from './knowledge';
import { WellnessInputError } from './wellness-dto';
import {
  MAX_UPLOAD_BYTES,
  type UploadedImageFile,
} from './wellness-images.service';
import { WellnessKnowledgeService } from './wellness-knowledge.service';

function parsed<T>(parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    if (error instanceof WellnessInputError) {
      throw new BadRequestException(error.message);
    }
    throw error;
  }
}

/**
 * Раздел «Знания» сервиса «Здоровье» (VED-229). Читать может любой
 * вошедший, писать — только администраторы сервиса (`adminServices`
 * с `wellness` или роль admin).
 */
@Controller('wellness/knowledge')
@UseGuards(AuthGuard)
export class WellnessKnowledgeController {
  constructor(private readonly knowledge: WellnessKnowledgeService) {}

  @Get('categories')
  tree() {
    return this.knowledge.tree();
  }

  @Get('categories/:slug')
  category(@Param('slug') slug: string) {
    return this.knowledge.categoryPage(slug);
  }

  @Get('categories/:slug/articles')
  articles(
    @CurrentUser() user: AccessTokenPayload,
    @Param('slug') slug: string,
    @Query() query: { page?: string; pageSize?: string },
  ) {
    const { page, pageSize } = parsePage(query);
    return this.knowledge.articles(slug, page, pageSize, isAdmin(user));
  }

  @Get('articles/:id')
  article(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.knowledge.article(id, isAdmin(user));
  }

  @Post('categories')
  createCategory(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: Record<string, unknown>,
  ) {
    this.assertAdmin(user);
    return this.knowledge.createCategory(
      parsed(() => parseCategoryInput(body ?? {}, 'create')),
    );
  }

  @Patch('categories/:id')
  updateCategory(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    this.assertAdmin(user);
    return this.knowledge.updateCategory(
      id,
      parsed(() => parseCategoryInput(body ?? {}, 'update')),
    );
  }

  @Delete('categories/:id')
  @HttpCode(204)
  async removeCategory(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    this.assertAdmin(user);
    await this.knowledge.removeCategory(id);
  }

  @Post('articles')
  createArticle(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: Record<string, unknown>,
  ) {
    this.assertAdmin(user);
    return this.knowledge.createArticle(
      user.sub,
      parsed(() => parseArticleInput(body ?? {}, 'create')),
    );
  }

  @Patch('articles/:id')
  updateArticle(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    this.assertAdmin(user);
    return this.knowledge.updateArticle(
      id,
      parsed(() => parseArticleInput(body ?? {}, 'update')),
    );
  }

  @Delete('articles/:id')
  @HttpCode(204)
  async removeArticle(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    this.assertAdmin(user);
    await this.knowledge.removeArticle(id);
  }

  @Post('articles/:id/cover')
  @Throttle({ default: { ttl: 3_600_000, limit: 60 } })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }),
  )
  setCover(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @UploadedFile() file?: UploadedImageFile,
  ) {
    this.assertAdmin(user);
    return this.knowledge.setCover(id, file);
  }

  @Delete('articles/:id/cover')
  removeCover(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    this.assertAdmin(user);
    return this.knowledge.removeCover(id);
  }

  private assertAdmin(user: AccessTokenPayload): void {
    if (!isAdmin(user)) throw new ForbiddenException();
  }
}
