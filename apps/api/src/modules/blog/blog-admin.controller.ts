import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type {
  AccessTokenPayload,
  BlogPinRequest,
  BlogPostLifetimeRequest,
  BlogSettingsDto,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { BlogService } from './blog.service';
import { isAdmin } from './is-admin';

/**
 * Администрирование ленты (VED-238): срок нахождения поста в ленте и
 * закрепление наверху. Единственное, чем в этом сервисе управляет
 * администратор; участник «постит один за другим» и сюда не ходит.
 *
 * Свой контроллер с префиксом `blog/admin`, а не флаги в общем: так права
 * видно по адресу маршрута, и обычная лента не обрастает админскими телами.
 */
@Controller('blog/admin')
@UseGuards(AuthGuard)
export class BlogAdminController {
  constructor(private readonly blog: BlogService) {}

  @Get('settings')
  settings(@CurrentUser() user: AccessTokenPayload): Promise<BlogSettingsDto> {
    this.assertAdmin(user);
    return this.blog.settings();
  }

  @Patch('settings')
  @Throttle({ default: { ttl: 3_600_000, limit: 60 } })
  updateSettings(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: BlogSettingsDto,
  ): Promise<BlogSettingsDto> {
    this.assertAdmin(user);
    return this.blog.updateSettings(body?.feedLifetimeHours);
  }

  @Patch('posts/:id/lifetime')
  @Throttle({ default: { ttl: 3_600_000, limit: 120 } })
  setLifetime(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: BlogPostLifetimeRequest,
  ) {
    this.assertAdmin(user);
    return this.blog.setLifetime(user.sub, id, body?.hours ?? null);
  }

  @Patch('posts/:id/pin')
  @Throttle({ default: { ttl: 3_600_000, limit: 120 } })
  setPinned(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: BlogPinRequest,
  ) {
    this.assertAdmin(user);
    return this.blog.setPinned(user.sub, id, Boolean(body?.pinned));
  }

  private assertAdmin(user: AccessTokenPayload): void {
    if (!isAdmin(user)) throw new ForbiddenException('admin_only');
  }
}
