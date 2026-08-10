import { Controller, Get, NotFoundException, UseGuards } from '@nestjs/common';
import type { AccessTokenPayload, AstroTodayDto } from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../../auth/auth.guard';
import { AstroTransitService } from './astro-transit.service';

@Controller('astro/today')
@UseGuards(AuthGuard)
export class AstroTransitController {
  constructor(private readonly transits: AstroTransitService) {}

  @Get()
  async today(@CurrentUser() user: AccessTokenPayload): Promise<AstroTodayDto> {
    const digest = await this.transits.today(user.sub);
    if (!digest) {
      throw new NotFoundException('Нужны точные дата, время и место рождения');
    }
    return digest;
  }
}
