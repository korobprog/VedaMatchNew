import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Put,
  UseGuards,
} from '@nestjs/common';
import type {
  AccessTokenPayload,
  AstroTodayDto,
  UpdateAstroTransitPreferenceRequest,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../../auth/auth.guard';
import { AstroTransitPreferenceService } from './astro-transit-preference.service';
import { AstroTransitService } from './astro-transit.service';

@Controller('astro/today')
@UseGuards(AuthGuard)
export class AstroTransitController {
  constructor(
    private readonly transits: AstroTransitService,
    private readonly preferences: AstroTransitPreferenceService,
  ) {}

  /** Во сколько присылать персональный день. Объявлен до `@Get()` для ясности маршрутов. */
  @Get('preferences')
  preference(@CurrentUser() user: AccessTokenPayload) {
    return this.preferences.get(user.sub);
  }

  @Put('preferences')
  updatePreference(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: UpdateAstroTransitPreferenceRequest,
  ) {
    return this.preferences.update(user.sub, body);
  }

  @Get()
  async today(@CurrentUser() user: AccessTokenPayload): Promise<AstroTodayDto> {
    const digest = await this.transits.today(user.sub);
    if (!digest) {
      throw new NotFoundException('Нужны точные дата, время и место рождения');
    }
    return digest;
  }
}
