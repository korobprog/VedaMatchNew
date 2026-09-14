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
import type { AccessTokenPayload } from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { TravelCashTemplatesService } from './travel-cash-templates.service';
import { TravelCashService } from './travel-cash.service';

/**
 * Касса объекта. Живёт под `travel/manage/...`: это кабинет управляющего, и
 * права те же — только люди из списка управляющих объекта.
 */
@Controller('travel/manage/stays/:stayId/cash')
@UseGuards(AuthGuard)
export class TravelCashController {
  constructor(
    private readonly cash: TravelCashService,
    private readonly templates: TravelCashTemplatesService,
  ) {}

  @Get('categories')
  categories(
    @CurrentUser() user: AccessTokenPayload,
    @Param('stayId') stayId: string,
  ) {
    return this.cash.categories(user.sub, stayId);
  }

  @Post('categories')
  createCategory(
    @CurrentUser() user: AccessTokenPayload,
    @Param('stayId') stayId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.cash.createCategory(user.sub, stayId, body);
  }

  @Patch('categories/:categoryId')
  updateCategory(
    @CurrentUser() user: AccessTokenPayload,
    @Param('stayId') stayId: string,
    @Param('categoryId') categoryId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.cash.updateCategory(user.sub, stayId, categoryId, body);
  }

  @Delete('categories/:categoryId')
  @HttpCode(204)
  async removeCategory(
    @CurrentUser() user: AccessTokenPayload,
    @Param('stayId') stayId: string,
    @Param('categoryId') categoryId: string,
  ) {
    await this.cash.removeCategory(user.sub, stayId, categoryId);
  }

  /** Промежуток `from`/`to` и фильтры: q, kind, categoryId, guestId, tag, minMinor, maxMinor. */
  @Get('entries')
  entries(
    @CurrentUser() user: AccessTokenPayload,
    @Param('stayId') stayId: string,
    @Query() query: Record<string, unknown>,
  ) {
    return this.cash.entries(user.sub, stayId, query);
  }

  /** Групповое удаление выбранных записей. */
  @Post('entries/remove')
  removeEntries(
    @CurrentUser() user: AccessTokenPayload,
    @Param('stayId') stayId: string,
    @Body() body: { ids?: unknown },
  ) {
    return this.cash.removeEntries(user.sub, stayId, body);
  }

  @Get('templates')
  templatesList(
    @CurrentUser() user: AccessTokenPayload,
    @Param('stayId') stayId: string,
  ) {
    return this.templates.list(user.sub, stayId);
  }

  @Post('templates')
  createTemplate(
    @CurrentUser() user: AccessTokenPayload,
    @Param('stayId') stayId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.templates.create(user.sub, stayId, body);
  }

  @Patch('templates/:templateId')
  updateTemplate(
    @CurrentUser() user: AccessTokenPayload,
    @Param('stayId') stayId: string,
    @Param('templateId') templateId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.templates.update(user.sub, stayId, templateId, body);
  }

  @Delete('templates/:templateId')
  @HttpCode(204)
  async removeTemplate(
    @CurrentUser() user: AccessTokenPayload,
    @Param('stayId') stayId: string,
    @Param('templateId') templateId: string,
  ) {
    await this.templates.remove(user.sub, stayId, templateId);
  }

  @Post('entries')
  createEntry(
    @CurrentUser() user: AccessTokenPayload,
    @Param('stayId') stayId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.cash.createEntry(user.sub, stayId, body);
  }

  @Patch('entries/:entryId')
  updateEntry(
    @CurrentUser() user: AccessTokenPayload,
    @Param('stayId') stayId: string,
    @Param('entryId') entryId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.cash.updateEntry(user.sub, stayId, entryId, body);
  }

  @Delete('entries/:entryId')
  @HttpCode(204)
  async removeEntry(
    @CurrentUser() user: AccessTokenPayload,
    @Param('stayId') stayId: string,
    @Param('entryId') entryId: string,
  ) {
    await this.cash.removeEntry(user.sub, stayId, entryId);
  }

  @Patch('opening')
  setOpening(
    @CurrentUser() user: AccessTokenPayload,
    @Param('stayId') stayId: string,
    @Body() body: { openingMinor?: unknown },
  ) {
    return this.cash.setOpening(user.sub, stayId, body);
  }
}
