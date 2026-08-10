import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import type {
  AccessTokenPayload,
  AstroQuotaState,
  AstroReadingsDto,
  AstroSection,
  AstroSectionState,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { AstroQuotaService } from './astro-quota.service';
import { AstroReadingService } from './astro-reading.service';

@Controller('astro')
@UseGuards(AuthGuard)
export class AstroReadingController {
  constructor(
    private readonly readings: AstroReadingService,
    private readonly quota: AstroQuotaService,
  ) {}

  /** Все разделы: сгенерированные — с текстом, остальные — с причиной блокировки. */
  @Get('readings')
  list(@CurrentUser() user: AccessTokenPayload): Promise<AstroReadingsDto> {
    return this.readings.list(user.sub);
  }

  /** Генерация раздела. Уже готовый отдаётся из кэша и квоту не тратит. */
  @Post('readings/:section')
  generate(
    @CurrentUser() user: AccessTokenPayload,
    @Param('section') section: AstroSection,
  ): Promise<AstroSectionState> {
    return this.readings.generate(user.sub, section);
  }

  @Get('quota')
  quotaState(
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<AstroQuotaState> {
    return this.quota.state(user.sub);
  }
}
