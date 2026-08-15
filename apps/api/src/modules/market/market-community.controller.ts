import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type {
  AccessTokenPayload,
  CreateMarketCommentRequest,
  CreateMarketReportRequest,
  CreateMarketReviewRequest,
  CreateMarketSubscriptionRequest,
  ResolveMarketReportRequest,
} from '@vedamatch/shared';
import {
  AuthGuard,
  CurrentUser,
  OptionalAuthGuard,
  OptionalUser,
} from '../auth/auth.guard';
import { isAdmin } from './is-admin';
import { MarketReportsService } from './market-reports.service';
import { MarketReviewsService } from './market-reviews.service';
import { MarketSubscriptionsService } from './market-subscriptions.service';

@Controller('market/reviews')
export class MarketReviewsController {
  constructor(private readonly reviews: MarketReviewsService) {}

  @Get('shop/:slug')
  @UseGuards(OptionalAuthGuard)
  byShop(@Param('slug') slug: string, @OptionalUser() user?: AccessTokenPayload) {
    return this.reviews.listByShop(slug, user?.sub, user ? isAdmin(user) : false);
  }

  @Get('order/:orderId')
  @UseGuards(AuthGuard)
  byOrder(
    @CurrentUser() user: AccessTokenPayload,
    @Param('orderId') orderId: string,
  ) {
    return this.reviews.byOrder(orderId, user.sub);
  }

  @Post()
  @UseGuards(AuthGuard)
  @Throttle({ default: { ttl: 3_600_000, limit: 20 } })
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: CreateMarketReviewRequest,
  ) {
    return this.reviews.create(user.sub, body);
  }

  @Delete(':id')
  @UseGuards(AuthGuard)
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    await this.reviews.remove(user.sub, isAdmin(user), id);
  }
}

/** Комментарии живут на объявлении: `market/listings/:id/comments`. */
@Controller('market/listings')
export class MarketCommentsController {
  constructor(private readonly reviews: MarketReviewsService) {}

  @Get(':id/comments')
  @UseGuards(OptionalAuthGuard)
  list(@Param('id') id: string, @OptionalUser() user?: AccessTokenPayload) {
    return this.reviews.listComments(id, user?.sub, user ? isAdmin(user) : false);
  }

  @Post(':id/comments')
  @UseGuards(AuthGuard)
  @Throttle({ default: { ttl: 3_600_000, limit: 60 } })
  add(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: CreateMarketCommentRequest,
  ) {
    return this.reviews.addComment(user.sub, id, body);
  }
}

@Controller('market/comments')
@UseGuards(AuthGuard)
export class MarketCommentDeleteController {
  constructor(private readonly reviews: MarketReviewsService) {}

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    await this.reviews.removeComment(user.sub, isAdmin(user), id);
  }
}

@Controller('market/subscriptions')
@UseGuards(AuthGuard)
export class MarketSubscriptionsController {
  constructor(private readonly subscriptions: MarketSubscriptionsService) {}

  @Get()
  list(@CurrentUser() user: AccessTokenPayload) {
    return this.subscriptions.list(user.sub);
  }

  @Post()
  @Throttle({ default: { ttl: 3_600_000, limit: 60 } })
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: CreateMarketSubscriptionRequest,
  ) {
    return this.subscriptions.create(user.sub, body);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    await this.subscriptions.remove(user.sub, id);
  }
}

@Controller('market/reports')
@UseGuards(AuthGuard)
export class MarketReportsController {
  constructor(private readonly reports: MarketReportsService) {}

  @Post()
  @HttpCode(204)
  // Жалоба — рычаг влияния на чужой контент, поэтому лимит жёсткий: десяти
  // в час хватает добросовестному человеку и мало для травли.
  @Throttle({ default: { ttl: 3_600_000, limit: 10 } })
  async create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: CreateMarketReportRequest,
  ) {
    await this.reports.create(user.sub, body);
  }
}

@Controller('market/admin/reports')
@UseGuards(AuthGuard)
export class MarketAdminReportsController {
  constructor(private readonly reports: MarketReportsService) {}

  @Get()
  list(
    @CurrentUser() user: AccessTokenPayload,
    @Query('status') status?: string,
  ) {
    return this.reports.listForAdmin(isAdmin(user), status);
  }

  @Post(':id/resolve')
  @HttpCode(204)
  async resolve(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: ResolveMarketReportRequest,
  ) {
    await this.reports.resolve(isAdmin(user), user.sub, id, body);
  }
}
