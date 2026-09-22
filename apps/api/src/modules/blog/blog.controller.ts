import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import {
  BLOG_POST_MAX_IMAGES,
  type AccessTokenPayload,
  type CreateBlogPostRequest,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { BlogService } from './blog.service';
import { isAdmin } from './is-admin';
import {
  MAX_UPLOAD_BYTES,
  type UploadedImageFile,
} from './blog-images.service';

/**
 * Блог-лента портала (VED-238) и личный блог участника (VED-116).
 *
 * Буквальные пути (`home`, `feed`, `authors/:id`) объявлены до `:id`, иначе
 * они уедут в поиск поста по идентификатору.
 */
@Controller('blog')
@UseGuards(AuthGuard)
export class BlogController {
  constructor(private readonly blog: BlogService) {}

  /** Виджет главной: несколько свежих постов и счётчик «и ещё N». */
  @Get('home')
  home(@CurrentUser() user: AccessTokenPayload) {
    return this.blog.home(user.sub, isAdmin(user));
  }

  /** `scope=all` — архив со всеми прошлыми постами. */
  @Get('feed')
  feed(
    @CurrentUser() user: AccessTokenPayload,
    @Query('scope') scope?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.blog.feed(user.sub, isAdmin(user), { scope, cursor });
  }

  @Get('authors/:authorId')
  authorFeed(
    @CurrentUser() user: AccessTokenPayload,
    @Param('authorId') authorId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.blog.authorFeed(user.sub, isAdmin(user), authorId, cursor);
  }

  @Get('posts/:id')
  post(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.blog.post(user.sub, isAdmin(user), id);
  }

  /**
   * Публикация. Картинки едут этим же запросом (multipart) — отдельного
   * шага «дослать файлы» нет, иначе каждая оборванная загрузка оставляла бы
   * в общей ленте пустую карточку. Тело без файлов приезжает обычным JSON.
   */
  @Post('posts')
  // Суточный предел живёт в сервисе; троттлинг здесь — от частой отправки
  // одной и той же формы, а не от количества постов за день.
  @Throttle({ default: { ttl: 3_600_000, limit: 60 } })
  @UseInterceptors(
    FilesInterceptor('files', BLOG_POST_MAX_IMAGES, {
      limits: { fileSize: MAX_UPLOAD_BYTES },
    }),
  )
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: CreateBlogPostRequest,
    @UploadedFiles() files?: UploadedImageFile[],
  ) {
    return this.blog.create(user.sub, isAdmin(user), body, files ?? []);
  }

  @Post('posts/:id/repost')
  @Throttle({ default: { ttl: 3_600_000, limit: 60 } })
  repost(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body?: CreateBlogPostRequest,
  ) {
    return this.blog.repost(user.sub, isAdmin(user), id, body);
  }

  @Delete('posts/:id')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    await this.blog.remove(user.sub, isAdmin(user), id);
  }
}
