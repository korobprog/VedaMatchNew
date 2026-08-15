import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type {
  AccessTokenPayload,
  CreateMarketCategoryRequest,
  CreateMarketSectionRequest,
  UpdateMarketCategoryRequest,
  UpdateMarketSectionRequest,
} from '@vedamatch/shared';
import {
  AuthGuard,
  CurrentUser,
  OptionalAuthGuard,
  OptionalUser,
} from '../auth/auth.guard';
import { MarketCatalogService } from './market-catalog.service';
import { isAdmin } from './is-admin';

/**
 * Каталог доступен и гостю: витрина Рынка должна открываться по ссылке из
 * поисковика. Веб может гейтить страницы на вход, не трогая API.
 */
@Controller('market/sections')
@UseGuards(OptionalAuthGuard)
export class MarketSectionsController {
  constructor(private readonly catalog: MarketCatalogService) {}

  @Get()
  list(@OptionalUser() user?: AccessTokenPayload) {
    return this.catalog.listSections(user ? isAdmin(user) : false);
  }
}

@Controller('market/categories')
@UseGuards(OptionalAuthGuard)
export class MarketCategoriesController {
  constructor(private readonly catalog: MarketCatalogService) {}

  @Get('section/:sectionSlug')
  listBySection(
    @Param('sectionSlug') sectionSlug: string,
    @OptionalUser() user?: AccessTokenPayload,
  ) {
    return this.catalog.listCategories(sectionSlug, user ? isAdmin(user) : false);
  }
}

/**
 * Префикс `market/admin`, а не `admin/...`: контракт сервисного модуля требует
 * держать все маршруты под слагом сервиса. Существующий `admin/reports` в
 * модуле модерации — портальная инфраструктура и предшествует этому правилу.
 */
@Controller('market/admin/catalog')
@UseGuards(AuthGuard)
@Throttle({ default: { ttl: 3_600_000, limit: 60 } })
export class MarketAdminCatalogController {
  constructor(private readonly catalog: MarketCatalogService) {}

  @Post('sections')
  createSection(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: CreateMarketSectionRequest,
  ) {
    return this.catalog.createSection(isAdmin(user), body);
  }

  @Patch('sections/:id')
  updateSection(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: UpdateMarketSectionRequest,
  ) {
    return this.catalog.updateSection(isAdmin(user), id, body);
  }

  @Post('categories')
  createCategory(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: CreateMarketCategoryRequest,
  ) {
    return this.catalog.createCategory(isAdmin(user), body);
  }

  @Patch('categories/:id')
  updateCategory(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: UpdateMarketCategoryRequest,
  ) {
    return this.catalog.updateCategory(isAdmin(user), id, body);
  }
}
