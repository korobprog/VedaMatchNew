import { Controller, Get, UseGuards } from '@nestjs/common';
import type { AccessTokenPayload, VedicChart } from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { AstroChartService } from './astro-chart.service';

@Controller('astro/chart')
@UseGuards(AuthGuard)
export class AstroChartController {
  constructor(private readonly charts: AstroChartService) {}

  @Get()
  chart(@CurrentUser() user: AccessTokenPayload): Promise<VedicChart> {
    return this.charts.chart(user.sub);
  }
}
