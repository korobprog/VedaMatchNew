import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { VedicChart } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import type { EphemerisProvider } from './ephemeris/ephemeris-provider';
import { EPHEMERIS_PROVIDER } from './ephemeris/ephemeris.token';
import { buildVedicChart } from './vedic/vedic-chart';

/**
 * Расчёт карты. Детерминирован и дёшев, поэтому квоты его не касаются: платить
 * приходится за интерпретацию, а не за арифметику. Пользователь должен видеть карту
 * даже когда ИИ выключен аварийным переключателем.
 */
@Injectable()
export class AstroChartService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(EPHEMERIS_PROVIDER)
    private readonly ephemeris: EphemerisProvider,
  ) {}

  async chart(userId: string, now: Date = new Date()): Promise<VedicChart> {
    const birthData = await this.prisma.astroBirthData.findUnique({
      where: { userId },
    });
    if (!birthData) {
      throw new NotFoundException('Сначала заполните данные рождения');
    }

    return buildVedicChart(this.ephemeris, {
      bornAtUtc: birthData.bornAtUtc,
      latitude: birthData.latitude,
      longitude: birthData.longitude,
      timeAccuracy: birthData.timeAccuracy,
      now,
    });
  }
}
