import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import {
  BLOG_POST_MAX_IMAGES,
  BLOG_VIDEO_MAX_BYTES,
  type AccessTokenPayload,
  type CreateBlogPostRequest,
  type UpdateBlogPostRequest,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { BlogService } from './blog.service';
import { isAdmin } from './is-admin';
import { type UploadedImageFile } from './blog-images.service';
import { BlogUploadStorage } from './blog-upload-storage';

/**
 * Приём файлов поста: до десяти вложений, каждое не больше ролика (самого
 * крупного из допустимых), и общий потолок на запрос — его держит
 * `BlogUploadStorage`. Какой файл чем является и влезает ли фото в свои
 * 10 МБ, решает сервис: multer видит только байты.
 */
const UPLOAD_OPTIONS = {
  storage: new BlogUploadStorage(),
  limits: { fileSize: BLOG_VIDEO_MAX_BYTES, files: BLOG_POST_MAX_IMAGES },
};

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

  /** «Избранное» того, кто смотрит (VED-238). */
  @Get('favorites')
  favorites(
    @CurrentUser() user: AccessTokenPayload,
    @Query('cursor') cursor?: string,
  ) {
    return this.blog.favorites(user.sub, isAdmin(user), cursor);
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
    FilesInterceptor('files', BLOG_POST_MAX_IMAGES, UPLOAD_OPTIONS),
  )
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: CreateBlogPostRequest,
    @UploadedFiles() files?: UploadedImageFile[],
  ) {
    return this.blog.create(user.sub, isAdmin(user), body, files ?? []);
  }

  /**
   * Правка поста (VED-321). Тот же multipart, что у публикации: фотографии
   * добавляются файлами, а оставшиеся перечисляются в `keepImageIds` —
   * иначе «поправить» остаётся половинчатым, и человек всё равно идёт
   * удалять пост и публиковать заново.
   */
  @Patch('posts/:id')
  @Throttle({ default: { ttl: 3_600_000, limit: 120 } })
  @UseInterceptors(
    FilesInterceptor('files', BLOG_POST_MAX_IMAGES, UPLOAD_OPTIONS),
  )
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: UpdateBlogPostRequest,
    @UploadedFiles() files?: UploadedImageFile[],
  ) {
    return this.blog.update(user.sub, isAdmin(user), id, body, files ?? []);
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

  @Put('posts/:id/favorite')
  @Throttle({ default: { ttl: 3_600_000, limit: 600 } })
  favorite(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.blog.setFavorite(user.sub, isAdmin(user), id, true);
  }

  @Delete('posts/:id/favorite')
  @Throttle({ default: { ttl: 3_600_000, limit: 600 } })
  unfavorite(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.blog.setFavorite(user.sub, isAdmin(user), id, false);
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
