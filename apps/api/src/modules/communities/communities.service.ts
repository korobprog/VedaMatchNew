import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  AdminAuditEvent,
  AdminCommunityDecisionRequest,
  AdminCommunityListResponse,
  CommunityBadgeDto,
  CommunityDto,
  CommunityKind,
  CommunityMapResponse,
  CommunitySearchResponse,
  CreateCommunityRequest,
  MyCommunitiesResponse,
  ProfileLocation,
  UpdateCommunityRequest,
} from '@vedamatch/shared';
import { normalizeCityKey } from '../../common/city-key';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { toBadgeDto, toCommunityDto, toMapPoint } from './community-dto';
import {
  canManageCommunity,
  canPostAsCommunity,
  isReachable,
} from './community-roles';
import {
  buildCommunitySlug,
  duplicateKey,
  isReservedCommunitySlug,
  withSlugSuffix,
} from './community-slug';
import {
  COMMUNITY_KINDS,
  COMMUNITY_VALIDATION_MESSAGES,
  isEditableCommunityStatus,
  validateCommunity,
} from './community-validate';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
/** Сколько раз пробуем суффикс, прежде чем сдаться на коллизии слага. */
const SLUG_ATTEMPTS = 20;
/**
 * Сколько соседних карточек просматриваем при поиске дубля. Общин в городе
 * десятки, а не тысячи, поэтому сравнение идёт в приложении: хранить
 * нормализованный ключ колонкой значило бы пересчитывать его миграцией
 * при каждой правке списка шумовых слов.
 */
const DUPLICATE_SCAN_LIMIT = 500;

@Injectable()
export class CommunitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  // ===== Узкий контракт для остальных модулей портала =====
  //
  // Сервисные модули читают общины ТОЛЬКО через эти три метода. Прямые
  // запросы к таблицам Community* из сервиса — нарушение контракта, даже
  // если формально импорта модуля нет.

  /** Подтверждённые участия человека. Пустой массив, если он ни в одной. */
  async membershipsOf(userId: string): Promise<CommunityBadgeDto[]> {
    const rows = await this.prisma.communityMember.findMany({
      where: { userId, status: 'active', community: { status: 'active' } },
      include: {
        community: {
          select: {
            id: true,
            slug: true,
            name: true,
            kind: true,
            city: true,
            verifiedAt: true,
          },
        },
      },
      orderBy: [{ isPrimary: 'desc' }, { joinedAt: 'asc' }],
    });
    return rows.map((row) => toBadgeDto(row.community, row));
  }

  /**
   * Община для значка в профиле. Уважает `isPublic`: участие само по себе не
   * тайна, но связывать себя с общиной на людях человек не обязан.
   */
  async badgeFor(userId: string): Promise<CommunityBadgeDto | null> {
    const row = await this.prisma.communityMember.findFirst({
      where: {
        userId,
        status: 'active',
        isPublic: true,
        community: { status: 'active' },
      },
      include: {
        community: {
          select: {
            id: true,
            slug: true,
            name: true,
            kind: true,
            city: true,
            verifiedAt: true,
          },
        },
      },
      orderBy: [{ isPrimary: 'desc' }, { joinedAt: 'asc' }],
    });
    return row ? toBadgeDto(row.community, row) : null;
  }

  /** Вправе ли человек публиковать от имени этой общины прямо сейчас. */
  async canPostAs(userId: string, communityId: string): Promise<boolean> {
    const [membership, community] = await Promise.all([
      this.prisma.communityMember.findUnique({
        where: { communityId_userId: { communityId, userId } },
        select: { role: true, status: true },
      }),
      this.prisma.community.findUnique({
        where: { id: communityId },
        select: { status: true },
      }),
    ]);
    if (!community || community.status !== 'active') return false;
    return canPostAsCommunity(membership);
  }

  // ===== Справочник =====

  async search(
    query: Record<string, string | undefined>,
    viewerId?: string,
  ): Promise<CommunitySearchResponse> {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Number(query.pageSize) || DEFAULT_PAGE_SIZE),
    );
    const where = this.searchWhere(query);
    // Выдача и `total` строятся из одного и того же `where`: расхождение
    // между ними — это и есть дырявый счётчик, см. план сервиса «Контакты».
    const [rows, total] = await Promise.all([
      this.prisma.community.findMany({
        where,
        orderBy: [
          { verifiedAt: { sort: 'desc', nulls: 'last' } },
          { membersCount: 'desc' },
          // Tiebreak по id: без него страницы теряют и дублируют записи.
          { id: 'asc' },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.community.count({ where }),
    ]);
    const memberships = await this.membershipMap(
      viewerId,
      rows.map((row) => row.id),
    );
    return {
      items: rows.map((row) =>
        toCommunityDto(row, memberships.get(row.id) ?? null),
      ),
      page,
      pageSize,
      total,
      hasMore: page * pageSize < total,
    };
  }

  async map(
    query: Record<string, string | undefined>,
  ): Promise<CommunityMapResponse> {
    const where = this.searchWhere(query);
    const bbox = this.parseBbox(query);
    const rows = await this.prisma.community.findMany({
      where: bbox ? { AND: [where, bbox] } : where,
      take: 2000,
    });
    const points = rows
      .map(toMapPoint)
      .filter((point): point is NonNullable<typeof point> => point !== null);
    return {
      points,
      // Карта обязана честно сказать «ещё N общин без города», а не молча
      // их потерять — то же решение, что в карте справочника контактов.
      withoutLocation: rows.length - points.length,
    };
  }

  async bySlug(
    slug: string,
    viewerId: string | undefined,
    viewerIsAdmin: boolean,
  ): Promise<CommunityDto> {
    const community = await this.prisma.community.findUnique({
      where: { slug },
    });
    if (!community) throw new NotFoundException('Община не найдена');
    const membership = viewerId
      ? await this.prisma.communityMember.findUnique({
          where: {
            communityId_userId: { communityId: community.id, userId: viewerId },
          },
        })
      : null;
    const mayLook =
      isReachable(community.status) ||
      viewerIsAdmin ||
      community.createdById === viewerId ||
      canManageCommunity(membership);
    // 404, а не 403: 403 подтверждает существование скрытой карточки.
    if (!mayLook) throw new NotFoundException('Община не найдена');
    return toCommunityDto(community, membership);
  }

  async myCommunities(userId: string): Promise<MyCommunitiesResponse> {
    const rows = await this.prisma.communityMember.findMany({
      where: { userId, status: { in: ['active', 'pending'] } },
      include: {
        community: {
          select: {
            id: true,
            slug: true,
            name: true,
            kind: true,
            city: true,
            verifiedAt: true,
            status: true,
          },
        },
      },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
    const memberships: CommunityBadgeDto[] = [];
    const pending: CommunityBadgeDto[] = [];
    for (const row of rows) {
      const badge = toBadgeDto(row.community, row);
      if (row.status === 'active') memberships.push(badge);
      else pending.push(badge);
    }
    return { memberships, pending };
  }

  // ===== Создание и правка =====

  async create(
    userId: string,
    body: CreateCommunityRequest,
  ): Promise<CommunityDto> {
    this.assertValid(body, true);
    const location = body.location ?? null;
    const city = location?.city?.trim() ?? null;
    await this.assertNoDuplicate(body.name, city, null);
    const slug = await this.reserveSlug(body.name);

    // Заявка и владелец создаются одной транзакцией: община без владельца
    // не имеет пути обратно — некому ни дописать карточку, ни ответить админу.
    const community = await this.prisma.$transaction(async (tx) => {
      const created = await tx.community.create({
        data: {
          slug,
          kind: body.kind,
          name: body.name.trim(),
          descriptionRu: trimOrNull(body.descriptionRu),
          descriptionEn: trimOrNull(body.descriptionEn),
          ...locationColumns(location),
          address: trimOrNull(body.address),
          messengers: (body.messengers ?? {}) as Prisma.InputJsonValue,
          links: (body.links ?? {}) as Prisma.InputJsonValue,
          joinPolicy: body.joinPolicy ?? 'request_approval',
          // Свободного создания нет намеренно: справочник ятр зарастает
          // дублями быстрее всего остального.
          status: 'pending',
          createdById: userId,
          membersCount: 1,
        },
      });
      await tx.communityMember.create({
        data: {
          communityId: created.id,
          userId,
          role: 'owner',
          status: 'active',
          joinedAt: new Date(),
          // Значок в профиле ставим, только если другой основной общины нет:
          // заведение второй карточки не должно молча переключать значок.
          isPrimary: !(await tx.communityMember.findFirst({
            where: { userId, isPrimary: true },
            select: { id: true },
          })),
        },
      });
      return created;
    });
    return this.bySlug(community.slug, userId, false);
  }

  async update(
    userId: string,
    isAdmin: boolean,
    id: string,
    body: UpdateCommunityRequest,
  ): Promise<CommunityDto> {
    this.assertValid(body, false);
    const community = await this.prisma.community.findUnique({ where: { id } });
    if (!community) throw new NotFoundException('Община не найдена');
    if (!isAdmin) {
      const membership = await this.prisma.communityMember.findUnique({
        where: { communityId_userId: { communityId: id, userId } },
        select: { role: true, status: true },
      });
      if (!canManageCommunity(membership))
        throw new ForbiddenException('Нет прав на правку общины');
    }

    const data: Prisma.CommunityUpdateInput = {};
    if (body.kind !== undefined) data.kind = body.kind;
    if (body.name !== undefined) {
      const name = body.name.trim();
      // Переименование проверяем на дубль так же, как создание: иначе
      // «Община Москва» заводится под нейтральным именем и переименовывается
      // в уже существующую. Себя из кандидатов исключаем — иначе любое
      // сохранение без смены имени споткнётся о собственную карточку.
      // Город берём из тела, если его тоже меняют, иначе — сохранённый.
      const city =
        body.location !== undefined
          ? (body.location?.city?.trim() ?? null)
          : community.city;
      if (name !== community.name || city !== community.city)
        await this.assertNoDuplicate(name, city, community.id);
      data.name = name;
    }
    if (body.descriptionRu !== undefined)
      data.descriptionRu = trimOrNull(body.descriptionRu);
    if (body.descriptionEn !== undefined)
      data.descriptionEn = trimOrNull(body.descriptionEn);
    if (body.address !== undefined) data.address = trimOrNull(body.address);
    if (body.messengers !== undefined)
      data.messengers = body.messengers as Prisma.InputJsonValue;
    if (body.links !== undefined)
      data.links = body.links as Prisma.InputJsonValue;
    if (body.joinPolicy !== undefined) data.joinPolicy = body.joinPolicy;
    if (body.location !== undefined)
      Object.assign(data, locationColumns(body.location));
    if (body.status !== undefined) {
      if (!isEditableCommunityStatus(body.status))
        throw new BadRequestException(
          COMMUNITY_VALIDATION_MESSAGES.status_invalid,
        );
      // Разбор заявок — дело админа: через этот маршрут из `pending`
      // в `active` себя не перевести.
      if (!isReachable(community.status) && !isAdmin)
        throw new ForbiddenException('Община ещё не подтверждена');
      data.status = body.status;
    }

    const updated = await this.prisma.community.update({ where: { id }, data });
    return this.bySlug(updated.slug, userId, isAdmin);
  }

  // ===== Администрация портала =====

  async adminList(
    query: Record<string, string | undefined>,
  ): Promise<AdminCommunityListResponse> {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Number(query.pageSize) || DEFAULT_PAGE_SIZE),
    );
    const status = query.status;
    const where: Prisma.CommunityWhereInput = status
      ? { status: status as Prisma.EnumCommunityStatusFilter['equals'] }
      : { status: 'pending' };
    const [rows, total] = await Promise.all([
      this.prisma.community.findMany({
        where,
        include: {
          // В админке осознанно мирское имя: по духовному нельзя понять,
          // кто перед тобой — см. контракт, «Имя пользователя наружу».
          createdBy: { select: { name: true } },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.community.count({ where }),
    ]);
    return {
      items: rows.map((row) => ({
        ...toCommunityDto(row, null),
        createdById: row.createdById,
        createdByName: row.createdBy?.name ?? null,
        updatedAt: row.updatedAt.toISOString(),
      })),
      page,
      pageSize,
      total,
    };
  }

  async adminDecide(
    adminId: string,
    id: string,
    body: AdminCommunityDecisionRequest,
  ): Promise<CommunityDto> {
    // Любое неожиданное значение раньше молча читалось как «отклонить» —
    // опечатка в клиенте превращалась в removed_by_admin.
    if (body?.decision !== 'approve' && body?.decision !== 'reject')
      throw new BadRequestException('Решение — approve или reject');
    const community = await this.prisma.community.findUnique({ where: { id } });
    if (!community) throw new NotFoundException('Община не найдена');
    const approved = body.decision === 'approve';
    const updated = await this.prisma.community.update({
      where: { id },
      data: {
        status: approved ? 'active' : 'removed_by_admin',
        // Верификация — второй, более сильный уровень: `active` означает
        // лишь, что это не дубль, а `verifiedAt` — что община настоящая.
        verifiedAt: approved && body.verify ? new Date() : community.verifiedAt,
        verifiedById:
          approved && body.verify ? adminId : community.verifiedById,
      },
    });

    const event: AdminAuditEvent = {
      actorId: adminId,
      action: 'community.decided',
      targetType: 'community',
      targetId: id,
      details: {
        status: updated.status,
        title: community.name,
        verified: approved && body.verify === true,
      },
    };
    this.events.emit('admin.action', event);
    return toCommunityDto(updated, null);
  }

  // ===== Внутреннее =====

  private searchWhere(
    query: Record<string, string | undefined>,
  ): Prisma.CommunityWhereInput {
    const where: Prisma.CommunityWhereInput = { status: 'active' };
    const q = query.q?.trim();
    if (q)
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { descriptionRu: { contains: q, mode: 'insensitive' } },
        { city: { contains: q, mode: 'insensitive' } },
      ];
    // Город — по нормализованному ключу (индекс (status, cityKey)), а не через
    // `mode: 'insensitive'`: Prisma превращает его в ILIKE и мимо индекса.
    if (query.city?.trim()) where.cityKey = normalizeCityKey(query.city);
    if (query.country?.trim())
      where.country = { equals: query.country.trim(), mode: 'insensitive' };
    const kinds = (query.kinds ?? '')
      .split(',')
      .map((kind) => kind.trim())
      .filter((kind): kind is CommunityKind =>
        COMMUNITY_KINDS.includes(kind as CommunityKind),
      );
    if (kinds.length) where.kind = { in: kinds };
    if (query.verifiedOnly === 'true') where.verifiedAt = { not: null };
    return where;
  }

  private parseBbox(
    query: Record<string, string | undefined>,
  ): Prisma.CommunityWhereInput | null {
    const minLat = Number(query.minLat);
    const maxLat = Number(query.maxLat);
    const minLon = Number(query.minLon);
    const maxLon = Number(query.maxLon);
    if (![minLat, maxLat, minLon, maxLon].every(Number.isFinite)) return null;
    return {
      latitude: {
        gte: Math.min(minLat, maxLat),
        lte: Math.max(minLat, maxLat),
      },
      longitude: {
        gte: Math.min(minLon, maxLon),
        lte: Math.max(minLon, maxLon),
      },
    };
  }

  private async membershipMap(userId: string | undefined, ids: string[]) {
    const map = new Map<
      string,
      Awaited<ReturnType<typeof this.prisma.communityMember.findFirst>>
    >();
    if (!userId || !ids.length) return map;
    const rows = await this.prisma.communityMember.findMany({
      where: { userId, communityId: { in: ids } },
    });
    for (const row of rows) map.set(row.communityId, row);
    return map;
  }

  private assertValid(
    body: CreateCommunityRequest | UpdateCommunityRequest,
    requireName: boolean,
  ) {
    const error = validateCommunity(body, { requireName });
    if (error)
      throw new BadRequestException(COMMUNITY_VALIDATION_MESSAGES[error]);
  }

  /**
   * Дубль ищется по нормализованному ключу, а не по точному совпадению имени:
   * «Москва», «Община Москва» и «ятра г. Москва» — одна и та же ятра.
   */
  private async assertNoDuplicate(
    name: string,
    city: string | null,
    exceptId: string | null,
  ) {
    const key = duplicateKey(name, city);
    const candidates = await this.prisma.community.findMany({
      where: {
        status: { notIn: ['removed_by_admin', 'archived'] },
        ...(city ? { cityKey: normalizeCityKey(city) } : {}),
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { name: true, city: true },
      take: DUPLICATE_SCAN_LIMIT,
    });
    const clash = candidates.some(
      (candidate) => duplicateKey(candidate.name, candidate.city) === key,
    );
    if (clash)
      throw new BadRequestException(
        'Такая община уже есть в справочнике — попросите её администратора добавить вас',
      );
  }

  private async reserveSlug(name: string): Promise<string> {
    const base = buildCommunitySlug(name);
    for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt += 1) {
      const candidate = withSlugSuffix(base, attempt);
      if (isReservedCommunitySlug(candidate)) continue;
      const taken = await this.prisma.community.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      if (!taken) return candidate;
    }
    throw new BadRequestException('Не удалось подобрать адрес для общины');
  }
}

function trimOrNull(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * Гео пишется парой: JSON целиком — чтобы вернуть в форму без обратного
 * пересчёта, скаляры — потому что JSON в Postgres не индексируется, а по
 * городу идёт фильтр справочника.
 */
function locationColumns(location: ProfileLocation | null | undefined) {
  if (!location)
    return {
      location: Prisma.DbNull,
      city: null,
      cityKey: null,
      country: null,
      latitude: null,
      longitude: null,
    };
  return {
    location: location as unknown as Prisma.InputJsonValue,
    city: location.city.trim(),
    cityKey: normalizeCityKey(location.city),
    country: location.country?.trim() ?? null,
    latitude: location.lat,
    longitude: location.lon,
  };
}
