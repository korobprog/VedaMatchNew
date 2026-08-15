import {
  Body,
  Controller,
  Delete,
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
import type {
  AccessTokenPayload,
  CreateMarketShelfRequest,
  CreateMarketShopRequest,
  UpdateMarketShelfRequest,
  UpdateMarketShopRequest,
} from '@vedamatch/shared';
import {
  AuthGuard,
  CurrentUser,
  OptionalAuthGuard,
  OptionalUser,
} from '../auth/auth.guard';
import { isAdmin } from './is-admin';
import { MAX_UPLOAD_BYTES, type UploadedImageFile } from './market-images.service';
import { parseListingFilters } from './market-listing-filters';
import { MarketListingsService } from './market-listings.service';
import { MarketShelvesService } from './market-shelves.service';
import { MarketShopsService } from './market-shops.service';

/**
 * Полки живут отдельным контроллером, потому что их правят по id полки, а не
 * по id магазина: путь `market/shops/:id/shelves` годится только для создания.
 */
@Controller('market/shelves')
@UseGuards(AuthGuard)
export class MarketShelvesController {
  constructor(private readonly shelves: MarketShelvesService) {}

  @Patch(':shelfId')
  @Throttle({ default: { ttl: 3_600_000, limit: 60 } })
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('shelfId') shelfId: string,
    @Body() body: UpdateMarketShelfRequest,
  ) {
    return this.shelves.update(shelfId, user.sub, isAdmin(user), body);
  }

  @Delete(':shelfId')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AccessTokenPayload,
    @Param('shelfId') shelfId: string,
  ) {
    await this.shelves.remove(shelfId, user.sub, isAdmin(user));
  }
}

@Controller('market/shops')
export class MarketShopsController {
  constructor(
    private readonly shops: MarketShopsService,
    private readonly shelves: MarketShelvesService,
    private readonly listings: MarketListingsService,
  ) {}

  @Get()
  @UseGuards(OptionalAuthGuard)
  list(
    @Query('q') q?: string,
    @Query('city') city?: string,
    @Query('country') country?: string,
    @Query('cursor') cursor?: string,
    @OptionalUser() user?: AccessTokenPayload,
  ) {
    return this.shops.list({ q, city, country, cursor }, user?.sub);
  }

  /** Объявлен до `:slug`, иначе «me» уедет в поиск магазина по слагу. */
  @Get('me')
  @UseGuards(AuthGuard)
  mine(@CurrentUser() user: AccessTokenPayload) {
    return this.shops.mine(user.sub);
  }

  @Get(':slug')
  @UseGuards(OptionalAuthGuard)
  bySlug(@Param('slug') slug: string, @OptionalUser() user?: AccessTokenPayload) {
    return this.shops.bySlug(slug, user?.sub, user ? isAdmin(user) : false);
  }

  @Get(':slug/shelves')
  @UseGuards(OptionalAuthGuard)
  shelvesOf(@Param('slug') slug: string) {
    return this.shelves.listByShopSlug(slug);
  }

  /** Витрина магазина. То же, что `/market/listings?shopSlug=…`, но страница
   *  магазина не должна знать про устройство фильтров ленты. */
  @Get(':slug/listings')
  @UseGuards(OptionalAuthGuard)
  listingsOf(
    @Param('slug') slug: string,
    @Query() query: Record<string, string | undefined>,
    @OptionalUser() user?: AccessTokenPayload,
  ) {
    return this.listings.feed(
      { ...parseListingFilters(query), shopSlug: slug },
      user?.sub,
    );
  }

  @Post()
  @UseGuards(AuthGuard)
  // Магазин один на пользователя (shop_already_exists), поэтому лимит защищает
  // не от спама витрин, а от перебора слагов. Считаются и отклонённые попытки,
  // поэтому не 3: две опечатки в форме не должны запирать человека на час.
  @Throttle({ default: { ttl: 3_600_000, limit: 10 } })
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: CreateMarketShopRequest,
  ) {
    return this.shops.create(user.sub, body);
  }

  @Patch(':id')
  @UseGuards(AuthGuard)
  @Throttle({ default: { ttl: 3_600_000, limit: 60 } })
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: UpdateMarketShopRequest,
  ) {
    return this.shops.update(user.sub, isAdmin(user), id, body);
  }

  @Post(':id/logo')
  @UseGuards(AuthGuard)
  @Throttle({ default: { ttl: 3_600_000, limit: 20 } })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }),
  )
  uploadLogo(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @UploadedFile() file?: UploadedImageFile,
  ) {
    return this.shops.uploadImage(user.sub, isAdmin(user), id, 'logo', file);
  }

  @Post(':id/cover')
  @UseGuards(AuthGuard)
  @Throttle({ default: { ttl: 3_600_000, limit: 20 } })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }),
  )
  uploadCover(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @UploadedFile() file?: UploadedImageFile,
  ) {
    return this.shops.uploadImage(user.sub, isAdmin(user), id, 'cover', file);
  }

  @Post(':id/shelves')
  @UseGuards(AuthGuard)
  @Throttle({ default: { ttl: 3_600_000, limit: 60 } })
  async createShelf(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: CreateMarketShelfRequest,
  ) {
    await this.shops.assertOwner(id, user.sub, isAdmin(user));
    return this.shelves.create(id, body);
  }
}
