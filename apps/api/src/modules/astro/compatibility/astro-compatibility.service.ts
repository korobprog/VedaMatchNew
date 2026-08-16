import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AstroCompatibilityReadingDto,
  AstroCompatibilityRequestDto,
  AstroTimeAccuracy,
  GunaMilanScore,
} from '@vedamatch/shared';
import { resolveDisplayName } from '@vedamatch/shared';
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
  ) {}

  async createRequest(
    requesterId: string,
    targetUserId: string,
  ): Promise<AstroCompatibilityRequestDto> {
    if (requesterId === targetUserId) {
      throw new BadRequestException('Нельзя сопоставить карту с самой собой');
    }

    const [requesterBirth, targetUser] = await Promise.all([
      this.prisma.astroBirthData.findUnique({ where: { userId: requesterId } }),
      this.prisma.user.findUnique({ where: { id: targetUserId } }),
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
      data: { requesterId, targetId: targetUserId },
    });
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
    const pairKey = await this.pairKeyFor(row.requesterId, row.targetId);

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

    const score = await this.scoreFor(row.requesterId, row.targetId);
    if (!score) {
      throw new ConflictException('Не удалось рассчитать совместимость');
    }
    return { row, score };
  }

  private async scoreFor(
    userAId: string,
    userBId: string,
  ): Promise<GunaMilanScore | null> {
    const [placementA, placementB] = await Promise.all([
      this.moonPlacementOf(userAId),
      this.moonPlacementOf(userBId),
    ]);
    if (!placementA || !placementB) return null;
    return computeGunaMilan(placementA, placementB);
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

  /** Ключ кэша ИИ-текста: сортировка отпечатков карт убирает направление пары. */
  private async pairKeyFor(userAId: string, userBId: string): Promise<string> {
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
    return [fpA, fpB].sort().join(':');
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
        ? await this.scoreFor(row.requesterId, row.targetId)
        : null;

    return {
      id: row.id,
      status: row.status as AstroCompatibilityRequestDto['status'],
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
