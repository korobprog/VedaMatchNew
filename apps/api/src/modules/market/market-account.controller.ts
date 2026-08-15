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
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type {
  AccessTokenPayload,
  UpdateMarketPreferencesRequest,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { isAdmin } from './is-admin';
import { MarketFavoritesService } from './market-favorites.service';
import { parseListingFilters } from './market-listing-filters';
import { MarketListingsService } from './market-listings.service';
import { MarketPreferencesService } from './market-preferences.service';
import { MarketShopsService } from './market-shops.service';
import { MarketStatsService } from './market-stats.service';

/** Избранное живёт на объявлении: `/market/listings/:id/favorite`. */
@Controller('market/listings')
@UseGuards(AuthGuard)
export class MarketFavoriteToggleController {
  constructor(private readonly favorites: MarketFavoritesService) {}

  @Post(':id/favorite')
  @HttpCode(204)
  async add(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    await this.favorites.add(user.sub, id);
  }

  @Delete(':id/favorite')
  @HttpCode(204)
  async remove(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    await this.favorites.remove(user.sub, id);
  }
}

@Controller('market/favorites')
@UseGuards(AuthGuard)
export class MarketFavoritesController {
  constructor(private readonly listings: MarketListingsService) {}

  /** Та же лента, что и каталог, но суженная до избранного — так фильтры и
   *  сортировки работают и здесь без отдельной реализации. */
  @Get()
  list(
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.listings.feed(
      { ...parseListingFilters(query), favorited: true },
      user.sub,
    );
  }
}

@Controller('market/me/preferences')
@UseGuards(AuthGuard)
export class MarketPreferencesController {
  constructor(private readonly preferences: MarketPreferencesService) {}

  @Get()
  get(@CurrentUser() user: AccessTokenPayload) {
    return this.preferences.get(user.sub);
  }

  @Patch()
  @Throttle({ default: { ttl: 3_600_000, limit: 60 } })
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: UpdateMarketPreferencesRequest,
  ) {
    return this.preferences.update(user.sub, body);
  }
}

@Controller('market/shops')
@UseGuards(AuthGuard)
export class MarketShopStatsController {
  constructor(
    private readonly stats: MarketStatsService,
    private readonly shops: MarketShopsService,
  ) {}

  @Get(':id/stats')
  async forShop(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    // Статистика — внутренняя кухня витрины, поэтому только владелец и админ.
    await this.shops.assertOwner(id, user.sub, isAdmin(user));
    return this.stats.forShop(id);
  }
}
