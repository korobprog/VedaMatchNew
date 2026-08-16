import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  ContactsAshram,
  ContactsCardDto,
  ContactsFieldPrivacy,
  ContactsFieldVisibility,
  ContactsFormat,
  ContactsMapResponse,
  ContactsProfileDto,
  ContactsProfileState,
  ContactsProfileStatus,
  ContactsSearchFacet,
  ContactsSearchResponse,
  ContactsTagDto,
  ContactsTagKind,
  ContactsTagsResponse,
  ContactsUpdateProfileRequest,
  ContactsVisibility,
  DevoteeVerificationStatus,
  ProfileLocation,
  ProfileMessengers,
  ProfileSocialLinks,
  SpiritualStage,
} from '@vedamatch/shared';
import {
  CONTACTS_COUNT_THRESHOLD,
  resolveDisplayName,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ModerationService } from '../moderation/moderation.service';
import { NEW_CONTACTS_PROFILE } from './contacts-defaults';
import { calculateAge } from '../users/age';
import { UsersService } from '../users/users.service';
import type { SearchViewer } from './contacts-search-query';
import {
  SEARCH_ORDER_BY,
  buildSearchWhere,
  normalizeLocationKey,
  normalizeSearchFilters,
} from './contacts-search-query';
import { isVerifiedDevotee } from './contacts-verification';

const MAX_HEADLINE_LENGTH = 120;
const MAX_TEXT_LENGTH = 2000;
const MAX_LANGUAGES = 10;
const MAX_LANGUAGE_LENGTH = 40;
const MAX_TAGS = 12;

const VISIBILITIES: ContactsVisibility[] = [
  'everyone',
  'verified_only',
  'same_city',
  'by_link',
  'hidden',
];
const FORMATS: ContactsFormat[] = ['online', 'offline', 'any'];
const ASHRAMS: ContactsAshram[] = [
  'brahmachari',
  'grihastha',
  'vanaprastha',
  'sannyasi',
];
const FIELD_VISIBILITIES: ContactsFieldVisibility[] = ['everyone', 'hidden'];
const FIELD_PRIVACY_KEYS = ['city', 'photo', 'age'] as const;

/** Пользователь портала в объёме, нужном справочнику (всё — read-only). */
interface CardUser {
  id: string;
  name: string;
  spiritualName: string | null;
  avatarUrl: string | null;
  avatarKey: string | null;
  birthDate: Date | null;
  homeLocation: unknown;
  spiritualStage: SpiritualStage | null;
  devoteeVerificationStatus: DevoteeVerificationStatus | null;
  photoVerifiedAt: Date | null;
  socialLinks?: unknown;
  messengers?: unknown;
}

/** Способы связи. Отдаются только по действующему раскрытию, см. `disclosedContacts`. */
export interface ContactsDetails {
  socialLinks: ProfileSocialLinks;
  messengers: ProfileMessengers;
}

interface ProfileRow {
  id: string;
  userId: string;
  headline: string | null;
  about: string | null;
  offers: string | null;
  languages: string[];
  ashram: ContactsAshram | null;
  format: ContactsFormat;
  visibility: ContactsVisibility;
  status: ContactsProfileStatus;
  pausedUntil: Date | null;
  fieldPrivacy: unknown;
  requestsFromVerifiedOnly: boolean;
  createdAt: Date;
  updatedAt: Date;
  tags: { tag: TagRow }[];
}

interface TagRow {
  id: string;
  slug: string;
  kind: ContactsTagKind;
  nameRu: string;
  sortOrder: number;
}

/** Нормализованные значения карточки после валидации запроса. */
interface ProfileValues {
  headline: string | null;
  about: string | null;
  offers: string | null;
  languages: string[];
  ashram: ContactsAshram | null;
  format: ContactsFormat;
  visibility: ContactsVisibility;
  pausedUntil: Date | null;
  fieldPrivacy: ContactsFieldPrivacy | null;
  requestsFromVerifiedOnly: boolean;
}

const PROFILE_INCLUDE = { tags: { include: { tag: true } } } as const;

/**
 * Карточка справочника: своя — целиком, чужая — через модель видимости.
 * Отказ в доступе к чужой карточке всегда 404, см. `getCard`.
 */
@Injectable()
export class ContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moderation: ModerationService,
    private readonly users: UsersService,
  ) {}

  /** Своя карточка целиком: приватность к владельцу не применяется. */
  async getState(userId: string): Promise<ContactsProfileState> {
    const profile = await this.ensureProfile(userId);
    return { profile: profile ? this.toProfileDto(profile) : null };
  }

  /**
   * Гарантирует наличие карточки у пользователя. Вызывается при входе
   * (`AuthService.handleGoogleCallback`) и при открытии своей карточки, так
   * что пользователи, заведённые до бэкфилла или в обход обычного входа,
   * попадают в справочник сами.
   *
   * Гонку двух параллельных входов гасим по уникальному `userId`: P2002
   * означает, что карточку успел создать соседний запрос, и это не ошибка.
   */
  async ensureProfile(userId: string): Promise<ProfileRow | null> {
    const existing = await this.prisma.contactsProfile.findUnique({
      where: { userId },
      include: PROFILE_INCLUDE,
    });
    if (existing) return existing as ProfileRow;

    try {
      return (await this.prisma.contactsProfile.create({
        data: { userId, ...NEW_CONTACTS_PROFILE },
        include: PROFILE_INCLUDE,
      })) as ProfileRow;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return (await this.prisma.contactsProfile.findUnique({
          where: { userId },
          include: PROFILE_INCLUDE,
        })) as ProfileRow | null;
      }
      throw error;
    }
  }

  async upsertProfile(
    userId: string,
    body: ContactsUpdateProfileRequest,
    now: Date = new Date(),
  ): Promise<ContactsProfileDto> {
    const existing = await this.prisma.contactsProfile.findUnique({
      where: { userId },
      include: PROFILE_INCLUDE,
    });
    const values = this.validate(body ?? {}, existing, now);
    const tagIds = await this.validateTagIds(body?.tagIds);

    // Статус выставляет сервер: клиент им управлять не должен. Карточка
    // активна всегда — она заводится вместе с пользователем (см.
    // `contacts-defaults.ts`), и пустой заголовок больше не убирает человека
    // из справочника: раньше сохранение анкеты без заголовка молча роняло
    // карточку в 'draft' и та исчезала из выдачи. Уход из справочника — это
    // осознанный `visibility: 'hidden'`, а не побочный эффект пустого поля.
    // Значение 'pending' (премодерация коммерческих карточек) появится
    // отдельным этапом и здесь намеренно не используется.
    const status: ContactsProfileStatus = 'active';
    const data = {
      ...values,
      status,
      // JSON-поле очищается явным null, иначе Prisma просто пропустит его.
      fieldPrivacy: (values.fieldPrivacy ??
        Prisma.JsonNull) as Prisma.InputJsonValue,
    };

    const saved = await this.prisma.$transaction(async (tx) => {
      const profile = await tx.contactsProfile.upsert({
        where: { userId },
        create: { userId, ...data },
        update: data,
      });

      // Связи пересобираются под переданный список целиком: частичное
      // обновление тегов в этом API не предусмотрено.
      if (tagIds) {
        await tx.contactsProfileTag.deleteMany({
          where: { profileId: profile.id },
        });
        if (tagIds.length > 0) {
          await tx.contactsProfileTag.createMany({
            data: tagIds.map((tagId) => ({ profileId: profile.id, tagId })),
          });
        }
      }

      return tx.contactsProfile.findUnique({
        where: { userId },
        include: PROFILE_INCLUDE,
      });
    });

    if (!saved) throw new NotFoundException('Карточка не найдена');
    return this.toProfileDto(saved);
  }

  async listTags(): Promise<ContactsTagsResponse> {
    const tags = await this.prisma.contactsTag.findMany({
      orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }],
    });
    return { items: tags.map((tag) => this.toTagDto(tag)) };
  }

  /**
   * Чужая карточка. Любая причина отказа — `NotFoundException`, никогда
   * `ForbiddenException`: 403 подтвердил бы, что человек существует и просто
   * не хочет, чтобы его видел именно этот зритель. Для отказавшего в Union
   * это прямая утечка, ради которой вся модель и строилась.
   */
  async getCard(
    viewerId: string,
    ownerId: string,
    now: Date = new Date(),
  ): Promise<ContactsCardDto> {
    const profile = await this.prisma.contactsProfile.findUnique({
      where: { userId: ownerId },
      include: { ...PROFILE_INCLUDE, user: true },
    });
    if (!profile) throw new NotFoundException('Карточка не найдена');

    const owner = profile.user as unknown as CardUser;
    // Владелец видит свою карточку по этому маршруту всегда — ни статус,
    // ни пауза, ни visibility на него не действуют.
    if (viewerId === ownerId) {
      return this.toCardDto(profile, owner, null, null);
    }

    if (profile.status !== 'active') this.notFound();
    if (profile.pausedUntil && profile.pausedUntil.getTime() > now.getTime()) {
      this.notFound();
    }
    if (await this.moderation.isHidden(viewerId, ownerId, 'contacts')) {
      this.notFound();
    }

    await this.ensureVisibleTo(viewerId, profile.visibility, owner);

    return this.toCardDto(
      profile,
      owner,
      this.parseFieldPrivacy(profile.fieldPrivacy),
      // Способы связи открывает только действующее раскрытие. Видимость
      // карточки на это не влияет: карточку видно всем, телефон — по согласию.
      await this.disclosedContacts(ownerId, viewerId, owner),
    );
  }

  /**
   * Контакты владельца для конкретного зрителя: непустой объект только при
   * действующем (не отозванном) раскрытии. Единственное место, где справочник
   * вообще отдаёт способы связи, — поэтому и в `getCard`, и в списке запросов
   * используется именно эта проверка.
   */
  async disclosedContacts(
    ownerId: string,
    viewerId: string,
    owner?: Pick<CardUser, 'socialLinks' | 'messengers'>,
  ): Promise<ContactsDetails | null> {
    if (ownerId === viewerId) return null;
    const disclosure = await this.prisma.contactsDisclosure.findFirst({
      where: { ownerId, viewerId, revokedAt: null },
      select: { id: true },
    });
    if (!disclosure) return null;

    const source =
      owner ??
      (await this.prisma.user.findUnique({
        where: { id: ownerId },
        select: { socialLinks: true, messengers: true },
      }));
    return {
      socialLinks: (source?.socialLinks as ProfileSocialLinks) ?? {},
      messengers: (source?.messengers as ProfileMessengers) ?? {},
    };
  }

  /**
   * Поиск по справочнику.
   *
   * Вся фильтрация видимости выполняется в SQL. Отобрать «всё активное»,
   * а потом выбросить лишнее в памяти нельзя: страницы получились бы дырявыми
   * (на странице из 20 записей осталось бы 14), а `total` и `facets`
   * показывали бы чужие карточки числом. Поэтому одно и то же условие
   * `where` уходит в три запроса: выдача, счётчик, фасеты.
   */
  async search(
    viewerId: string,
    query: Record<string, unknown> | undefined,
    now: Date = new Date(),
  ): Promise<ContactsSearchResponse> {
    const filters = normalizeSearchFilters(query);

    const viewerRow = await this.loadViewer(viewerId);
    if (!viewerRow) throw new NotFoundException('Пользователь не найден');

    const location = this.location(viewerRow.homeLocation);
    const viewer: SearchViewer = {
      id: viewerId,
      isVerifiedDevotee: isVerifiedDevotee(viewerRow),
      cityKey: normalizeLocationKey(location?.city),
      lat: typeof location?.lat === 'number' ? location.lat : null,
      lon: typeof location?.lon === 'number' ? location.lon : null,
    };

    const hiddenUserIds = await this.moderation.hiddenUserIds(
      viewerId,
      'contacts',
    );

    const where = buildSearchWhere({ filters, viewer, hiddenUserIds, now });
    const from = Prisma.sql`
      FROM "ContactsProfile" p
      JOIN "User" u ON u."id" = p."userId"
    `;
    // Фасеты считаются по тем же карточкам, только развёрнутым по тегам:
    // то же условие `where`, добавлен лишь JOIN со связкой тегов.
    const facetFrom = Prisma.sql`
      ${from}
      JOIN "ContactsProfileTag" link ON link."profileId" = p."id"
    `;

    const offset = (filters.page - 1) * filters.pageSize;
    const [ids, totals, facets] = await Promise.all([
      this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT p."id" ${from} WHERE ${where} ${SEARCH_ORDER_BY}
        LIMIT ${filters.pageSize} OFFSET ${offset}
      `),
      this.prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
        SELECT COUNT(*)::int AS count ${from} WHERE ${where}
      `),
      this.prisma.$queryRaw<Array<{ tagId: string; count: number }>>(Prisma.sql`
        SELECT link."tagId" AS "tagId", COUNT(*)::int AS count
        ${facetFrom} WHERE ${where}
        GROUP BY link."tagId"
        ORDER BY count DESC, link."tagId" ASC
      `),
    ]);

    const total = Number(totals[0]?.count ?? 0);
    const items = await this.loadCards(ids.map((row) => row.id));

    return {
      items,
      page: filters.page,
      pageSize: filters.pageSize,
      // hasMore считается по настоящему числу совпадений, а не по тому,
      // что отдано наружу: скрытый порогом total не должен обрывать листание.
      hasMore: offset + items.length < total,
      // Ниже порога точное число не называется. Это удобство интерфейса,
      // а НЕ мера защиты: карточки в выдаче всё равно видны, и посчитать их
      // можно глазами. Настоящая защита — в том, что выдача, total и facets
      // строятся по одному и тому же условию видимости.
      total: total < CONTACTS_COUNT_THRESHOLD ? null : total,
      facets: this.toFacets(facets),
    };
  }

  /**
   * Точки для карты справочника: те же люди, что и в выдаче, свёрнутые по
   * городам. Условие берётся из того же `buildSearchWhere` — карта не имеет
   * права показать город, которого не покажет поиск.
   *
   * Города, а не люди: в профиле хранится город, и его координаты — центр
   * города из геокодера. Отдавать «человека в точке» значило бы обещать
   * точность, которой в данных нет.
   *
   * Приватность города здесь приходится проверять в SQL, а не в DTO: скрытый
   * город не должен попадать даже в агрегат, иначе метка «Омск · 3» выдала бы
   * ровно то, что человек спрятал. Значение `'hidden'` — константа кода,
   * поэтому записано литералом.
   */
  async mapPoints(
    viewerId: string,
    query: Record<string, unknown> | undefined,
    now: Date = new Date(),
  ): Promise<ContactsMapResponse> {
    const filters = normalizeSearchFilters(query);
    const viewerRow = await this.loadViewer(viewerId);
    if (!viewerRow) throw new NotFoundException('Пользователь не найден');

    const location = this.location(viewerRow.homeLocation);
    const viewer: SearchViewer = {
      id: viewerId,
      isVerifiedDevotee: isVerifiedDevotee(viewerRow),
      cityKey: normalizeLocationKey(location?.city),
      lat: typeof location?.lat === 'number' ? location.lat : null,
      lon: typeof location?.lon === 'number' ? location.lon : null,
    };
    const hiddenUserIds = await this.moderation.hiddenUserIds(
      viewerId,
      'contacts',
    );
    const where = buildSearchWhere({ filters, viewer, hiddenUserIds, now });

    const cityShown = Prisma.sql`
      COALESCE(p."fieldPrivacy"->>'city', 'everyone') <> 'hidden'
      AND u."homeLocation"->>'city' IS NOT NULL
      AND jsonb_typeof(u."homeLocation"->'lat') = 'number'
      AND jsonb_typeof(u."homeLocation"->'lon') = 'number'
    `;
    const from = Prisma.sql`
      FROM "ContactsProfile" p
      JOIN "User" u ON u."id" = p."userId"
    `;

    // Координаты усредняются внутри города: у одного города они у всех
    // одинаковые, но подстраховка от разных написаний одного места дешевле,
    // чем метка, уехавшая на пару километров от собственной подписи.
    const [rows, missing] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{
          city: string;
          country: string | null;
          lat: number;
          lon: number;
          count: number;
        }>
      >(Prisma.sql`
        SELECT
          MIN(trim(u."homeLocation"->>'city')) AS city,
          MIN(trim(u."homeLocation"->>'country')) AS country,
          AVG((u."homeLocation"->>'lat')::double precision) AS lat,
          AVG((u."homeLocation"->>'lon')::double precision) AS lon,
          COUNT(*)::int AS count
        ${from}
        WHERE ${where} AND ${cityShown}
        GROUP BY lower(trim(u."homeLocation"->>'city')),
                 lower(trim(coalesce(u."homeLocation"->>'country', '')))
        ORDER BY count DESC, city ASC
      `),
      this.prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
        SELECT COUNT(*)::int AS count ${from}
        WHERE ${where} AND NOT (${cityShown})
      `),
    ]);

    return {
      points: rows.map((row) => ({
        city: row.city,
        country: row.country || null,
        lat: Number(row.lat),
        lon: Number(row.lon),
        count: Number(row.count),
      })),
      withoutLocation: Number(missing[0]?.count ?? 0),
    };
  }

  /**
   * Порог к фасетам НЕ применяется. Они считаются по тому же условию
   * видимости, что и выдача, поэтому ничего сверх неё не раскрывают, а
   * обрезка по порогу просто выкосила бы почти все чипы: в справочнике
   * нормально, когда редким служением занят один человек на город.
   */
  private toFacets(
    rows: Array<{ tagId: string; count: number }>,
  ): ContactsSearchFacet[] {
    return rows.map((row) => ({ tagId: row.tagId, count: Number(row.count) }));
  }

  /**
   * Догрузка карточек по уже отобранным в SQL id. Это только гидратация:
   * ни одна запись здесь не добавляется и не отбрасывается, иначе порядок
   * и счётчики разошлись бы с выдачей.
   */
  private async loadCards(ids: string[]): Promise<ContactsCardDto[]> {
    if (ids.length === 0) return [];
    const profiles = await this.prisma.contactsProfile.findMany({
      where: { id: { in: ids } },
      include: { ...PROFILE_INCLUDE, user: true },
    });
    const byId = new Map(profiles.map((profile) => [profile.id, profile]));

    const cards: ContactsCardDto[] = [];
    for (const id of ids) {
      const profile = byId.get(id);
      if (!profile) continue;
      const owner = profile.user as unknown as CardUser;
      // Своя карточка сюда не попадает (в условии есть `userId <> viewerId`),
      // поэтому приватность полей применяется всегда — как в `getCard`.
      // Контакты в выдаче — всегда null, даже при действующем раскрытии:
      // справочник не отдаёт способы связи пачкой (анти-скрапинг).
      cards.push(
        await this.toCardDto(
          profile,
          owner,
          this.parseFieldPrivacy(profile.fieldPrivacy),
          null,
        ),
      );
    }
    return cards;
  }

  /** Уровень видимости карточки против конкретного зрителя. */
  private async ensureVisibleTo(
    viewerId: string,
    visibility: ContactsVisibility,
    owner: CardUser,
  ): Promise<void> {
    if (visibility === 'hidden') this.notFound();
    // 'by_link' — карточки нет в выдаче, но прямая ссылка (этот маршрут)
    // работает: её человек дал сам.
    if (visibility === 'everyone' || visibility === 'by_link') return;

    const viewer = await this.loadViewer(viewerId);
    if (!viewer) this.notFound();

    if (visibility === 'verified_only') {
      if (!isVerifiedDevotee(viewer)) this.notFound();
      return;
    }

    if (visibility === 'same_city') {
      const viewerCity = this.cityKey(viewer.homeLocation);
      const ownerCity = this.cityKey(owner.homeLocation);
      // Незаполненный город — не совпадение: иначе «мой город» открывал бы
      // карточку всем, у кого локация пустая.
      if (!viewerCity || !ownerCity || viewerCity !== ownerCity) {
        this.notFound();
      }
    }
  }

  private async loadViewer(viewerId: string): Promise<CardUser | null> {
    const viewer = await this.prisma.user.findUnique({
      where: { id: viewerId },
      select: {
        id: true,
        name: true,
        spiritualName: true,
        avatarUrl: true,
        avatarKey: true,
        birthDate: true,
        homeLocation: true,
        spiritualStage: true,
        devoteeVerificationStatus: true,
        photoVerifiedAt: true,
      },
    });
    return viewer ?? null;
  }

  private notFound(): never {
    throw new NotFoundException('Карточка не найдена');
  }

  private async toCardDto(
    profile: ProfileRow,
    owner: CardUser,
    privacy: ContactsFieldPrivacy | null,
    contacts: ContactsDetails | null,
  ): Promise<ContactsCardDto> {
    const location = this.location(owner.homeLocation);
    const cityVisible = privacy?.city !== 'hidden';
    const photoVisible = privacy?.photo !== 'hidden';
    const ageVisible = privacy?.age !== 'hidden';

    return {
      userId: owner.id,
      name: resolveDisplayName(owner),
      headline: profile.headline,
      about: profile.about,
      offers: profile.offers,
      // Аватар может лежать в приватном бакете — ссылку подписывает users.
      avatarUrl: photoVisible ? await this.users.resolveAvatarUrl(owner) : null,
      city: cityVisible ? (location?.city ?? null) : null,
      country: cityVisible ? (location?.country ?? null) : null,
      age: ageVisible ? calculateAge(owner.birthDate) : null,
      languages: profile.languages,
      ashram: profile.ashram,
      format: profile.format,
      spiritualStage: owner.spiritualStage,
      isVerifiedDevotee: isVerifiedDevotee(owner),
      isPhotoVerified: owner.photoVerifiedAt !== null,
      tags: this.sortTags(profile.tags.map((link) => link.tag)).map((tag) =>
        this.toTagDto(tag),
      ),
      // Контакты приходят сюда уже решённым значением: null везде, кроме
      // карточки, открытой действующим раскрытием именно этому зрителю.
      contacts,
    };
  }

  private toProfileDto(profile: ProfileRow): ContactsProfileDto {
    return {
      headline: profile.headline,
      about: profile.about,
      offers: profile.offers,
      languages: profile.languages,
      ashram: profile.ashram,
      format: profile.format,
      visibility: profile.visibility,
      status: profile.status,
      pausedUntil: profile.pausedUntil?.toISOString() ?? null,
      fieldPrivacy: this.parseFieldPrivacy(profile.fieldPrivacy),
      requestsFromVerifiedOnly: profile.requestsFromVerifiedOnly,
      tagIds: this.sortTags(profile.tags.map((link) => link.tag)).map(
        (tag) => tag.id,
      ),
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
    };
  }

  private toTagDto(tag: TagRow): ContactsTagDto {
    return {
      id: tag.id,
      slug: tag.slug,
      kind: tag.kind,
      nameRu: tag.nameRu,
    };
  }

  private sortTags(tags: TagRow[]): TagRow[] {
    return [...tags].sort(
      (a, b) => a.kind.localeCompare(b.kind) || a.sortOrder - b.sortOrder,
    );
  }

  private location(homeLocation: unknown): ProfileLocation | null {
    return (homeLocation as ProfileLocation | null) ?? null;
  }

  /** Город для сравнения: без регистра и краевых пробелов. */
  private cityKey(homeLocation: unknown): string | null {
    const city = this.location(homeLocation)?.city?.trim().toLowerCase();
    return city ? city : null;
  }

  private parseFieldPrivacy(value: unknown): ContactsFieldPrivacy | null {
    return (value as ContactsFieldPrivacy | null) ?? null;
  }

  /**
   * Валидация запроса на своей стороне, как в остальных сервисных модулях:
   * непереданные поля сохраняют прежнее значение, переданные — нормализуются.
   */
  private validate(
    body: ContactsUpdateProfileRequest,
    existing: ProfileRow | null,
    now: Date,
  ): ProfileValues {
    return {
      headline: this.text(
        body,
        'headline',
        existing?.headline ?? null,
        MAX_HEADLINE_LENGTH,
        'Заголовок',
      ),
      about: this.text(
        body,
        'about',
        existing?.about ?? null,
        MAX_TEXT_LENGTH,
        'Описание',
      ),
      offers: this.text(
        body,
        'offers',
        existing?.offers ?? null,
        MAX_TEXT_LENGTH,
        'Чем можете помочь',
      ),
      languages:
        body.languages === undefined
          ? (existing?.languages ?? [])
          : this.languages(body.languages),
      ashram:
        body.ashram === undefined
          ? (existing?.ashram ?? null)
          : this.enumValue(body.ashram, ASHRAMS, 'ашрам'),
      format:
        body.format === undefined
          ? (existing?.format ?? 'any')
          : (this.enumValue(body.format, FORMATS, 'формат') ?? 'any'),
      visibility:
        body.visibility === undefined
          ? (existing?.visibility ?? 'hidden')
          : (this.enumValue(body.visibility, VISIBILITIES, 'видимость') ??
            'hidden'),
      pausedUntil:
        body.pausedUntil === undefined
          ? (existing?.pausedUntil ?? null)
          : this.pausedUntil(body.pausedUntil, now),
      fieldPrivacy:
        body.fieldPrivacy === undefined
          ? this.parseFieldPrivacy(existing?.fieldPrivacy)
          : this.fieldPrivacy(body.fieldPrivacy),
      requestsFromVerifiedOnly:
        body.requestsFromVerifiedOnly === undefined
          ? (existing?.requestsFromVerifiedOnly ?? false)
          : Boolean(body.requestsFromVerifiedOnly),
    };
  }

  private text(
    body: ContactsUpdateProfileRequest,
    key: 'headline' | 'about' | 'offers',
    fallback: string | null,
    maxLength: number,
    label: string,
  ): string | null {
    const value = body[key];
    if (value === undefined) return fallback;
    if (value === null) return null;
    if (typeof value !== 'string') {
      throw new BadRequestException(`${label}: ожидается строка`);
    }
    const trimmed = value.trim();
    if (trimmed.length > maxLength) {
      throw new BadRequestException(
        `${label}: не длиннее ${maxLength} символов`,
      );
    }
    return trimmed === '' ? null : trimmed;
  }

  private languages(value: unknown): string[] {
    if (!Array.isArray(value)) {
      throw new BadRequestException('Языки: ожидается список');
    }
    const cleaned: string[] = [];
    for (const item of value) {
      if (typeof item !== 'string') {
        throw new BadRequestException('Языки: ожидается список строк');
      }
      const trimmed = item.trim();
      if (trimmed === '') continue;
      if (trimmed.length > MAX_LANGUAGE_LENGTH) {
        throw new BadRequestException(
          `Язык: не длиннее ${MAX_LANGUAGE_LENGTH} символов`,
        );
      }
      if (!cleaned.includes(trimmed)) cleaned.push(trimmed);
    }
    if (cleaned.length > MAX_LANGUAGES) {
      throw new BadRequestException(`Языков не больше ${MAX_LANGUAGES}`);
    }
    return cleaned;
  }

  private pausedUntil(value: unknown, now: Date): Date | null {
    if (value === null) return null;
    if (typeof value !== 'string') {
      throw new BadRequestException('Пауза: ожидается дата в формате ISO');
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Пауза: некорректная дата');
    }
    if (parsed.getTime() <= now.getTime()) {
      throw new BadRequestException('Пауза: дата должна быть в будущем');
    }
    return parsed;
  }

  private fieldPrivacy(value: unknown): ContactsFieldPrivacy | null {
    if (value === null) return null;
    if (typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('Приватность полей: ожидается объект');
    }
    const source = value as Record<string, unknown>;
    const result: ContactsFieldPrivacy = {};
    for (const key of Object.keys(source)) {
      if (!FIELD_PRIVACY_KEYS.includes(key as (typeof FIELD_PRIVACY_KEYS)[0])) {
        throw new BadRequestException(
          `Приватность полей: неизвестное «${key}»`,
        );
      }
      const level = source[key];
      if (level === undefined) continue;
      if (!FIELD_VISIBILITIES.includes(level as ContactsFieldVisibility)) {
        throw new BadRequestException(
          'Приватность полей: недопустимый уровень видимости',
        );
      }
      result[key as (typeof FIELD_PRIVACY_KEYS)[0]] =
        level as ContactsFieldVisibility;
    }
    return result;
  }

  private enumValue<T extends string>(
    value: unknown,
    allowed: T[],
    label: string,
  ): T | null {
    if (value === null) return null;
    if (!allowed.includes(value as T)) {
      throw new BadRequestException(`Недопустимое значение: ${label}`);
    }
    return value as T;
  }

  /** `undefined` — теги не трогаем; иначе список существующих id без дублей. */
  private async validateTagIds(
    tagIds: string[] | undefined,
  ): Promise<string[] | null> {
    if (tagIds === undefined) return null;
    if (!Array.isArray(tagIds)) {
      throw new BadRequestException('Теги: ожидается список');
    }
    const unique = [...new Set(tagIds)];
    if (unique.length > MAX_TAGS) {
      throw new BadRequestException(`Тегов не больше ${MAX_TAGS}`);
    }
    if (unique.length === 0) return [];

    const found = await this.prisma.contactsTag.findMany({
      where: { id: { in: unique } },
      select: { id: true },
    });
    if (found.length !== unique.length) {
      throw new BadRequestException('Указан несуществующий тег');
    }
    return unique;
  }
}
