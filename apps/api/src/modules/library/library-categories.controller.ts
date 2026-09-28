import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type {
  AccessTokenPayload,
  CreateLibraryCategoryRequest,
  MoveLibraryCategoryRequest,
  UpdateLibraryCategoryRequest,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { LibraryCategoriesService } from './library-categories.service';
import { isAdmin } from './is-admin';

/**
 * Рубрики справочника. Разделов как отдельного ресурса больше нет: бывший
 * раздел — узел дерева с `parentId === null`, и маршруты у него те же.
 *
 * Порядок методов значим: `tree` и `suggest` объявлены раньше `:slug`,
 * иначе Nest сопоставил бы их с параметром.
 */
@Controller('library/categories')
@UseGuards(AuthGuard)
export class LibraryCategoriesController {
  constructor(private readonly categories: LibraryCategoriesService) {}

  /**
   * `?filtered=true` — дерево для просмотра: без авторов чужих линий
   * (VED-621). Без него — целиком, для админки и выбора рубрики.
   */
  @Get('tree')
  tree(
    @CurrentUser() user: AccessTokenPayload,
    @Query('filtered') filtered?: string,
    @Query('lineage') lineage?: string,
  ) {
    const admin = isAdmin(user);
    return this.categories.tree(user.sub, admin, admin, {
      byViewerFilters: filtered === 'true',
      lineage,
    });
  }

  @Get('suggest')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  suggest(@Query('q') query: string) {
    return this.categories.suggest(query ?? '');
  }

  @Get(':slug')
  page(
    @CurrentUser() user: AccessTokenPayload,
    @Param('slug') slug: string,
    @Query('filtered') filtered?: string,
    @Query('lineage') lineage?: string,
  ) {
    const admin = isAdmin(user);
    return this.categories.page(slug, user.sub, admin, admin, {
      byViewerFilters: filtered === 'true',
      lineage,
    });
  }

  @Post()
  @Throttle({ default: { ttl: 3_600_000, limit: 5 } })
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: CreateLibraryCategoryRequest,
  ) {
    return this.categories.create(user.sub, isAdmin(user), body);
  }

  @Patch(':id')
  @Throttle({ default: { ttl: 3_600_000, limit: 30 } })
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: UpdateLibraryCategoryRequest,
  ) {
    return this.categories.update(user.sub, isAdmin(user), id, body);
  }

  /**
   * Перетаскивание отдаёт всё дерево обратно: правок в базе больше одной
   * (позиции соседей, пути поддерева), и собирать итог на клиенте из
   * запроса значило бы держать вторую копию той же логики.
   */
  @Patch(':id/move')
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  move(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: MoveLibraryCategoryRequest,
  ) {
    const admin = isAdmin(user);
    return this.categories.move(user.sub, admin, admin, id, body);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.categories.remove(isAdmin(user), id);
  }
}
