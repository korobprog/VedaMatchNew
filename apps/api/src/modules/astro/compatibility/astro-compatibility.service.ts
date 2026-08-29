import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type {
  AstroCompatibilityReadingDto,
  AstroSubjectPairDto,
  AstroCompatibilityPurpose,
  AstroCompatibilityRequestDto,
  AstroTimeAccuracy,
  Gender,
  GunaMilanScore,
  NotificationEvent,
} from '@vedamatch/shared';
import {
  ASTRO_COMPATIBILITY_PURPOSES,
  resolveDisplayName,
} from '@vedamatch/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { UsersService } from '../../users/users.service';
import {
  AstroGenerationService,
  ASTRO_PROMPT_VERSION,
} from '../astro-generation.service';
import { AstroQuotaService } from '../astro-quota.service';
import { AstroSettingsService } from '../astro-settings.service';
import type { EphemerisProvider } from '../ephemeris/ephemeris-provider';
import { EPHEMERIS_PROVIDER } from '../ephemeris/ephemeris.token';
import { buildVedicChart } from '../vedic/vedic-chart';
import { computeGunaMilan, type MoonPlacement } from './guna-milan';

/**
 * Совместимость двух карт (гуна-милан).
 *
 * Согласие — процесс, целиком внутренний для astro: получатель узнаёт о запросе
 * и подтверждает его здесь же, независимо от того, есть ли между людьми мэтч
 * в Union. Чужая карта целиком (время и место рождения) никогда не раскрывается
 * второй стороне — наружу выходит только Луна: знак, накшатра и посчитанный по
 * ним результат. Именно поэтому нужен собственный расчёт, а не публикация всей
 * чужой карты.
 */
@Injectable()
export class AstroCompatibilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    @Inject(EPHEMERIS_PROVIDER) private readonly ephemeris: EphemerisProvider,
    private readonly generation: AstroGenerationService,
    private readonly quota: AstroQuotaService,
    private readonly settings: AstroSettingsService,
    private readonly events: EventEmitter2,
  ) {}

  async createRequest(
    requesterId: string,
    targetUserId: string,
    purpose: AstroCompatibilityPurpose = 'family',
  ): Promise<AstroCompatibilityRequestDto> {
    if (requesterId === targetUserId) {
      throw new BadRequestException('Нельзя сопоставить карту с самой собой');
    }
    // `CreateAstroCompatibilityRequest` — интерфейс TypeScript, а не
    // class-validator: в рантайме сюда доходит что угодно из тела запроса.
    // Без этой проверки произвольная строка уезжала в Prisma-энум и давала
    // 500 вместо честного 400.
    if (!ASTRO_COMPATIBILITY_PURPOSES.includes(purpose)) {
      throw new BadRequestException('Неизвестная цель сверки карт');
    }

    const [requesterBirth, targetUser, requesterUser] = await Promise.all([
      this.prisma.astroBirthData.findUnique({ where: { userId: requesterId } }),
      this.prisma.user.findUnique({ where: { id: targetUserId } }),
      // Имя нужно уведомлению: событие обязано быть самодостаточным, чтобы
      // подписчик не ходил за ним в чужие таблицы.
      this.prisma.user.findUnique({
        where: { id: requesterId },
        select: { name: true, spiritualName: true },
      }),
    ]);
    if (!requesterBirth) {
      throw new BadRequestException(
        'Сначала заполните собственные данные рождения',
      );
    }
    if (!targetUser) {
      throw new NotFoundException('Пользователь не найден');
    }

    const existing = await this.prisma.astroCompatibilityRequest.findUnique({
      where: {
        requesterId_targetId: { requesterId, targetId: targetUserId },
      },
    });
    if (existing) {
      throw new ConflictException('Запрос уже отправлен');
    }
    // Встречный запрос уже есть — принимаем его вместо дублирования, иначе
    // у одной и той же пары людей возникли бы два независимых pending-запроса.
    const reverse = await this.prisma.astroCompatibilityRequest.findUnique({
      where: {
        requesterId_targetId: {
          requesterId: targetUserId,
          targetId: requesterId,
        },
      },
    });
    if (reverse) {
      return this.respond(requesterId, reverse.id, true);
    }

    const row = await this.prisma.astroCompatibilityRequest.create({
      data: { requesterId, targetId: targetUserId, purpose },
    });
    if (requesterUser) {
      const event = {
        name: 'astro.compatibility.requested',
        recipientId: targetUserId,
        senderName: resolveDisplayName(requesterUser),
      } satisfies NotificationEvent;
      this.events.emit(event.name, event);
    }
    return this.toDto(row, requesterId);
  }

  async respond(
    userId: string,
    requestId: string,
    accept: boolean,
  ): Promise<AstroCompatibilityRequestDto> {
    const row = await this.prisma.astroCompatibilityRequest.findUnique({
      where: { id: requestId },
    });
    if (!row) throw new NotFoundException('Запрос не найден');
    if (row.targetId !== userId) {
      throw new ForbiddenException('Ответить может только получатель запроса');
    }
    if (row.status !== 'pending') {
      throw new ConflictException('Запрос уже обработан');
    }

    if (accept) {
      const targetBirth = await this.prisma.astroBirthData.findUnique({
        where: { userId },
      });
      if (!targetBirth) {
        throw new BadRequestException(
          'Сначала заполните собственные данные рождения',
        );
      }
    }

    const updated = await this.prisma.astroCompatibilityRequest.update({
      where: { id: requestId },
      data: {
        status: accept ? 'accepted' : 'declined',
        respondedAt: new Date(),
      },
    });

    // Об отказе не уведомляем намеренно: «вам отказали» — сообщение, которое
    // ничего не даёт, но задевает. Проситель увидит статус, когда сам зайдёт.
    if (accept) {
      const responder = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, spiritualName: true },
      });
      if (responder) {
        const event = {
          name: 'astro.compatibility.accepted',
          recipientId: updated.requesterId,
          senderName: resolveDisplayName(responder),
        } satisfies NotificationEvent;
        this.events.emit(event.name, event);
      }
    }
    return this.toDto(updated, userId);
  }

  async list(userId: string): Promise<AstroCompatibilityRequestDto[]> {
    const rows = await this.prisma.astroCompatibilityRequest.findMany({
      where: { OR: [{ requesterId: userId }, { targetId: userId }] },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(rows.map((row) => this.toDto(row, userId)));
  }

  async reading(
    userId: string,
    requestId: string,
    locale = 'ru',
  ): Promise<AstroCompatibilityReadingDto> {
    const { row, score } = await this.acceptedRequestFor(userId, requestId);
    const pairKey = await this.pairKeyFor(
      row.requesterId,
      row.targetId,
      row.purpose,
    );

    const cached = await this.prisma.astroCompatibilityReading.findUnique({
      where: {
        pairKey_locale_promptVersion: {
          pairKey,
          locale,
          promptVersion: ASTRO_PROMPT_VERSION,
        },
      },
    });
    if (cached) return { text: cached.text, available: true, blockedBy: null };

    const settings = await this.settings.get();
    if (!settings.aiEnabled) {
      return { text: null, available: false, blockedBy: 'ai_unavailable' };
    }
    const decision = await this.quota.check(userId);
    if (!decision.allowed) {
      return {
        text: null,
        available: false,
        blockedBy:
          decision.reason === 'ai_unavailable'
            ? 'ai_unavailable'
            : 'quota_exhausted',
      };
    }

    const generated = await this.generation.generateCompatibility(
      score,
      locale,
    );

    await this.prisma.astroCompatibilityReading.upsert({
      where: {
        pairKey_locale_promptVersion: {
          pairKey,
          locale,
          promptVersion: ASTRO_PROMPT_VERSION,
        },
      },
      create: {
        pairKey,
        locale,
        promptVersion: ASTRO_PROMPT_VERSION,
        text: generated.text,
        model: generated.model,
        tokensIn: generated.tokensIn,
        tokensOut: generated.tokensOut,
      },
      update: {
        text: generated.text,
        model: generated.model,
        tokensIn: generated.tokensIn,
        tokensOut: generated.tokensOut,
      },
    });
    await this.quota.record(userId, {
      tokensIn: generated.tokensIn,
      tokensOut: generated.tokensOut,
    });

    return { text: generated.text, available: true, blockedBy: null };
  }

  /** Достаёт принятый запрос и пересчитывает гуна-милан заново — расчёт не хранится. */
  private async acceptedRequestFor(userId: string, requestId: string) {
    const row = await this.prisma.astroCompatibilityRequest.findUnique({
      where: { id: requestId },
    });
    if (!row) throw new NotFoundException('Запрос не найден');
    if (row.requesterId !== userId && row.targetId !== userId) {
      throw new ForbiddenException('Доступ только для участников запроса');
    }
    if (row.status !== 'accepted') {
      throw new ConflictException(
        'Сопоставление ещё не подтверждено получателем',
      );
    }

    const score = await this.scoreFor(
      row.requesterId,
      row.targetId,
      row.purpose,
    );
    if (!score) {
      throw new ConflictException('Не удалось рассчитать совместимость');
    }
    return { row, score };
  }

  private async scoreFor(
    userAId: string,
    userBId: string,
    purpose: AstroCompatibilityPurpose,
  ): Promise<GunaMilanScore | null> {
    const [placementA, placementB] = await Promise.all([
      this.moonPlacementOf(userAId),
      this.moonPlacementOf(userBId),
    ]);
    if (!placementA || !placementB) return null;
    return computeGunaMilan(placementA, placementB, purpose);
  }

  /**
   * Сверка двух записей астролога.
   *
   * Согласия не спрашиваем и спрашивать не у кого: обе записи принадлежат
   * тому, кто сверяет. Владелец — в условии запроса, поэтому чужая запись не
   * находится вовсе, и «сверить свою с чужой» невозможно по построению.
   *
   * Пол у записей не хранится, а гана-кута считается по нему: тогда берётся
   * более благоприятное из двух направлений таблицы — тот же запасной путь,
   * что и для участников без указанного пола.
   */
  async compareSubjects(
    ownerId: string,
    aId: string,
    bId: string,
    purpose: AstroCompatibilityPurpose = 'family',
  ): Promise<AstroSubjectPairDto> {
    if (aId === bId) {
      throw new BadRequestException('Нельзя сверить запись саму с собой');
    }

    const [a, b] = await Promise.all([
      this.prisma.astroSubject.findFirst({ where: { id: aId, ownerId } }),
      this.prisma.astroSubject.findFirst({ where: { id: bId, ownerId } }),
    ]);
    if (!a || !b) throw new NotFoundException('Запись не найдена');

    const score = computeGunaMilan(
      this.subjectMoon(a),
      this.subjectMoon(b),
      purpose,
    );

    return {
      a: { id: a.id, name: a.name },
      b: { id: b.id, name: b.name },
      purpose,
      score,
      // Хотя бы у одной записи пол не указан — значит гана-кута посчитана по
      // благоприятному варианту, и об этом надо сказать.
      genderUnknown: a.gender === null || b.gender === null,
    };
  }

  /** Луна записи: тот же расчёт, только момент из другой строки. */
  private subjectMoon(subject: {
    bornAtUtc: Date;
    latitude: number;
    longitude: number;
    timeAccuracy: AstroTimeAccuracy;
    gender: Gender | null;
  }): MoonPlacement {
    const chart = buildVedicChart(this.ephemeris, {
      bornAtUtc: subject.bornAtUtc,
      latitude: subject.latitude,
      longitude: subject.longitude,
      timeAccuracy: subject.timeAccuracy,
    });
    const moon = chart.grahas.find((g) => g.graha === 'moon')!;
    return {
      rashi: moon.rashi,
      nakshatra: moon.nakshatra,
      gender: subject.gender,
    };
  }

  private async moonPlacementOf(userId: string): Promise<MoonPlacement | null> {
    const [birth, user] = await Promise.all([
      this.prisma.astroBirthData.findUnique({ where: { userId } }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { gender: true },
      }),
    ]);
    if (!birth) return null;

    const chart = buildVedicChart(this.ephemeris, {
      bornAtUtc: birth.bornAtUtc,
      latitude: birth.latitude,
      longitude: birth.longitude,
      timeAccuracy: birth.timeAccuracy,
    });
    const moon = chart.grahas.find((g) => g.graha === 'moon')!;
    return {
      rashi: moon.rashi,
      nakshatra: moon.nakshatra,
      gender: user?.gender ?? null,
    };
  }

  /**
   * Ключ кэша ИИ-текста: сортировка отпечатков карт убирает направление пары.
   *
   * Цель входит в ключ: у одной и той же пары разбор ради семьи и ради дела —
   * разные тексты, собранные по разным кутам. Без неё второй запрос получил
   * бы из кэша чужой разбор про брак.
   */
  private async pairKeyFor(
    userAId: string,
    userBId: string,
    purpose: AstroCompatibilityPurpose,
  ): Promise<string> {
    const [birthA, birthB] = await Promise.all([
      this.prisma.astroBirthData.findUniqueOrThrow({
        where: { userId: userAId },
      }),
      this.prisma.astroBirthData.findUniqueOrThrow({
        where: { userId: userBId },
      }),
    ]);
    const fpA = this.fingerprintOf(birthA);
    const fpB = this.fingerprintOf(birthB);
    return [...[fpA, fpB].sort(), purpose].join(':');
  }

  private fingerprintOf(birth: {
    bornAtUtc: Date;
    latitude: number;
    longitude: number;
    timeAccuracy: AstroTimeAccuracy;
  }): string {
    return buildVedicChart(this.ephemeris, {
      bornAtUtc: birth.bornAtUtc,
      latitude: birth.latitude,
      longitude: birth.longitude,
      timeAccuracy: birth.timeAccuracy,
    }).fingerprint;
  }

  private async toDto(
    row: {
      id: string;
      requesterId: string;
      targetId: string;
      status: string;
      purpose: AstroCompatibilityPurpose;
      createdAt: Date;
      respondedAt: Date | null;
    },
    viewerId: string,
  ): Promise<AstroCompatibilityRequestDto> {
    const isRequester = row.requesterId === viewerId;
    const counterpartId = isRequester ? row.targetId : row.requesterId;
    const counterpart = await this.prisma.user.findUnique({
      where: { id: counterpartId },
    });

    const score =
      row.status === 'accepted'
        ? await this.scoreFor(row.requesterId, row.targetId, row.purpose)
        : null;

    return {
      id: row.id,
      status: row.status as AstroCompatibilityRequestDto['status'],
      purpose: row.purpose,
      createdAt: row.createdAt.toISOString(),
      respondedAt: row.respondedAt?.toISOString() ?? null,
      isRequester,
      score,
      counterpart: {
        userId: counterpartId,
        name: counterpart ? resolveDisplayName(counterpart) : '—',
        avatarUrl: counterpart
          ? await this.users.resolveAvatarUrl(counterpart)
          : null,
      },
    };
  }
}
