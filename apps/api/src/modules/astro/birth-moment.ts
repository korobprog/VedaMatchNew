import { BadRequestException } from '@nestjs/common';
import type { AstroTimeAccuracy } from '@vedamatch/shared';
import { DateTime } from 'luxon';
import tzLookup from 'tz-lookup';

/**
 * Перевод «когда и где родился» в момент UTC.
 *
 * Самая частая причина неверной карты — не астрономия, а час смещения. Поэтому
 * зона берётся по координатам, а перевод в UTC идёт через tzdata с исторической
 * базой: декретное время СССР, отменённое летнее время 2011–2014 годов, годы до
 * введения часовых поясов, когда действовало местное среднее солнечное время.
 * Час ошибки сдвигает асцендент примерно на 15° — это половина дома.
 */

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;

/**
 * Время, на которое считается карта, когда оно неизвестно. Полдень — не догадка,
 * а осознанный компромисс: он минимизирует максимальную ошибку по положению Луны
 * в пределах суток. Лагна и дома при этом не показываются вовсе.
 */
export const UNKNOWN_TIME_FALLBACK = '12:00';

export interface BirthMomentInput {
  birthDate: string;
  birthTime: string | null;
  timeAccuracy: AstroTimeAccuracy;
  latitude: number;
  longitude: number;
  /** Ручное переопределение зоны; иначе определяется по координатам. */
  timezone?: string;
}

export interface BirthMoment {
  bornAtUtc: Date;
  timezone: string;
  utcOffsetMinutes: number;
  /** Время, фактически использованное для расчёта. */
  resolvedTime: string;
  /**
   * Введённого времени в этот день не существовало: в этот час переводили стрелки
   * вперёд. Luxon молча сдвигает такое время на час, и без этого признака карта
   * посчиталась бы не на тот момент, ничем себя не выдав. Не ошибка — в документах
   * действительно может стоять час из «пропавшего» интервала, — но человеку об этом
   * нужно сказать.
   */
  nonexistentLocalTime: boolean;
}

export function resolveTimezone(latitude: number, longitude: number): string {
  assertCoordinates(latitude, longitude);
  const zone = tzLookup(latitude, longitude);
  if (!zone) {
    throw new BadRequestException(
      'Не удалось определить часовой пояс для этих координат',
    );
  }
  return zone;
}

export function resolveBirthMoment(input: BirthMomentInput): BirthMoment {
  assertCoordinates(input.latitude, input.longitude);

  if (!DATE_PATTERN.test(input.birthDate)) {
    throw new BadRequestException(
      'Дата рождения должна быть в формате ГГГГ-ММ-ДД',
    );
  }

  const resolvedTime = resolveTime(input.birthTime, input.timeAccuracy);
  const timezone = input.timezone
    ? assertKnownZone(input.timezone)
    : resolveTimezone(input.latitude, input.longitude);

  const local = DateTime.fromISO(`${input.birthDate}T${resolvedTime}`, {
    zone: timezone,
  });
  if (!local.isValid) {
    // Календарно невозможные даты вроде 31 февраля. Несуществующее локальное время
    // в час перевода стрелок сюда НЕ попадает — Luxon считает его валидным и молча
    // сдвигает; оно ловится признаком nonexistentLocalTime ниже.
    throw new BadRequestException(
      `Некорректные дата и время рождения: ${local.invalidReason ?? 'неизвестная причина'}`,
    );
  }

  return {
    bornAtUtc: local.toUTC().toJSDate(),
    timezone,
    utcOffsetMinutes: local.offset,
    resolvedTime,
    // Обратный прогон: если стенные часы после round-trip не совпали с введёнными,
    // такого времени в этот день не было.
    nonexistentLocalTime: local.toFormat('HH:mm') !== resolvedTime,
  };
}

function resolveTime(
  birthTime: string | null,
  accuracy: AstroTimeAccuracy,
): string {
  if (accuracy === 'unknown') return UNKNOWN_TIME_FALLBACK;

  if (!birthTime) {
    throw new BadRequestException(
      'Укажите время рождения или отметьте, что оно неизвестно',
    );
  }
  if (!TIME_PATTERN.test(birthTime)) {
    throw new BadRequestException('Время рождения должно быть в формате ЧЧ:ММ');
  }

  const [hours, minutes] = birthTime.split(':').map(Number);
  if (hours > 23 || minutes > 59) {
    throw new BadRequestException('Время рождения выходит за пределы суток');
  }
  return birthTime;
}

function assertKnownZone(timezone: string): string {
  if (!DateTime.local().setZone(timezone).isValid) {
    throw new BadRequestException(`Неизвестный часовой пояс: ${timezone}`);
  }
  return timezone;
}

function assertCoordinates(latitude: number, longitude: number): void {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new BadRequestException('Некорректная широта места рождения');
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new BadRequestException('Некорректная долгота места рождения');
  }
}
