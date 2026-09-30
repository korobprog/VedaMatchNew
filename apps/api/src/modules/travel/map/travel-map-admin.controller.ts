import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AccessTokenPayload } from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../../auth/auth.guard';
import { TravelMapRoutesService } from './travel-map-routes.service';
import { TravelMapService } from './travel-map.service';

/** Модерация народной карты. Права проверяет сервис (`isAdmin`). */
@Controller('travel/map/admin')
@UseGuards(AuthGuard)
export class TravelMapAdminController {
  constructor(
    private readonly map: TravelMapService,
    private readonly routes: TravelMapRoutesService,
  ) {}

  @Get('places')
  places(
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: Record<string, unknown>,
  ) {
    return this.map.adminListPlaces(user, query);
  }

  @Post('places/:id/verify')
  @HttpCode(200)
  verify(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.map.adminVerify(user, id);
  }

  @Post('places/:id/unverify')
  @HttpCode(200)
  unverify(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.map.adminUnverify(user, id);
  }

  @Post('places/:id/hide')
  @HttpCode(200)
  hide(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.map.adminHide(user, id, body);
  }

  @Post('places/:id/unhide')
  @HttpCode(200)
  unhide(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.map.adminUnhide(user, id);
  }

  @Get('reports')
  reports(
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: Record<string, unknown>,
  ) {
    return this.map.adminListReports(user, query);
  }

  @Post('reports/:id/resolve')
  @HttpCode(200)
  async resolve(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    await this.map.adminResolveReport(user, id);
    return { ok: true };
  }

  @Get('routes')
  listRoutes(
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: Record<string, unknown>,
  ) {
    return this.routes.adminList(user, query);
  }

  @Post('routes/:id/hide')
  @HttpCode(200)
  hideRoute(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.routes.adminHide(user, id, body);
  }

  @Post('routes/:id/unhide')
  @HttpCode(200)
  unhideRoute(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    return this.routes.adminUnhide(user, id);
  }
}
