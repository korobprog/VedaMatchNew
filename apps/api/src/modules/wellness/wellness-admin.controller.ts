import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type {
  AccessTokenPayload,
  WellnessProductStatus,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { isAdmin } from './is-admin';
import { parseIngredientInput, WellnessInputError } from './wellness-dto';
import { WellnessAdminService } from './wellness-admin.service';
import { WellnessRecipesService } from './wellness-recipes.service';
import { WellnessService } from './wellness.service';

const STATUSES: WellnessProductStatus[] = ['draft', 'published', 'rejected'];

/**
 * Админка сервиса «Здоровье». Раздел обязателен: без него справочник нельзя
 * пополнить, а справочник и есть то, что сервис умеет.
 */
@Controller('wellness/admin')
@UseGuards(AuthGuard)
export class WellnessAdminController {
  constructor(
    private readonly admin: WellnessAdminService,
    private readonly wellness: WellnessService,
    private readonly recipes: WellnessRecipesService,
  ) {}

  @Get('recipes')
  recipeList(@CurrentUser() user: AccessTokenPayload) {
    this.assertAdmin(user);
    return this.recipes.all();
  }

  @Post('recipes/:id/status')
  recipeStatus(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: { status?: string },
  ) {
    this.assertAdmin(user);
    if (!STATUSES.includes(body.status as WellnessProductStatus)) {
      throw new BadRequestException('Неизвестный статус');
    }
    return this.recipes.setStatus(id, body.status as WellnessProductStatus);
  }

  @Delete('recipes/:id')
  @HttpCode(204)
  async recipeRemove(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    this.assertAdmin(user);
    await this.recipes.remove(id);
  }

  @Get('products')
  products(
    @CurrentUser() user: AccessTokenPayload,
    @Query('status') status?: string,
  ) {
    this.assertAdmin(user);
    const wanted = STATUSES.includes(status as WellnessProductStatus)
      ? (status as WellnessProductStatus)
      : 'draft';
    return this.admin.products(wanted);
  }

  @Post('products/:id/approve')
  approve(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    this.assertAdmin(user);
    return this.admin.approve(id, user.sub);
  }

  @Post('products/:id/reject')
  reject(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    this.assertAdmin(user);
    const reason = (body.reason ?? '').trim().slice(0, 300);
    if (!reason) throw new BadRequestException('Нужна причина отказа');
    return this.admin.reject(id, user.sub, reason);
  }

  @Get('reports')
  reports(@CurrentUser() user: AccessTokenPayload) {
    this.assertAdmin(user);
    return this.admin.reports();
  }

  @Post('reports/:id/accept')
  acceptReport(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    this.assertAdmin(user);
    return this.admin.decideReport(id, user.sub, true);
  }

  @Post('reports/:id/reject')
  rejectReport(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    this.assertAdmin(user);
    return this.admin.decideReport(id, user.sub, false);
  }

  @Get('ingredients')
  ingredients(@CurrentUser() user: AccessTokenPayload) {
    this.assertAdmin(user);
    return this.wellness.catalogForUi();
  }

  @Post('ingredients')
  saveIngredient(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: Record<string, unknown>,
  ) {
    this.assertAdmin(user);
    try {
      return this.admin.saveIngredient(parseIngredientInput(body));
    } catch (error) {
      if (error instanceof WellnessInputError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  @Delete('ingredients/:id')
  @HttpCode(204)
  async removeIngredient(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    this.assertAdmin(user);
    await this.admin.removeIngredient(id);
  }

  private assertAdmin(user: AccessTokenPayload): void {
    if (!isAdmin(user)) throw new ForbiddenException();
  }
}
