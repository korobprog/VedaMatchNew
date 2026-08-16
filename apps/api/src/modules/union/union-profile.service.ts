import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  Gender,
  UnionConnectionRequest,
  UnionIntention,
  UnionProfile,
  User,
  UserPhoto,
} from '@prisma/client';
import type {
  ProfileLocation,
  ProfileMessengers,
  ProfileSocialLinks,
  UnionChildrenStatus,
  UnionConnectionSummary,
  UnionDiet,
  UnionEducationLevel,
  UnionGenerableField,
  UnionGenerateTextResponse,
  UnionHousing,
  UnionIncomeLevel,
  UnionIntentionCounts,
  UnionIntentionDto,
  UnionIntentionType,
  UnionPrivacySettings,
  UnionProfileDto,
  UnionProfileState,
  UnionProfileUpdateRequest,
  UnionRecommendation,
  UnionRecommendationFilters,
  UnionRecommendationsResponse,
  UnionRegulativePrinciple,
  UnionSpiritualEducation,
  UnionUserSummary,
} from '@vedamatch/shared';
import { resolveDisplayName } from '@vedamatch/shared';
import { calculateAge, MAX_PROFILE_AGE, MIN_PROFILE_AGE } from '../users/age';
import { computeCompleteness } from './union-completeness';
import { MotivationGenerationService } from '../motivation/motivation-generation.service';
import { ModerationService } from '../moderation/moderation.service';
import { toActivityLevel } from './union-activity';
import { isVerifiedDevotee } from './union-verification';
import { PrismaService } from '../../prisma/prisma.service';
import { UserGalleryService } from '../users/user-gallery.service';
import { UsersService } from '../users/users.service';
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
// Лимиты полей анкеты; веб дублирует их у себя в union-profile-form.tsx.
export const UNION_MIN_HEIGHT_CM = 120;
export const UNION_MAX_HEIGHT_CM = 230;
export const UNION_MAX_STATUS_LENGTH = 120;
// Мягкий предел для сгенерированного «О себе»: короче MAX_ABOUT_LENGTH,
// чтобы черновик не разрастался в стену текста.
const ABOUT_GENERATION_TARGET = 500;
const DIET_VALUES: UnionDiet[] = [
  'vegetarian',
  'vegan',
  'prasadam_only',
  'transitioning',
  'not_vegetarian',
];
const REGULATIVE_PRINCIPLE_VALUES: UnionRegulativePrinciple[] = [
  'no_meat',
  'no_intoxicants',
  'no_gambling',
  'no_illicit_sex',
];
const CHILDREN_STATUS_VALUES: UnionChildrenStatus[] = [
  'none_want',
  'none_not_want',
  'none_undecided',
  'have_living_with',
  'have_living_apart',
];
const EDUCATION_VALUES: UnionEducationLevel[] = [
  'school',
  'vocational',
  'incomplete_higher',
  'higher',
  'academic_degree',
];
const SPIRITUAL_EDUCATION_VALUES: UnionSpiritualEducation[] = [
  'none',
  'temple_courses',
  'bhakti_shastri',
  'bhakti_vaibhava',
  'bhakti_vedanta',
  'other',
];
const HOUSING_VALUES: UnionHousing[] = [
  'own_place',
  'rent',
  'with_parents',
  'with_relatives',
  'community',
  'temple_ashram',
];
const INCOME_VALUES: UnionIncomeLevel[] = [
  'basic_needs_hard',
  'basic_needs',
  'basic_and_rest',
  'comfortable',
  'prefer_not_say',
];
const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 50;
/** Порог веса цели «Создание семьи», начиная с которого включается авто-сужение по полу. */
const FAMILY_GENDER_RESTRICTION_THRESHOLD = 50;

type ProfileWithIntentions = UnionProfile & { intentions: UnionIntention[] };
/** Возраст смотрящего и его пожелания к возрасту партнёра. */
interface MyAgePreference {
  age: number | null;
  ageRangeMin: number | null;
  ageRangeMax: number | null;
}
/** Пол-контекст пользователя для ограничения по цели «Создание семьи». */
interface FamilyGenderContext {
  gender: Gender | null;
  hasFamilyGoal: boolean;
  seeksGender: Gender | null;
}
type UserWithLocation = Pick<User, 'homeLocation'>;
type UserWithPublicPhotos = User & {
  photos: Array<Pick<UserPhoto, 'id' | 'storageKey' | 'width' | 'height'>>;
};
type ConnectionForUser = Pick<
  UnionConnectionRequest,
  | 'id'
  | 'fromUserId'
  | 'toUserId'
  | 'status'
  | 'isSuperlike'
  | 'message'
  | 'createdAt'
  | 'respondedAt'
>;

@Injectable()
export class UnionProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly matching: UnionMatchingService,
    private readonly gallery: UserGalleryService,
    private readonly moderation: ModerationService,
    private readonly generation: MotivationGenerationService,
    private readonly users: UsersService,
  ) {}

  async getState(userId: string): Promise<UnionProfileState> {
    const profile = await this.prisma.unionProfile.findUnique({
      where: { userId },
      include: { intentions: true },
    });
    return this.toState(userId, profile);
  }

  /** Собирает ответ вместе с прогрессом заполнения: фото лежат вне UnionProfile. */
  private async toState(
    userId: string,
    profile: ProfileWithIntentions | null,
  ): Promise<UnionProfileState> {
    const dto = profile ? this.toDto(profile) : null;
    const publicPhotoCount = await this.prisma.userPhoto.count({
      where: { userId, isPublic: true },
    });
    return {
      profile: dto,
      completeness: computeCompleteness(dto, { publicPhotoCount }),
    };
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

    return this.toState(userId, profile);
  }

  /**
   * Черновик статуса/описания по уже заполненным полям анкеты. Без модерации
   * и без сохранения — пользователь сам решает, оставлять ли результат.
   */
  async generateText(
    userId: string,
    field: UnionGenerableField,
  ): Promise<UnionGenerateTextResponse> {
    if (field !== 'status' && field !== 'about') {
      throw new BadRequestException('Недопустимое поле для генерации');
    }
    const [profile, user] = await Promise.all([
      this.prisma.unionProfile.findUnique({
        where: { userId },
        include: { intentions: true },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { spiritualStage: true },
      }),
    ]);
    const context = this.buildGenerationContext(profile, user);
    const maxLength =
      field === 'status' ? UNION_MAX_STATUS_LENGTH : ABOUT_GENERATION_TARGET;
    const instruction =
      field === 'status'
        ? `Напиши короткий статус для профиля знакомств (максимум ${maxLength} символов, одна фраза, без кавычек и хэштегов).`
        : `Напиши тёплый рассказ о себе для профиля знакомств (2-4 коротких предложения, максимум ${maxLength} символов, без списков и хэштегов).`;
    const prompt = [
      'Ты помогаешь человеку заполнить анкету в приложении знакомств для практикующих вайшнавов.',
      'Пиши от первого лица, по-русски, искренне и без клише.',
      'Никогда не выдумывай факты, которых нет в данных ниже — если данных мало, пиши обобщённо.',
      instruction,
      'Данные о человеке:',
      context,
    ].join('\n');
    const text = await this.generation.generatePlainText(prompt, maxLength);
    return { text };
  }

  private buildGenerationContext(
    profile: ProfileWithIntentions | null,
    user: Pick<User, 'spiritualStage'> | null,
  ): string {
    const lines: string[] = [];
    if (user?.spiritualStage)
      lines.push(`Духовный этап: ${user.spiritualStage}`);
    if (profile) {
      if (profile.intentions.length > 0) {
        lines.push(
          `Цель знакомства: ${profile.intentions
            .map((i) => `${i.type} (${i.weight}%)`)
            .join(', ')}`,
        );
      }
      if (profile.interests.length > 0) {
        lines.push(`Интересы: ${profile.interests.join(', ')}`);
      }
      if (profile.values.length > 0) {
        lines.push(`Ценности: ${profile.values.join(', ')}`);
      }
      if (profile.skills.length > 0) {
        lines.push(`Навыки: ${profile.skills.join(', ')}`);
      }
      if (profile.familyStatus) {
        lines.push(`Семейный статус: ${profile.familyStatus}`);
      }
      if (profile.diet) lines.push(`Питание: ${profile.diet}`);
      if (profile.childrenStatus) {
        lines.push(`Дети: ${profile.childrenStatus}`);
      }
      if (profile.housing) lines.push(`Жилищные условия: ${profile.housing}`);
      if (profile.about) lines.push(`Уже написано о себе: ${profile.about}`);
      if (profile.status) lines.push(`Текущий статус: ${profile.status}`);
    }
    return lines.length > 0
      ? lines.join('\n')
      : 'Данных пока нет — напиши что-то универсальное и доброжелательное.';
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
      where: {
        isActive: true,
        userId: { not: userId },
        user: { accountStatus: 'active', pendingDeletionAt: null },
      },
      include: {
        intentions: true,
        user: {
          include: {
            photos: {
              where: { isPublic: true },
              orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
              select: {
                id: true,
                storageKey: true,
                width: true,
                height: true,
              },
            },
          },
        },
      },
    });

    const connections = await this.connectionMap(userId);
    const hidden = await this.moderation.hiddenUserIds(userId, 'union');
    const swiped = await this.swipedUserIds(userId);
    const boosted = await this.boostedUserIds();
    const myInput = this.toMatchInput(me, me.user);
    const myFamilyGender = familyGenderContext(me, me.user.gender);
    const normalizedFilters = this.normalizeFilters(filters);
    const beforeIntentions = others
      .filter((other) => !hidden.has(other.userId))
      .filter((other) => !swiped.has(other.userId))
      .filter((other) => this.hasCompleteLocation(other.user))
      .filter((other) =>
        this.matchesFilters(
          other,
          other.user,
          normalizedFilters,
          myInput,
          {
            age: calculateAge(me.user.birthDate),
            ageRangeMin: me.ageRangeMin,
            ageRangeMax: me.ageRangeMax,
          },
          myFamilyGender,
        ),
      )
      .map((other) => ({
        other,
        recommendation: this.toRecommendation(
          userId,
          myInput,
          other,
          other.user,
          connections.get(other.userId) ?? null,
        ),
      }))
      .filter(
        ({ recommendation }) =>
          normalizedFilters.minScore == null ||
          recommendation.compatibility.total >= normalizedFilters.minScore,
      );

    // Счётчики берём до фильтра целей и после всех остальных: чип должен
    // обещать ровно то, что человек увидит, нажав на него.
    const intentionCounts = this.countIntentions(
      beforeIntentions.map(({ other }) => other),
    );
    const selectedIntentions = normalizedFilters.intentions;
    const recommendations = (
      selectedIntentions
        ? beforeIntentions.filter(({ other }) =>
            other.intentions.some((i) =>
              selectedIntentions.includes(i.type as UnionIntentionType),
            ),
          )
        : beforeIntentions
    ).sort((a, b) => {
        // Активное «Внимание» поднимает анкету над остальными.
        const byBoost =
          Number(boosted.has(b.other.userId)) -
          Number(boosted.has(a.other.userId));
        if (byBoost !== 0) return byBoost;
        if (normalizedFilters.sort === 'new') {
          const byFresh =
            b.other.createdAt.getTime() - a.other.createdAt.getTime();
          if (byFresh !== 0) return byFresh;
        }
        const byScore =
          b.recommendation.compatibility.total -
          a.recommendation.compatibility.total;
        if (byScore !== 0) return byScore;
        // При равной совместимости выше идут подтверждённые администрацией.
        return (
          Number(b.recommendation.user.isVerifiedDevotee) -
          Number(a.recommendation.user.isVerifiedDevotee)
        );
      });

    const page = normalizedFilters.page ?? 1;
    const pageSize = normalizedFilters.pageSize ?? DEFAULT_PAGE_SIZE;
    const total = recommendations.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;

    const pageItems = recommendations.slice(start, start + pageSize);

    return {
      items: await Promise.all(
        pageItems.map(({ recommendation, other }) =>
          this.withPublicPhotos(recommendation, other, other.user),
        ),
      ),
      total,
      page: safePage,
      pageSize,
      totalPages,
      intentionCounts,
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
      include: {
        intentions: true,
        user: {
          include: {
            photos: {
              where: { isPublic: true },
              orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
              select: {
                id: true,
                storageKey: true,
                width: true,
                height: true,
              },
            },
          },
        },
      },
    });
    const connection = await this.connectionBetween(userId, targetUserId);
    if (!other || (!other.isActive && connection?.status !== 'accepted')) {
      throw new NotFoundException('Профиль не найден');
    }
    // Скрытый профиль не должен открываться и по прямой ссылке. Отвечаем 404,
    // а не 403: 403 подтвердил бы, что человек существует и просто избегает.
    if (await this.moderation.isHidden(userId, targetUserId, 'union')) {
      throw new NotFoundException('Профиль не найден');
    }

    const recommendation = this.toRecommendation(
      userId,
      this.toMatchInput(me, me.user),
      other,
      other.user,
      connection,
    );
    return this.withPublicPhotos(recommendation, other, other.user);
  }

  private async withPublicPhotos(
    recommendation: UnionRecommendation,
    profile: ProfileWithIntentions,
    user: UserWithPublicPhotos,
  ): Promise<UnionRecommendation> {
    const privacy = (profile.privacy as UnionPrivacySettings | null) ?? null;
    const matched = recommendation.connection?.status === 'accepted';
    if (!this.isVisible(privacy?.photo, matched)) return recommendation;

    if (user.photos.length > 0) {
      recommendation.user.photos = await this.gallery.signPublicPhotos(
        user.photos,
      );
      recommendation.user.avatarUrl = null;
    } else {
      // Публичной галереи нет — остаётся аватар, а он может быть загружен в
      // приватный бакет (см. UsersService.resolveAvatarUrl) и требует подписи.
      recommendation.user.avatarUrl = await this.users.resolveAvatarUrl(user);
    }
    return recommendation;
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
      name: resolveDisplayName(otherUser),
      avatarUrl: this.isVisible(privacy?.photo, matched)
        ? otherUser.avatarUrl
        : null,
      city: cityVisible ? (location?.city ?? null) : null,
      country: cityVisible ? (location?.country ?? null) : null,
      spiritualStage: otherUser.spiritualStage,
      age: this.isVisible(privacy?.age, matched)
        ? calculateAge(otherUser.birthDate)
        : null,
      activity: toActivityLevel(otherUser.lastSeenAt),
      isVerifiedDevotee: isVerifiedDevotee(otherUser),
      isPhotoVerified: otherUser.photoVerifiedAt !== null,
      photos: [],
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
        status: other.status,
        heightCm: other.heightCm,
        diet: other.diet,
        regulativePrinciples: other.regulativePrinciples,
        childrenStatus: other.childrenStatus,
        education: other.education,
        spiritualEducation: other.spiritualEducation,
        housing: other.housing,
        income: other.income,
        pets: other.pets,
        ageRangeMin: other.ageRangeMin,
        ageRangeMax: other.ageRangeMax,
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

  /**
   * Кого человек уже отсмотрел в колоде. Откатанные свайпы (`undoneAt`)
   * не учитываются — такие анкеты сознательно возвращают в выдачу.
   */
  private async swipedUserIds(userId: string): Promise<Set<string>> {
    const rows = await this.prisma.unionSwipe.findMany({
      where: { fromUserId: userId, undoneAt: null },
      select: { toUserId: true },
    });
    return new Set(rows.map((row) => row.toUserId));
  }

  /** Чьи анкеты сейчас подняты бустом «Внимание». */
  private async boostedUserIds(): Promise<Set<string>> {
    const rows = await this.prisma.unionBoost.findMany({
      where: { expiresAt: { gt: new Date() } },
      select: { userId: true },
    });
    return new Set(rows.map((row) => row.userId));
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
      isSuperlike: connection.isSuperlike,
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
      intentions: normalizeIntentions(filters),
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
      gender: ['male', 'female'].includes(String(filters.gender))
        ? filters.gender
        : undefined,
      ageMin: clampInteger(filters.ageMin, MIN_PROFILE_AGE, MAX_PROFILE_AGE),
      ageMax: clampInteger(filters.ageMax, MIN_PROFILE_AGE, MAX_PROFILE_AGE),
      diet: DIET_VALUES.includes(filters.diet as UnionDiet)
        ? filters.diet
        : undefined,
      principlesMin: clampInteger(filters.principlesMin, 1, 4),
      childrenStatus: CHILDREN_STATUS_VALUES.includes(
        filters.childrenStatus as UnionChildrenStatus,
      )
        ? filters.childrenStatus
        : undefined,
      verifiedOnly: filters.verifiedOnly === true,
      photoVerifiedOnly: filters.photoVerifiedOnly === true,
      format: ['online', 'offline', 'any'].includes(String(filters.format))
        ? filters.format
        : undefined,
      language: cleanFilterText(filters.language),
      sort: filters.sort === 'new' ? 'new' : 'match',
      minScore: clampInteger(filters.minScore, 1, 100),
      page,
      pageSize,
    };
  }

  /** Анкета с несколькими целями попадает в каждый счётчик: чипы работают
   *  как ИЛИ, поэтому сумма по целям законно больше `all`. */
  private countIntentions(
    profiles: ProfileWithIntentions[],
  ): UnionIntentionCounts {
    const counts: UnionIntentionCounts = {
      all: profiles.length,
      family: 0,
      business: 0,
      friendship: 0,
      service: 0,
    };
    for (const profile of profiles) {
      for (const type of new Set(profile.intentions.map((i) => i.type))) {
        counts[type as UnionIntentionType] += 1;
      }
    }
    return counts;
  }

  private matchesFilters(
    profile: ProfileWithIntentions,
    user: User,
    filters: UnionRecommendationFilters,
    myInput: UnionMatchInput,
    myAge: MyAgePreference,
    myFamilyGender: FamilyGenderContext,
  ): boolean {
    if (filters.stage && user.spiritualStage !== filters.stage) return false;
    // Пол не указан — профиль не проходит явно заданный фильтр, как и с возрастом.
    if (filters.gender && user.gender !== filters.gender) return false;
    if (
      !passesFamilyGenderRestriction(
        myFamilyGender,
        familyGenderContext(profile, user.gender),
      )
    ) {
      return false;
    }
    if (filters.verifiedOnly && !isVerifiedDevotee(user)) return false;
    if (filters.photoVerifiedOnly && user.photoVerifiedAt === null)
      return false;

    const candidateAge = calculateAge(user.birthDate);
    if (filters.ageMin != null || filters.ageMax != null) {
      // Возраст не указан — профиль не проходит явно заданный диапазон.
      if (candidateAge === null) return false;
      if (filters.ageMin != null && candidateAge < filters.ageMin) return false;
      if (filters.ageMax != null && candidateAge > filters.ageMax) return false;
    }

    // Желаемый возраст партнёра из анкет работает в обе стороны: и мой, и его.
    // Возраст кандидата неизвестен — это неявный, не выбранный им самим
    // фильтр, поэтому не отсеиваем: явное несоответствие возраста ловится
    // только когда обе стороны его указали.
    if (
      candidateAge !== null &&
      (myAge.ageRangeMin != null || myAge.ageRangeMax != null)
    ) {
      if (myAge.ageRangeMin != null && candidateAge < myAge.ageRangeMin) {
        return false;
      }
      if (myAge.ageRangeMax != null && candidateAge > myAge.ageRangeMax) {
        return false;
      }
    }
    // Свой возраст неизвестен — судить о чужих предпочтениях не по чему.
    if (
      myAge.age !== null &&
      (profile.ageRangeMin != null || profile.ageRangeMax != null)
    ) {
      if (profile.ageRangeMin != null && myAge.age < profile.ageRangeMin) {
        return false;
      }
      if (profile.ageRangeMax != null && myAge.age > profile.ageRangeMax) {
        return false;
      }
    }

    // Питание не указано — профиль не проходит явно заданный фильтр.
    if (filters.diet && profile.diet !== filters.diet) return false;
    if (
      filters.principlesMin != null &&
      profile.regulativePrinciples.length < filters.principlesMin
    ) {
      return false;
    }
    if (
      filters.childrenStatus &&
      profile.childrenStatus !== filters.childrenStatus
    ) {
      return false;
    }
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
      if (filterCountry && !candidateCountry.includes(filterCountry))
        return false;
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
      diet: profile.diet,
      regulativePrinciples: profile.regulativePrinciples,
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
    // Затираем только то, что клиент прислал явно: анкета сохраняется
    // по одному полю за раз. Незаполненные поля берут default из схемы.
    const data: Omit<Prisma.UnionProfileUncheckedCreateInput, 'userId'> = {};
    if (body.about !== undefined) data.about = body.about?.trim() || null;
    if (body.relocationReady !== undefined) {
      data.relocationReady = body.relocationReady;
    }
    if (body.format !== undefined) data.format = body.format;
    if (body.languages !== undefined) {
      data.languages = this.cleanList(body.languages, 'Языки');
    }
    if (body.skills !== undefined) {
      data.skills = this.cleanList(body.skills, 'Навыки');
    }
    if (body.interests !== undefined) {
      data.interests = this.cleanList(body.interests, 'Интересы');
    }
    if (body.values !== undefined) {
      data.values = this.cleanList(body.values, 'Ценности');
    }
    if (body.familyStatus !== undefined) {
      data.familyStatus = body.familyStatus?.trim() || null;
    }
    if (body.privacy !== undefined) {
      data.privacy = this.validatePrivacy(body.privacy);
    }
    if (body.isActive !== undefined) data.isActive = body.isActive;
    if (body.requestsFromVerifiedOnly !== undefined) {
      data.requestsFromVerifiedOnly = body.requestsFromVerifiedOnly;
    }
    if (body.familySeeksGender !== undefined) {
      if (
        body.familySeeksGender !== null &&
        body.familySeeksGender !== 'male' &&
        body.familySeeksGender !== 'female'
      ) {
        throw new BadRequestException('Неизвестный пол в цели знакомства');
      }
      data.familySeeksGender = body.familySeeksGender;
    }
    if (body.contactMode !== undefined) {
      if (
        body.contactMode !== 'requests' &&
        body.contactMode !== 'mutual_only'
      ) {
        throw new BadRequestException('Неизвестный режим знакомства');
      }
      data.contactMode = body.contactMode;
    }
    Object.assign(data, this.validateDetails(body));
    return data;
  }

  /**
   * Поля блока «О себе». В отличие от старых полей затираются только те,
   * что клиент прислал явно: анкета сохраняется по одному полю за раз.
   */
  private validateDetails(
    body: UnionProfileUpdateRequest,
  ): Partial<Prisma.UnionProfileUncheckedCreateInput> {
    const data: Partial<Prisma.UnionProfileUncheckedCreateInput> = {};

    if (body.status !== undefined) {
      const status = body.status?.trim() || null;
      if (status && status.length > UNION_MAX_STATUS_LENGTH) {
        throw new BadRequestException(
          `Статус не длиннее ${UNION_MAX_STATUS_LENGTH} символов`,
        );
      }
      data.status = status;
    }
    if (body.heightCm !== undefined) {
      data.heightCm = this.validateHeight(body.heightCm);
    }
    if (body.diet !== undefined) {
      data.diet = this.validateEnum(body.diet, DIET_VALUES, 'Питание');
    }
    if (body.regulativePrinciples !== undefined) {
      data.regulativePrinciples = this.validateEnumList(
        body.regulativePrinciples,
        REGULATIVE_PRINCIPLE_VALUES,
        'Регулирующие принципы',
      );
    }
    if (body.childrenStatus !== undefined) {
      data.childrenStatus = this.validateEnum(
        body.childrenStatus,
        CHILDREN_STATUS_VALUES,
        'Дети',
      );
    }
    if (body.education !== undefined) {
      data.education = this.validateEnum(
        body.education,
        EDUCATION_VALUES,
        'Образование',
      );
    }
    if (body.spiritualEducation !== undefined) {
      data.spiritualEducation = this.validateEnum(
        body.spiritualEducation,
        SPIRITUAL_EDUCATION_VALUES,
        'Духовное образование',
      );
    }
    if (body.housing !== undefined) {
      data.housing = this.validateEnum(body.housing, HOUSING_VALUES, 'Уклад');
    }
    if (body.income !== undefined) {
      data.income = this.validateEnum(
        body.income,
        INCOME_VALUES,
        'Обеспеченность',
      );
    }
    if (body.pets !== undefined) {
      data.pets = this.cleanList(body.pets, 'Домашние животные');
    }
    if (body.ageRangeMin !== undefined || body.ageRangeMax !== undefined) {
      const range = this.validateAgeRange(body.ageRangeMin, body.ageRangeMax);
      data.ageRangeMin = range.min;
      data.ageRangeMax = range.max;
    }

    return data;
  }

  private validateHeight(value: number | null | undefined): number | null {
    if (value == null) return null;
    if (
      !Number.isInteger(value) ||
      value < UNION_MIN_HEIGHT_CM ||
      value > UNION_MAX_HEIGHT_CM
    ) {
      throw new BadRequestException(
        `Рост должен быть целым числом от ${UNION_MIN_HEIGHT_CM} до ${UNION_MAX_HEIGHT_CM} см`,
      );
    }
    return value;
  }

  private validateAgeRange(
    min: number | null | undefined,
    max: number | null | undefined,
  ): { min: number | null; max: number | null } {
    const clean = (value: number | null | undefined): number | null => {
      if (value == null) return null;
      if (
        !Number.isInteger(value) ||
        value < MIN_PROFILE_AGE ||
        value > MAX_PROFILE_AGE
      ) {
        throw new BadRequestException(
          `Возраст партнёра должен быть от ${MIN_PROFILE_AGE} до ${MAX_PROFILE_AGE} лет`,
        );
      }
      return value;
    };
    const cleanMin = clean(min);
    const cleanMax = clean(max);
    if (cleanMin != null && cleanMax != null && cleanMin > cleanMax) {
      throw new BadRequestException('Нижняя граница возраста больше верхней');
    }
    return { min: cleanMin, max: cleanMax };
  }

  private validateEnum<T extends string>(
    value: T | null | undefined,
    allowed: T[],
    label: string,
  ): T | null {
    if (value == null) return null;
    if (!allowed.includes(value)) {
      throw new BadRequestException(`${label}: недопустимое значение`);
    }
    return value;
  }

  private validateEnumList<T extends string>(
    values: T[] | null | undefined,
    allowed: T[],
    label: string,
  ): T[] {
    if (values == null) return [];
    if (!Array.isArray(values)) {
      throw new BadRequestException(`${label}: ожидается список`);
    }
    for (const value of values) {
      if (!allowed.includes(value)) {
        throw new BadRequestException(`${label}: недопустимое значение`);
      }
    }
    return [...new Set(values)];
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
      status: profile.status,
      heightCm: profile.heightCm,
      diet: profile.diet,
      regulativePrinciples: profile.regulativePrinciples,
      childrenStatus: profile.childrenStatus,
      education: profile.education,
      spiritualEducation: profile.spiritualEducation,
      housing: profile.housing,
      income: profile.income,
      pets: profile.pets,
      ageRangeMin: profile.ageRangeMin,
      ageRangeMax: profile.ageRangeMax,
      privacy: (profile.privacy as UnionPrivacySettings | null) ?? null,
      isActive: profile.isActive,
      requestsFromVerifiedOnly: profile.requestsFromVerifiedOnly,
      contactMode: profile.contactMode,
      familySeeksGender: profile.familySeeksGender,
      intentions: profile.intentions.map((i) => ({
        type: i.type,
        weight: i.weight,
      })),
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
    };
  }
}

function hasFamilyIntention(
  intentions: Array<Pick<UnionIntention, 'type' | 'weight'>>,
): boolean {
  return intentions.some(
    (intention) => intention.type === 'family' && intention.weight > 0,
  );
}

function familyGenderContext(
  profile: {
    intentions: Array<Pick<UnionIntention, 'type' | 'weight'>>;
    familySeeksGender: Gender | null;
  },
  gender: Gender | null,
): FamilyGenderContext {
  return {
    gender,
    hasFamilyGoal: hasFamilyIntention(profile.intentions),
    seeksGender: profile.familySeeksGender,
  };
}

/** Пол ищут только вместе с целью «Создание семьи»: снял цель — снял и
 *  ограничение, отдельно его выключать не нужно. */
function isFamilyGenderRestricted(context: FamilyGenderContext): boolean {
  return context.hasFamilyGoal && context.seeksGender != null;
}

/**
 * Односторонняя проверка на пару «зритель, кандидат»: выбранный пол у ЛЮБОЙ
 * из сторон сужает пару. Не требует, чтобы ограничение было активно у обоих —
 * иначе ищущий семью попадал бы в ленты тех, кому он заведомо не подходит.
 */
function passesFamilyGenderRestriction(
  viewer: FamilyGenderContext,
  candidate: FamilyGenderContext,
): boolean {
  // Пол второй стороны не указан — соответствие проверить нечем, поэтому
  // такая анкета в сужённую ленту не попадает.
  if (isFamilyGenderRestricted(viewer) && candidate.gender !== viewer.seeksGender) {
    return false;
  }
  if (isFamilyGenderRestricted(candidate) && viewer.gender !== candidate.seeksGender) {
    return false;
  }
  return true;
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

/** Принимает и новый список целей, и старый одиночный параметр из
 *  сохранённых ссылок. Пустой список — то же самое, что фильтра нет. */
function normalizeIntentions(
  filters: UnionRecommendationFilters,
): UnionIntentionType[] | undefined {
  const raw = Array.isArray(filters.intentions)
    ? filters.intentions
    : filters.intention
      ? [filters.intention]
      : [];
  const valid = INTENTION_TYPES.filter((type) => raw.includes(type));
  return valid.length > 0 ? valid : undefined;
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
