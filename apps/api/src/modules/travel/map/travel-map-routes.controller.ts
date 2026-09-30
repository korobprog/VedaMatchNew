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
import { AuthGuard, CurrentUser } from '../../auth/auth.guard';
import { TravelMapRoutesService } from './travel-map-routes.service';

/** Маршруты народной карты: читать и добавлять может любой вошедший. */
@Controller('travel/map/routes')
@UseGuards(AuthGuard)
export class TravelMapRoutesController {
  constructor(private readonly routes: TravelMapRoutesService) {}

  @Get()
  list(
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: Record<string, unknown>,
  ) {
    return this.routes.list(user, query);
  }

  @Get(':id')
  get(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.routes.get(user, id);
  }

  @Post()
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: Record<string, unknown>,
  ) {
    return this.routes.create(user, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.routes.update(user, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ): Promise<void> {
    await this.routes.remove(user, id);
  }
}
