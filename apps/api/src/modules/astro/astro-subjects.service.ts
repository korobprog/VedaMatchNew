import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AstroSubjectDto,
  AstroSubjectsDto,
  AstroTimeAccuracy,
  Gender,
  SaveAstroSubjectRequest,
} from '@vedamatch/shared';
import {
  ASTRO_SUBJECT_NAME_MAX,
  ASTRO_SUBJECT_NOTES_MAX,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { resolveBirthMoment } from './birth-moment';

/**
 * Записи астролога — карты людей, которых он ведёт.
 *
 * Главное правило модуля: КАЖДЫЙ запрос к строке идёт вместе с владельцем.
 * Не «найди по id, потом сверь ownerId», а `where: { id, ownerId }` — тогда
 * чужая запись не находится вовсе, и забыть проверку негде. Здесь лежат данные
 * людей, которые порталу ничего не разрешали, и промах был бы дорогим.
 *
 * Своя карта сюда не попадает: она в AstroBirthData и остаётся единственной.
 */

/** Строка со всеми полями, нужными для DTO. */
type SubjectRow = {
  id: string;
  name: string;
  bornAtUtc: Date;
  birthDateLocal: Date;
  birthTimeLocal: string | null;
  timeAccuracy: AstroTimeAccuracy;
  gender: Gender | null;
  placeLabel: string;
  latitude: number;
  longitude: number;
  timezone: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class AstroSubjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(ownerId: string): Promise<AstroSubjectsDto> {
    const rows = await this.prisma.astroSubject.findMany({
      where: { ownerId },
      orderBy: { updatedAt: 'desc' },
    });
    return { items: rows.map((row) => this.toDto(row)) };
  }

  async get(ownerId: string, id: string): Promise<AstroSubjectDto> {
    const row = await this.prisma.astroSubject.findFirst({
      where: { id, ownerId },
    });
    if (!row) throw new NotFoundException('Запись не найдена');
    return this.toDto(row);
  }

  async create(
    ownerId: string,
    body: SaveAstroSubjectRequest,
  ): Promise<AstroSubjectDto> {
    const row = await this.prisma.astroSubject.create({
      data: { ownerId, ...this.dataOf(body) },
    });
    return this.toDto(row);
  }

  async update(
    ownerId: string,
    id: string,
    body: SaveAstroSubjectRequest,
  ): Promise<AstroSubjectDto> {
    // updateMany с владельцем в условии: update по одному id обновил бы чужую
    // строку, а нулевой count честно скажет, что такой записи у нас нет.
    const { count } = await this.prisma.astroSubject.updateMany({
      where: { id, ownerId },
      data: this.dataOf(body),
    });
    if (count === 0) throw new NotFoundException('Запись не найдена');
    return this.get(ownerId, id);
  }

  async remove(ownerId: string, id: string): Promise<{ ok: true }> {
    const { count } = await this.prisma.astroSubject.deleteMany({
      where: { id, ownerId },
    });
    if (count === 0) throw new NotFoundException('Запись не найдена');
    return { ok: true };
  }

  /** Поля строки из запроса: разбор, проверка и пересчёт момента рождения. */
  private dataOf(body: SaveAstroSubjectRequest) {
    const name = (body.name ?? '').trim();
    if (!name) throw new BadRequestException('Укажите, чья это карта');
    if (name.length > ASTRO_SUBJECT_NAME_MAX) {
      throw new BadRequestException(
        `Имя длиннее ${ASTRO_SUBJECT_NAME_MAX} символов`,
      );
    }

    const notes = body.notes?.trim() || null;
    if (notes && notes.length > ASTRO_SUBJECT_NOTES_MAX) {
      throw new BadRequestException(
        `Заметка длиннее ${ASTRO_SUBJECT_NOTES_MAX} символов`,
      );
    }

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

    return {
      name,
      notes,
      gender: this.parseGender(body.gender),
      bornAtUtc: moment.bornAtUtc,
      // Локальная дата собирается из введённой строки, а не из bornAtUtc: в
      // Мумбаи вечернее рождение приходится на предыдущие сутки по UTC, и
      // обратный пересчёт сдвинул бы день.
      birthDateLocal: new Date(`${body.birthDate}T00:00:00.000Z`),
      birthTimeLocal: birthTime,
      timeAccuracy,
      placeLabel: place.label,
      latitude: place.latitude,
      longitude: place.longitude,
      timezone: moment.timezone,
    };
  }

  private toDto(row: SubjectRow): AstroSubjectDto {
    // Момент пересчитывается на чтение, а не хранится: смещение и признак
    // несуществующего времени зависят от базы часовых поясов, и вчерашний
    // ответ мог бы разойтись с сегодняшним расчётом карты.
    const moment = resolveBirthMoment({
      birthDate: row.birthDateLocal.toISOString().slice(0, 10),
      birthTime: row.birthTimeLocal,
      timeAccuracy: row.timeAccuracy,
      latitude: row.latitude,
      longitude: row.longitude,
      timezone: row.timezone,
    });

    return {
      id: row.id,
      name: row.name,
      birthDate: row.birthDateLocal.toISOString().slice(0, 10),
      birthTime: row.birthTimeLocal,
      timeAccuracy: row.timeAccuracy,
      gender: row.gender,
      place: {
        label: row.placeLabel,
        latitude: row.latitude,
        longitude: row.longitude,
      },
      timezone: row.timezone,
      utcOffsetMinutes: moment.utcOffsetMinutes,
      notes: row.notes,
      nonexistentLocalTime: moment.nonexistentLocalTime,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /** Неизвестное значение — не повод падать: пол просто остаётся неуказанным. */
  private parseGender(value: unknown): Gender | null {
    return value === 'male' || value === 'female' ? value : null;
  }

  private parseAccuracy(value: unknown): AstroTimeAccuracy {
    return value === 'unknown' || value === 'approximate' ? value : 'exact';
  }

  private parsePlace(place: SaveAstroSubjectRequest['place']) {
    const label = (place?.label ?? '').trim();
    const { latitude, longitude } = place ?? {};
    if (
      !label ||
      typeof latitude !== 'number' ||
      typeof longitude !== 'number' ||
      Number.isNaN(latitude) ||
      Number.isNaN(longitude)
    ) {
      throw new BadRequestException('Укажите место рождения');
    }
    if (
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      throw new BadRequestException('Координаты вне допустимых пределов');
    }
    return { label, latitude, longitude };
  }
}
