import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  AstroTransitPreferenceDto,
  UpdateAstroTransitPreferenceRequest,
} from '@vedamatch/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { PUSH_HOUR_LOCAL, normalizePushHour } from './transit-schedule';

/**
 * «Во сколько присылать персональный день». Час — местный, пояс берётся из
 * портального профиля (`User.timeZone`, читать сервису можно; пишет его
 * портал через PATCH /profile). Включена ли рассылка вовсе — портальная
 * настройка уведомлений, здесь её нет.
 */
@Injectable()
export class AstroTransitPreferenceService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string): Promise<AstroTransitPreferenceDto> {
    const [pref, user] = await Promise.all([
      this.prisma.astroTransitPreference.findUnique({
        where: { userId },
        select: { pushHour: true },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { timeZone: true, timeZoneLocked: true },
      }),
    ]);
    return {
      pushHour: pref ? normalizePushHour(pref.pushHour) : PUSH_HOUR_LOCAL,
      timeZone: user?.timeZone ?? null,
      timeZoneLocked: user?.timeZoneLocked ?? false,
    };
  }

  async update(
    userId: string,
    body: UpdateAstroTransitPreferenceRequest,
  ): Promise<AstroTransitPreferenceDto> {
    const hour = Number(body?.pushHour);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
      throw new BadRequestException('Час рассылки — целое число от 0 до 23');
    }
    await this.prisma.astroTransitPreference.upsert({
      where: { userId },
      create: { userId, pushHour: hour },
      update: { pushHour: hour },
    });
    return this.get(userId);
  }
}
