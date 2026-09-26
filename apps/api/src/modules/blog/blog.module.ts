import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ModerationModule } from '../moderation/moderation.module';
import { BlogAdminController } from './blog-admin.controller';
import { BlogAvatarService } from './blog-avatar.service';
import { BlogImagesService } from './blog-images.service';
import { BlogLibraryListener } from './blog-library.listener';
import { BlogPurgeListener } from './blog-purge.listener';
import { BlogController } from './blog.controller';
import { BlogService } from './blog.service';
import { BlogVideoService } from './blog-video.service';

/**
 * Сервис «Блог-лента». По контракту сервисного модуля импортирует только
 * AuthModule и ModerationModule (портальная инфраструктура: скрытия и
 * блокировки обязаны действовать во всём портале сразу). PrismaService
 * глобальный.
 *
 * Админский контроллер зарегистрирован первым: его путь `blog/admin/...`
 * начинается с буквального сегмента, а у обычного есть `blog/posts/:id` —
 * порядок регистрации решает, кому достанется запрос.
 */
@Module({
  imports: [AuthModule, ModerationModule],
  controllers: [BlogAdminController, BlogController],
  providers: [
    BlogService,
    BlogAvatarService,
    BlogImagesService,
    BlogVideoService,
    BlogPurgeListener,
    BlogLibraryListener,
  ],
})
export class BlogModule {}
