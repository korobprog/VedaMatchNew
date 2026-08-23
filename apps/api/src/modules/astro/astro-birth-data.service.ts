import { BadRequestException, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PORTAL_ACTIVITY_EVENTS } from '@vedamatch/shared';
import type {
  AstroBirthDataDto,
  AstroStateDto,
  AstroTimeAccuracy,
  PortalActivityEvent,
  SaveAstroBirthDataRequest,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { computeAstroCompleteness } from './astro-completeness';
import { resolveBirthMoment } from './birth-moment';

const TIME_ACCURACIES: AstroTimeAccuracy[] = [
  'exact',
  'approximate',
  'unknown',
];
const MAX_PLACE_LABEL = 200;

type BirthDataRow = {
  bornAtUtc: Date;
  birthDateLocal: Date;
  birthTimeLocal: string | null;
  timeAccuracy: AstroTimeAccuracy;
  placeLabel: string;
  latitude: number;
  longitude: number;
  timezone: string;
};

@Injectable()
export class AstroBirthDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bus: EventEmitter2,
  ) {}

  /**
   * Факт «человек сохранил натальную карту» для подписчиков портала. Данные
   * рождения в событие не попадают: подписчику нужен сам факт, а место и
   * время рождения — чувствительные сведения.
   */
  private announceActivity(userId: string): void {
    const event: PortalActivityEvent = {
      name: PORTAL_ACTIVITY_EVENTS.astro,
      userId,
      action: 'astro.birth-data-saved',
      occurredAt: new Date().toISOString(),
    };
    this.bus.emit(event.name, event);
  }

  async state(userId: string): Promise<AstroStateDto> {
    const [row, user] = await Promise.all([
      this.prisma.astroBirthData.findUnique({ where: { userId } }),
      // Портальный профиль читается только на чтение — так велит контракт сервиса.
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { birthDate: true },
      }),
    ]);

    return this.toState(row, user?.birthDate ?? null);
  }

  async save(
    userId: string,
    body: SaveAstroBirthDataRequest,
  ): Promise<AstroStateDto> {
    const timeAccuracy = this.parseAccuracy(body.timeAccuracy);
    const place = this.parsePlace(body.place);
    const birthTime =
      timeAccuracy === 'unknown' ? null : (body.birthTime ?? null);

    const moment = resolveBirthMoment({
      birthDate: body.birthDate,
      birthTime,
      timeAccuracy,
      latitude: place.latitude,
      longitude: place.longitude,
      timezone: body.timezone,
    });

    const data = {
      bornAtUtc: moment.bornAtUtc,
      // Локальная дата хранится как календарный день без зоны, поэтому собирается
      // из введённой строки, а не из bornAtUtc: в Мумбаи вечернее рождение приходится
      // на предыдущие сутки по UTC, и обратный пересчёт сдвинул бы день.
      birthDateLocal: new Date(`${body.birthDate}T00:00:00.000Z`),
      birthTimeLocal: birthTime,
      timeAccuracy,
      placeLabel: place.label,
      latitude: place.latitude,
      longitude: place.longitude,
      timezone: moment.timezone,
    };

    const row = await this.prisma.astroBirthData.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { birthDate: true },
    });

    this.announceActivity(userId);

    return this.toState(row, user?.birthDate ?? null);
  }

  private toState(
    row: BirthDataRow | null,
    portalBirthDate: Date | null,
  ): AstroStateDto {
    const birthData = row ? this.toDto(row) : null;

    return {
      birthData,
      suggestedBirthDate: portalBirthDate ? toIsoDate(portalBirthDate) : null,
      completeness: computeAstroCompleteness({
        // Дата засчитывается и из портального профиля: человек её уже вводил,
        // просить второй раз — терять его на первом же шаге.
        hasBirthDate: Boolean(row) || portalBirthDate !== null,
        hasBirthPlace: Boolean(row),
        hasBirthTime: Boolean(row) && row!.timeAccuracy !== 'unknown',
      }),
    };
  }

  private toDto(row: BirthDataRow): AstroBirthDataDto {
    const moment = resolveBirthMoment({
      birthDate: toIsoDate(row.birthDateLocal),
      birthTime: row.birthTimeLocal,
      timeAccuracy: row.timeAccuracy,
      latitude: row.latitude,
      longitude: row.longitude,
      timezone: row.timezone,
    });

    return {
      birthDate: toIsoDate(row.birthDateLocal),
      birthTime: row.birthTimeLocal,
      timeAccuracy: row.timeAccuracy,
      place: {
        label: row.placeLabel,
        latitude: row.latitude,
        longitude: row.longitude,
      },
      timezone: row.timezone,
      bornAtUtc: row.bornAtUtc.toISOString(),
      utcOffsetMinutes: moment.utcOffsetMinutes,
      nonexistentLocalTime: moment.nonexistentLocalTime,
    };
  }

  private parseAccuracy(value: unknown): AstroTimeAccuracy {
    if (!TIME_ACCURACIES.includes(value as AstroTimeAccuracy)) {
      throw new BadRequestException('Некорректная точность времени рождения');
    }
    return value as AstroTimeAccuracy;
  }

  private parsePlace(place: SaveAstroBirthDataRequest['place']) {
    const label = String(place?.label ?? '').trim();
    if (!label) {
      throw new BadRequestException('Укажите место рождения');
    }
    if (label.length > MAX_PLACE_LABEL) {
      throw new BadRequestException('Слишком длинное название места рождения');
    }
    return {
      label,
      latitude: Number(place.latitude),
      longitude: Number(place.longitude),
    };
  }
}

/**
 * `@db.Date` возвращается как полночь UTC. Форматирование по UTC-компонентам
 * обязательно: в зонах западнее Гринвича локальные компоненты дали бы вчерашний день.
 */
function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
