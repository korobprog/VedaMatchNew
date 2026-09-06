import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import {
  MarketFavoriteToggleController,
  MarketFavoritesController,
  MarketPreferencesController,
  MarketShopStatsController,
} from './market-account.controller';
import {
  MarketAdminCatalogController,
  MarketCategoriesController,
  MarketSectionsController,
} from './market-catalog.controller';
import { MarketCartService } from './market-cart.service';
import { MarketCatalogService } from './market-catalog.service';
import {
  MarketAdminReportsController,
  MarketCommentDeleteController,
  MarketCommentsController,
  MarketReportsController,
  MarketReviewsController,
  MarketSubscriptionsController,
} from './market-community.controller';
import { MarketReportsService } from './market-reports.service';
import { MarketReviewsService } from './market-reviews.service';
import { MarketSubscriptionsService } from './market-subscriptions.service';
import { MarketChatService } from './market-chat.service';
import { MarketFavoritesService } from './market-favorites.service';
import { MarketOrdersService } from './market-orders.service';
import {
  MarketCartController,
  MarketChatController,
  MarketOrdersController,
} from './market-trade.controller';
import { MarketPurgeListener } from './market-purge.listener';
import { MarketAssistantListener } from './market-assistant.listener';
import { MarketImagesService } from './market-images.service';
import {
  MarketAdminListingsController,
  MarketListingsController,
} from './market-listings.controller';
import { MarketListingsService } from './market-listings.service';
import { MarketPreferencesService } from './market-preferences.service';
import { MarketShelvesService } from './market-shelves.service';
import {
  MarketShelvesController,
  MarketShopsController,
} from './market-shops.controller';
import { MarketShopsService } from './market-shops.service';
import { MarketStatsService } from './market-stats.service';

/**
 * Сервис «Рынок». По контракту сервисного модуля импортирует только AuthModule;
 * PrismaService глобальный, EventEmitter2 инжектится напрямую.
 */
@Module({
  imports: [AuthModule],
  controllers: [
    MarketSectionsController,
    MarketCategoriesController,
    MarketAdminCatalogController,
    MarketShopsController,
    MarketShopStatsController,
    MarketShelvesController,
    MarketListingsController,
    MarketFavoriteToggleController,
    MarketAdminListingsController,
    MarketFavoritesController,
    MarketPreferencesController,
    MarketCartController,
    MarketOrdersController,
    MarketChatController,
    MarketReviewsController,
    MarketCommentsController,
    MarketCommentDeleteController,
    MarketSubscriptionsController,
    MarketReportsController,
    MarketAdminReportsController,
  ],
  providers: [
    MarketCatalogService,
    MarketImagesService,
    MarketShopsService,
    MarketShelvesService,
    MarketListingsService,
    MarketFavoritesService,
    MarketPreferencesService,
    MarketStatsService,
    MarketCartService,
    MarketOrdersService,
    MarketChatService,
    MarketReviewsService,
    MarketSubscriptionsService,
    MarketReportsService,
    MarketPurgeListener,
    MarketAssistantListener,
  ],
})
export class MarketModule {}
