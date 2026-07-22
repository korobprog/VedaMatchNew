import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  UnionConnectionRequest,
  UnionIntention,
  UnionProfile,
  User,
} from '@prisma/client';
import type {
  ProfileLocation,
  ProfileMessengers,
  ProfileSocialLinks,
  UnionConnectionSummary,
  UnionIntentionDto,
  UnionIntentionType,
  UnionPrivacySettings,
  UnionProfileDto,
  UnionProfileState,
  UnionProfileUpdateRequest,
  UnionRecommendation,
  UnionRecommendationFilters,
  UnionRecommendationsResponse,
  UnionUserSummary,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  UnionMatchingService,
  UnionMatchInput,
} from './union-matching.service';

const INTENTION_TYPES: UnionIntentionType[] = [
  'family',
  'business',
  'friendship',
  'service',
];
const MAX_ABOUT_LENGTH = 2000;
const MAX_LIST_ITEMS = 30;
const MAX_ITEM_LENGTH = 100;
const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 50;

type ProfileWithIntentions = UnionProfile & { intentions: UnionIntention[] };
type UserWithLocation = Pick<User, 'homeLocation'>;
type ConnectionForUser = Pick<
  UnionConnectionRequest,
  | 'id'
  | 'fromUserId'
  | 'toUserId'
  | 'status'
  | 'message'
  | 'createdAt'
  | 'respondedAt'
>;

@Injectable()
export class UnionProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly matching: UnionMatchingService,
  ) {}

  async getState(userId: string): Promise<UnionProfileState> {
    const profile = await this.prisma.unionProfile.findUnique({
      where: { userId },
      include: { intentions: true },
    });
    return { profile: profile ? this.toDto(profile) : null };
  }

  async upsertProfile(
    userId: string,
    body: UnionProfileUpdateRequest,
  ): Promise<UnionProfileState> {
    await this.requireUserLocation(userId);
    const intentions = this.validateIntentions(body.intentions);
    const data = this.validateProfileFields(body);

    const profile = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.unionProfile.upsert({
        where: { userId },
        create: { userId, ...data },
        update: data,
      });
      await tx.unionIntention.deleteMany({ where: { profileId: saved.id } });
      await tx.unionIntention.createMany({
        data: intentions.map((i) => ({
          profileId: saved.id,
          type: i.type,
          weight: i.weight,
        })),
      });
      return tx.unionProfile.findUniqueOrThrow({
        where: { id: saved.id },
        include: { intentions: true },
      });
    });

    return { profile: this.toDto(profile) };
  }

  async getRecommendations(
    userId: string,
    filters: UnionRecommendationFilters = {},
  ): Promise<UnionRecommendationsResponse> {
    const me = await this.prisma.unionProfile.findUnique({
      where: { userId },
      include: { intentions: true, user: true },
    });
    if (!me) {
      throw new NotFoundException('Сначала заполните профиль Union');
    }
    this.requireLocation(me.user);

    const others = await this.prisma.unionProfile.findMany({
      where: { isActive: true, userId: { not: userId } },
      include: { intentions: true, user: true },
    });

    const connections = await this.connectionMap(userId);
    const myInput = this.toMatchInput(me, me.user);
    const normalizedFilters = this.normalizeFilters(filters);
    const recommendations = others
      .filter((other) => this.hasCompleteLocation(other.user))
      .filter((other) =>
        this.matchesFilters(other, other.user, normalizedFilters, myInput),
      )
      .map((other) =>
        this.toRecommendation(
          userId,
          myInput,
          other,
          other.user,
          connections.get(other.userId) ?? null,
        ),
      )
      .sort((a, b) => b.compatibility.total - a.compatibility.total);

    const page = normalizedFilters.page ?? 1;
    const pageSize = normalizedFilters.pageSize ?? DEFAULT_PAGE_SIZE;
    const total = recommendations.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;

    return {
      items: recommendations.slice(start, start + pageSize),
      total,
      page: safePage,
      pageSize,
      totalPages,
    };
  }

  async getRecommendationForUser(
    userId: string,
    targetUserId: string,
  ): Promise<UnionRecommendation> {
    const me = await this.prisma.unionProfile.findUnique({
      where: { userId },
      include: { intentions: true, user: true },
    });
    if (!me) throw new NotFoundException('Сначала заполните профиль Union');
    this.requireLocation(me.user);

    const other = await this.prisma.unionProfile.findUnique({
      where: { userId: targetUserId },
      include: { intentions: true, user: true },
    });
    const connection = await this.connectionBetween(userId, targetUserId);
    if (!other || (!other.isActive && connection?.status !== 'accepted')) {
      throw new NotFoundException('Профиль не найден');
    }

    return this.toRecommendation(
      userId,
      this.toMatchInput(me, me.user),
      other,
      other.user,
      connection,
    );
  }

  private toRecommendation(
    currentUserId: string,
    myInput: UnionMatchInput,
    other: ProfileWithIntentions,
    otherUser: User,
    connection: ConnectionForUser | null,
  ): UnionRecommendation {
    const location = this.location(otherUser);
    const privacy = (other.privacy as UnionPrivacySettings | null) ?? null;
    const matched = connection?.status === 'accepted';
    const cityVisible = this.isVisible(privacy?.city, matched);
    const summary: UnionUserSummary = {
      id: otherUser.id,
      name: otherUser.name,
      avatarUrl: this.isVisible(privacy?.photo, matched)
        ? otherUser.avatarUrl
        : null,
      city: cityVisible ? (location?.city ?? null) : null,
      country: cityVisible ? (location?.country ?? null) : null,
      spiritualStage: otherUser.spiritualStage,
      contacts: this.visibleContacts(otherUser, privacy, matched),
    };
    return {
      user: summary,
      profile: {
        about: other.about,
        format: other.format,
        relocationReady: other.relocationReady,
        languages: other.languages,
        skills: other.skills,
        interests: other.interests,
        values: other.values,
        intentions: other.intentions.map((i) => ({
          type: i.type,
          weight: i.weight,
        })),
      },
      compatibility: this.matching.computeCompatibility(
        myInput,
        this.toMatchInput(other, otherUser),
      ),
      connection: connection
        ? this.toConnectionSummary(connection, currentUserId)
        : null,
    };
  }

  private async connectionMap(
    userId: string,
  ): Promise<Map<string, ConnectionForUser>> {
    const rows = await this.prisma.unionConnectionRequest.findMany({
      where: { OR: [{ fromUserId: userId }, { toUserId: userId }] },
      orderBy: { createdAt: 'desc' },
    });
    const map = new Map<string, ConnectionForUser>();
    for (const row of rows) {
      const otherUserId =
        row.fromUserId === userId ? row.toUserId : row.fromUserId;
      if (!map.has(otherUserId) || row.status === 'accepted') {
        map.set(otherUserId, row);
      }
    }
    return map;
  }

  private connectionBetween(userId: string, targetUserId: string) {
    return this.prisma.unionConnectionRequest.findFirst({
      where: {
        OR: [
          { fromUserId: userId, toUserId: targetUserId },
          { fromUserId: targetUserId, toUserId: userId },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private toConnectionSummary(
    connection: ConnectionForUser,
    currentUserId: string,
  ): UnionConnectionSummary {
    return {
      id: connection.id,
      status: connection.status,
      direction:
        connection.fromUserId === currentUserId ? 'outgoing' : 'incoming',
      message: connection.message,
      createdAt: connection.createdAt.toISOString(),
      respondedAt: connection.respondedAt?.toISOString() ?? null,
    };
  }

  private normalizeFilters(
    filters: UnionRecommendationFilters,
  ): UnionRecommendationFilters {
    const page = clampInteger(filters.page, 1, 10_000) ?? 1;
    const pageSize =
      clampInteger(filters.pageSize, 1, MAX_PAGE_SIZE) ?? DEFAULT_PAGE_SIZE;
    return {
      intention: INTENTION_TYPES.includes(
        filters.intention as UnionIntentionType,
      )
        ? filters.intention
        : undefined,
      city: cleanFilterText(filters.city),
      country: cleanFilterText(filters.country),
      lat: validLat(filters.lat) ? filters.lat : undefined,
      lon: validLon(filters.lon) ? filters.lon : undefined,
      radiusKm: clampNumber(filters.radiusKm, 1, 20_000),
      stage: ['seeker', 'practitioner', 'yogi', 'devotee'].includes(
        String(filters.stage),
      )
        ? filters.stage
        : undefined,
      format: ['online', 'offline', 'any'].includes(String(filters.format))
        ? filters.format
        : undefined,
      language: cleanFilterText(filters.language),
      page,
      pageSize,
    };
  }

  private matchesFilters(
    profile: ProfileWithIntentions,
    user: User,
    filters: UnionRecommendationFilters,
    myInput: UnionMatchInput,
  ): boolean {
    if (
      filters.intention &&
      !profile.intentions.some((i) => i.type === filters.intention)
    ) {
      return false;
    }
    if (filters.stage && user.spiritualStage !== filters.stage) return false;
    if (
      filters.format &&
      filters.format !== 'any' &&
      profile.format !== 'any' &&
      profile.format !== filters.format
    ) {
      return false;
    }
    if (filters.language) {
      const needle = normalizeText(filters.language);
      const hasLanguage = profile.languages.some((language) =>
        normalizeText(language).includes(needle),
      );
      if (!hasLanguage) return false;
    }

    const location = this.location(user);
    if (filters.city) {
      const candidateCity = normalizeText(location?.city);
      const candidateCountry = normalizeText(location?.country);
      const filterCity = normalizeText(filters.city);
      const filterCountry = normalizeText(filters.country);
      if (!candidateCity.includes(filterCity)) return false;
      if (filterCountry && candidateCountry !== filterCountry) return false;
    }

    if (filters.radiusKm) {
      const centerLat = filters.lat ?? myInput.lat;
      const centerLon = filters.lon ?? myInput.lon;
      const otherLat = location?.lat;
      const otherLon = location?.lon;
      if (!validLat(centerLat) || !validLon(centerLon)) return false;
      if (!validLat(otherLat) || !validLon(otherLon)) return false;
      if (
        haversineKm(centerLat, centerLon, otherLat, otherLon) > filters.radiusKm
      ) {
        return false;
      }
    }

    return true;
  }

  private visibleContacts(
    user: User,
    privacy: UnionPrivacySettings | null,
    matched: boolean,
  ) {
    if (!matched || privacy?.contacts === 'hidden') return null;
    return {
      socialLinks: (user.socialLinks as ProfileSocialLinks | null) ?? {},
      messengers: (user.messengers as ProfileMessengers | null) ?? {},
    };
  }

  private isVisible(
    level: UnionPrivacySettings[keyof UnionPrivacySettings] | undefined,
    matched: boolean,
  ): boolean {
    if (level === 'hidden') return false;
    if (level === 'after_match') return matched;
    return true;
  }

  private toMatchInput(
    profile: ProfileWithIntentions,
    user: User,
  ): UnionMatchInput {
    const location = this.location(user);
    return {
      intentions: profile.intentions.map((i) => ({
        type: i.type,
        weight: i.weight,
      })),
      spiritualStage: user.spiritualStage,
      interests: profile.interests,
      values: profile.values,
      city: location?.city ?? null,
      country: location?.country ?? null,
      lat: location?.lat ?? null,
      lon: location?.lon ?? null,
      relocationReady: profile.relocationReady,
      format: profile.format,
    };
  }

  private location(user: UserWithLocation): ProfileLocation | null {
    return (user.homeLocation as ProfileLocation | null) ?? null;
  }

  private async requireUserLocation(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { homeLocation: true },
    });
    this.requireLocation(user);
  }

  private requireLocation(user: UserWithLocation | null): void {
    if (!user || !this.hasCompleteLocation(user)) {
      throw new BadRequestException(
        'Укажите страну и город перед использованием Union',
      );
    }
  }

  private hasCompleteLocation(user: UserWithLocation): boolean {
    const location = this.location(user);
    return Boolean(
      location?.city?.trim() &&
      location.country?.trim() &&
      Number.isFinite(location.lat) &&
      Number.isFinite(location.lon),
    );
  }

  private validateIntentions(
    intentions: UnionIntentionDto[] | undefined,
  ): UnionIntentionDto[] {
    if (!Array.isArray(intentions) || intentions.length === 0) {
      throw new BadRequestException('Укажите хотя бы одно намерение');
    }
    const seen = new Set<string>();
    let sum = 0;
    for (const intention of intentions) {
      if (!INTENTION_TYPES.includes(intention.type)) {
        throw new BadRequestException(
          `Неизвестный тип намерения: ${String(intention.type)}`,
        );
      }
      if (seen.has(intention.type)) {
        throw new BadRequestException(
          `Тип намерения указан дважды: ${intention.type}`,
        );
      }
      seen.add(intention.type);
      if (
        !Number.isInteger(intention.weight) ||
        intention.weight < 0 ||
        intention.weight > 100
      ) {
        throw new BadRequestException(
          'Вес намерения должен быть целым числом от 0 до 100',
        );
      }
      sum += intention.weight;
    }
    if (sum !== 100) {
      throw new BadRequestException(
        `Сумма весов намерений должна быть 100, сейчас ${sum}`,
      );
    }
    return intentions.filter((i) => i.weight > 0);
  }

  private validateProfileFields(
    body: UnionProfileUpdateRequest,
  ): Omit<Prisma.UnionProfileUncheckedCreateInput, 'userId'> {
    if (body.about != null && body.about.length > MAX_ABOUT_LENGTH) {
      throw new BadRequestException(
        `Поле «О себе» не длиннее ${MAX_ABOUT_LENGTH} символов`,
      );
    }
    if (
      body.format != null &&
      !['online', 'offline', 'any'].includes(body.format)
    ) {
      throw new BadRequestException('Недопустимый формат общения');
    }
    const data: Omit<Prisma.UnionProfileUncheckedCreateInput, 'userId'> = {
      about: body.about?.trim() || null,
      relocationReady: body.relocationReady ?? false,
      format: body.format ?? 'any',
      languages: this.cleanList(body.languages, 'Языки'),
      skills: this.cleanList(body.skills, 'Навыки'),
      interests: this.cleanList(body.interests, 'Интересы'),
      values: this.cleanList(body.values, 'Ценности'),
      familyStatus: body.familyStatus?.trim() || null,
      privacy: this.validatePrivacy(body.privacy),
    };
    if (body.isActive !== undefined) data.isActive = body.isActive;
    return data;
  }

  private cleanList(list: string[] | undefined, label: string): string[] {
    if (!list) return [];
    if (!Array.isArray(list) || list.length > MAX_LIST_ITEMS) {
      throw new BadRequestException(
        `${label}: не более ${MAX_LIST_ITEMS} значений`,
      );
    }
    const items = list
      .map((item) => String(item).trim())
      .filter((item) => item.length > 0 && item.length <= MAX_ITEM_LENGTH);
    return [...new Set(items)];
  }

  private validatePrivacy(
    privacy: UnionPrivacySettings | null | undefined,
  ): Prisma.InputJsonValue | typeof Prisma.JsonNull {
    if (privacy == null) return Prisma.JsonNull;
    const levels = ['everyone', 'after_match', 'hidden'];
    const result: UnionPrivacySettings = {};
    for (const key of ['photo', 'age', 'city', 'contacts'] as const) {
      const value = privacy[key];
      if (value == null) continue;
      if (!levels.includes(value)) {
        throw new BadRequestException(
          `Недопустимое значение приватности: ${key}`,
        );
      }
      result[key] = value;
    }
    return result as Prisma.InputJsonValue;
  }

  private toDto(profile: ProfileWithIntentions): UnionProfileDto {
    return {
      id: profile.id,
      userId: profile.userId,
      about: profile.about,
      relocationReady: profile.relocationReady,
      format: profile.format,
      languages: profile.languages,
      skills: profile.skills,
      interests: profile.interests,
      values: profile.values,
      familyStatus: profile.familyStatus,
      privacy: (profile.privacy as UnionPrivacySettings | null) ?? null,
      isActive: profile.isActive,
      intentions: profile.intentions.map((i) => ({
        type: i.type,
        weight: i.weight,
      })),
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
    };
  }
}

function cleanFilterText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.trim().slice(0, 120);
  return cleaned || undefined;
}

function normalizeText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

function clampInteger(
  value: unknown,
  min: number,
  max: number,
): number | undefined {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return undefined;
  return Math.min(max, Math.max(min, parsed));
}

function clampNumber(
  value: unknown,
  min: number,
  max: number,
): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.min(max, Math.max(min, parsed));
}

function validLat(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= -90 &&
    value <= 90
  );
}

function validLon(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= -180 &&
    value <= 180
  );
}

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(value: number): number {
  return (value * Math.PI) / 180;
}
