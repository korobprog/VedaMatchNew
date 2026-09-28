import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AstroTransitPositionsDto } from '@vedamatch/shared';
import { AuthGuard } from '../../auth/auth.guard';
import type { EphemerisProvider } from '../ephemeris/ephemeris-provider';
import { EPHEMERIS_PROVIDER } from '../ephemeris/ephemeris.token';
import {
  computeTransitPositions,
  parseTransitMoment,
} from './transit-positions';

/**
 * Транзиты для карты: где стоят грахи на момент `at` (ISO), по умолчанию —
 * сейчас. Ответ не персональный: небо одно, а дома от лагны или от Луны
 * расставляет клиент по уже известной ему натальной карте.
 */
@Controller('astro/transits')
@UseGuards(AuthGuard)
export class AstroTransitPositionsController {
  constructor(
    @Inject(EPHEMERIS_PROVIDER) private readonly ephemeris: EphemerisProvider,
  ) {}

  @Get()
  positions(@Query('at') at?: string): AstroTransitPositionsDto {
    const moment = parseTransitMoment(at, new Date());
    if (!moment) {
      throw new BadRequestException(
        'Параметр at — дата в формате ISO между 1900 и 2100 годом',
      );
    }
    return computeTransitPositions(this.ephemeris, moment);
  }
}
