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

  /**
   * Карта записи астролога. Владелец — в условии запроса, а не в проверке
   * после: чужая запись не находится вовсе, как и во всём модуле записей.
   *
   * Расчёт тот же самый: хранится момент рождения, а из чьей он строки —
   * астрономии безразлично.
   */
  async subjectChart(
    ownerId: string,
    subjectId: string,
    now: Date = new Date(),
  ): Promise<VedicChart> {
    const subject = await this.prisma.astroSubject.findFirst({
      where: { id: subjectId, ownerId },
    });
    if (!subject) throw new NotFoundException('Запись не найдена');

    return buildVedicChart(this.ephemeris, {
      bornAtUtc: subject.bornAtUtc,
      latitude: subject.latitude,
      longitude: subject.longitude,
      timeAccuracy: subject.timeAccuracy,
      now,
    });
  }
}
