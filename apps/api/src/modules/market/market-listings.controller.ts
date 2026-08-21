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
import type {
  AccessTokenPayload,
  CreateMarketListingRequest,
  ReorderMarketImagesRequest,
  SetMarketListingShelvesRequest,
  UpdateMarketListingRequest,
  UpdateMarketListingStatusRequest,
} from '@vedamatch/shared';
import {
  AuthGuard,
  CurrentUser,
  OptionalAuthGuard,
  OptionalUser,
} from '../auth/auth.guard';
import { isAdmin } from './is-admin';
import {
  MAX_IMAGES_PER_LISTING,
  MAX_UPLOAD_BYTES,
  type UploadedImageFile,
} from './market-images.service';
import { parseListingFilters } from './market-listing-filters';
import { MarketListingsService } from './market-listings.service';

@Controller('market/listings')
export class MarketListingsController {
  constructor(private readonly listings: MarketListingsService) {}

  @Get()
  @UseGuards(OptionalAuthGuard)
  // Лента открыта гостю и живёт под общим лимитом чтения: фильтры на витрине
  // переключают часто, и час бана за перебор фильтров был бы абсурдом.
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  feed(
    @Query() query: Record<string, string | undefined>,
    @OptionalUser() user?: AccessTokenPayload,
  ) {
    return this.listings.feed(parseListingFilters(query), user?.sub);
  }

  @Get(':id')
  @UseGuards(OptionalAuthGuard)
  byId(@Param('id') id: string, @OptionalUser() user?: AccessTokenPayload) {
    return this.listings.byId(id, user?.sub, user ? isAdmin(user) : false);
  }

  @Post()
  @UseGuards(AuthGuard)
  @Throttle({ default: { ttl: 3_600_000, limit: 30 } })
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: CreateMarketListingRequest,
  ) {
    return this.listings.create(user.sub, body);
  }

  @Patch(':id')
  @UseGuards(AuthGuard)
  @Throttle({ default: { ttl: 3_600_000, limit: 120 } })
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: UpdateMarketListingRequest,
  ) {
    return this.listings.update(user.sub, isAdmin(user), id, body);
  }

  @Post(':id/status')
  @UseGuards(AuthGuard)
  // Обновление, а не создание: POST здесь только потому, что смена статуса —
  // действие, а не правка полей.
  @HttpCode(200)
  @Throttle({ default: { ttl: 3_600_000, limit: 120 } })
  setStatus(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: UpdateMarketListingStatusRequest,
  ) {
    return this.listings.setStatus(user.sub, isAdmin(user), id, body);
  }

  @Delete(':id')
  @UseGuards(AuthGuard)
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    await this.listings.remove(user.sub, isAdmin(user), id);
  }

  @Post(':id/images')
  @UseGuards(AuthGuard)
  @Throttle({ default: { ttl: 3_600_000, limit: 120 } })
  @UseInterceptors(
    FilesInterceptor('files', MAX_IMAGES_PER_LISTING, {
      limits: { fileSize: MAX_UPLOAD_BYTES },
    }),
  )
  addImages(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @UploadedFiles() files?: UploadedImageFile[],
  ) {
    return this.listings.addImages(user.sub, isAdmin(user), id, files);
  }

  @Delete(':id/images/:imageId')
  @UseGuards(AuthGuard)
  @HttpCode(204)
  async removeImage(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Param('imageId') imageId: string,
  ) {
    await this.listings.removeImage(user.sub, isAdmin(user), id, imageId);
  }

  @Put(':id/images/order')
  @UseGuards(AuthGuard)
  @Throttle({ default: { ttl: 3_600_000, limit: 120 } })
  reorderImages(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: ReorderMarketImagesRequest,
  ) {
    return this.listings.reorderImages(user.sub, isAdmin(user), id, body);
  }

  @Put(':id/shelves')
  @UseGuards(AuthGuard)
  @Throttle({ default: { ttl: 3_600_000, limit: 120 } })
  setShelves(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: SetMarketListingShelvesRequest,
  ) {
    return this.listings.setShelves(user.sub, isAdmin(user), id, body);
  }
}

/**
 * Ручное скрытие объявления администрацией. По плану модерация — третья фаза,
 * но при постмодерации нельзя выпускать сервис вообще без рычага, поэтому
 * один этот маршрут живёт уже сейчас.
 */
@Controller('market/admin/listings')
@UseGuards(AuthGuard)
export class MarketAdminListingsController {
  constructor(private readonly listings: MarketListingsService) {}

  @Post(':id/hide')
  @HttpCode(204)
  async hide(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    await this.listings.hideByAdmin(isAdmin(user), user.sub, id);
  }
}

