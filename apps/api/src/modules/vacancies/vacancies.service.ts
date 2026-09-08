import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import {
  VACANCIES_PER_DAY,
  type CreateVacancyOfferRequest,
  type ProfileLocation,
  type UpdateVacancyOfferRequest,
  type UpdateVacancyStatusRequest,
  type VacancyFeedResponse,
  type VacancyOfferDto,
  type VacancyPayInput,
  type VacancyPerk,
} from '@vedamatch/shared';
import { normalizeCityKey } from '../../common/city-key';
import { PrismaService } from '../../prisma/prisma.service';
// Общины и модерация — портальная инфраструктура, импортировать разрешено;
// см. docs/service-module-contract.md.
import { CommunitiesService } from '../communities/communities.service';
import { ModerationService } from '../moderation/moderation.service';
import {
  VACANCY_INCLUDE,
  toOfferDto,
  type ViewerResponse,
} from './vacancy-dto';
import { VACANCY_EVENTS, type VacancyOfferClosedEvent } from './vacancy-events';
import { canRenew, renewedExpiresAt, resolveExpiresAt } from './vacancy-expiry';
import {
  buildFeedWhere,
  cursorFilter,
  decodeCursor,
  encodeCursor,
  feedOrderBy,
  type FeedViewer,
  type NormalizedFeedFilters,
} from './vacancy-feed-query';
import { coordsForPrecision } from './vacancy-geo';
import {
  VACANCY_VALIDATION_MESSAGES,
  parseDate,
  validateVacancy,
} from './vacancy-validate';

const OFFER_STATUSES_BY_AUTHOR = [
  'published',
  'hidden_by_author',
  'closed',
  'draft',
] as const;

@Injectable()
export class VacanciesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly communities: CommunitiesService,
    private readonly moderation: ModerationService,
  ) {}

  async feed(
    filters: NormalizedFeedFilters,
    viewerId: string,
    isAdmin: boolean,
  ): Promise<VacancyFeedResponse> {
    const now = new Date();
    const viewer = await this.resolveViewer(viewerId, isAdmin);
    const cursor = decodeCursor(filters.cursor);
    const where = buildFeedWhere(filters, viewer, now);

    const rows = await this.prisma.vacancyOffer.findMany({
      where: cursor ? { AND: [where, cursorFilter(cursor)] } : where,
      include: VACANCY_INCLUDE,
      orderBy: feedOrderBy(),
      // На одну больше страницы: «хвост» и есть признак следующей страницы.
      take: filters.limit + 1,
    });

    const hasMore = rows.length > filters.limit;
    const page = hasMore ? rows.slice(0, filters.limit) : rows;
    const last = page.at(-1);
    const responses = await this.viewerResponses(
      viewerId,
      page.map((row) => row.id),
    );
    return {
      items: page.map((row) =>
        toOfferDto(row, viewer.userId, now, responses.get(row.id) ?? null),
      ),
      nextCursor: hasMore && last ? encodeCursor(last) : null,
    };
  }

  async byId(
    id: string,
    viewerId: string,
    isAdmin: boolean,
  ): Promise<VacancyOfferDto> {
    const now = new Date();
    const row = await this.prisma.vacancyOffer.findUnique({
      where: { id },
      include: VACANCY_INCLUDE,
    });
    if (!row) throw new NotFoundException('Предложение не найдено');

    const viewer = await this.resolveViewer(viewerId, isAdmin);
    // 404, а не 403: 403 подтверждает существование скрытой записи.
    if (!this.mayView(row, viewer, now))
      throw new NotFoundException('Предложение не найдено');

    // Счётчик просмотров не считает автора: иначе он накрутит его сам.
    if (viewer.userId !== row.authorId)
      await this.prisma.vacancyOffer.update({
        where: { id },
        data: { viewsCount: { increment: 1 } },
      });
    const responses = await this.viewerResponses(viewerId, [id]);
    return toOfferDto(row, viewer.userId, now, responses.get(id) ?? null);
  }

  async create(
    userId: string,
    body: CreateVacancyOfferRequest,
  ): Promise<VacancyOfferDto> {
    const now = new Date();
    this.assertValid(body, true, now);
    await this.assertCommunityRight(userId, body.communityId ?? null);
    await this.assertDailyLimit(userId);

    const kind = body.kind;
    const sevaUntil = kind === 'seva' ? parseDate(body.sevaUntil) : null;
    const dueAt = kind === 'task' ? parseDate(body.dueAt) : null;

    const created = await this.prisma.vacancyOffer.create({
      data: {
        kind,
        authorId: userId,
        communityId: body.communityId ?? null,
        title: body.title.trim(),
        description: trimOrNull(body.description),
        audience: body.audience ?? 'everyone',
        ...this.locationColumns(body.location, body.communityId ?? null),
        isRemote: resolveIsRemote(body),
        ...kindColumns(body),
        sevaUntil,
        dueAt,
        expiresAt: resolveExpiresAt({ kind, sevaUntil, dueAt }, now),
      },
      include: VACANCY_INCLUDE,
    });
    return toOfferDto(created, userId, now);
  }

  async update(
    userId: string,
    isAdmin: boolean,
    id: string,
    body: UpdateVacancyOfferRequest,
  ): Promise<VacancyOfferDto> {
    const now = new Date();
    const offer = await this.requireOwn(id, userId, isAdmin);
    // Вид не меняется: у видов разные обязательные поля и сроки, и «работа»
    // превратившаяся в «служение» — это новое предложение.
    if (body.kind !== undefined && body.kind !== offer.kind)
      throw new BadRequestException('Вид предложения изменить нельзя');
    this.assertValid({ ...body, kind: offer.kind }, false, now);
    if (body.communityId !== undefined)
      await this.assertCommunityRight(userId, body.communityId ?? null);
    // Служение без общины остаться не может — правило то же, что на создании.
    if (offer.kind === 'seva' && body.communityId === null)
      throw new BadRequestException(
        VACANCY_VALIDATION_MESSAGES.seva_requires_community,
      );

    const data: Prisma.VacancyOfferUncheckedUpdateInput = {};
    if (body.title !== undefined) data.title = body.title.trim();
    if (body.description !== undefined)
      data.description = trimOrNull(body.description);
    if (body.audience !== undefined) data.audience = body.audience;
    if (body.communityId !== undefined) data.communityId = body.communityId;
    if (body.location !== undefined)
      Object.assign(
        data,
        this.locationColumns(
          body.location,
          body.communityId === undefined ? offer.communityId : body.communityId,
        ),
      );
    if (body.isRemote !== undefined || body.workFormat !== undefined)
      data.isRemote = resolveIsRemote({
        kind: offer.kind,
        isRemote: body.isRemote ?? offer.isRemote,
        workFormat: body.workFormat ?? offer.workFormat,
      });
    Object.assign(data, kindColumns({ ...body, kind: offer.kind }, true));

    let sevaUntil = offer.sevaUntil;
    let dueAt = offer.dueAt;
    if (offer.kind === 'seva' && body.sevaUntil !== undefined) {
      sevaUntil = parseDate(body.sevaUntil);
      data.sevaUntil = sevaUntil;
    }
    if (offer.kind === 'task' && body.dueAt !== undefined) {
      dueAt = parseDate(body.dueAt);
      data.dueAt = dueAt;
    }
    // Срок пересчитывается только когда сдвинули якорную дату: правка
    // описания не должна продлевать предложение.
    if (data.sevaUntil !== undefined || data.dueAt !== undefined)
      data.expiresAt = resolveExpiresAt(
        { kind: offer.kind, sevaUntil, dueAt },
        now,
      );

    const updated = await this.prisma.vacancyOffer.update({
      where: { id },
      data,
      include: VACANCY_INCLUDE,
    });
    return toOfferDto(updated, userId, now);
  }

  /**
   * Смена статуса автором. Закрытие — событие: соискателям с живыми
   * откликами стоит узнать, что место занято, а не ждать ответа неделями.
   */
  async setStatus(
    userId: string,
    isAdmin: boolean,
    id: string,
    body: UpdateVacancyStatusRequest,
  ): Promise<VacancyOfferDto> {
    if (!OFFER_STATUSES_BY_AUTHOR.includes(body.status))
      throw new BadRequestException('Недопустимый статус');
    const offer = await this.requireOwn(id, userId, isAdmin);
    // Из-под скрытия по жалобам автор сам не выходит: это решение модератора.
    if (
      (offer.status === 'hidden_by_reports' ||
        offer.status === 'removed_by_admin') &&
      !isAdmin
    )
      throw new ForbiddenException('Предложение скрыто модератором');

    const now = new Date();
    const closing = body.status === 'closed' && offer.status !== 'closed';
    const updated = await this.prisma.vacancyOffer.update({
      where: { id },
      data: {
        status: body.status,
        closedAt: body.status === 'closed' ? (offer.closedAt ?? now) : null,
        // Возврат в публикацию просроченного — это продление.
        ...(body.status === 'published' && offer.expiresAt <= now
          ? { expiresAt: renewedExpiresAt(offer.kind, now) }
          : {}),
      },
      include: VACANCY_INCLUDE,
    });
    if (closing) await this.announceClosed(updated);
    return toOfferDto(updated, userId, now);
  }

  async renew(userId: string, id: string): Promise<VacancyOfferDto> {
    const now = new Date();
    const offer = await this.requireOwn(id, userId, false);
    if (
      !canRenew(offer.expiresAt, now, {
        kind: offer.kind,
        dueAt: offer.dueAt,
        sevaUntil: offer.sevaUntil,
      })
    )
      throw new BadRequestException('Продлевать пока рано');
    if (offer.status !== 'published' && offer.status !== 'expired')
      throw new BadRequestException('Продлить можно только опубликованное');

    const updated = await this.prisma.vacancyOffer.update({
      where: { id },
      data: {
        status: 'published',
        expiresAt: renewedExpiresAt(offer.kind, now),
        renewedAt: now,
        renewCount: { increment: 1 },
      },
      include: VACANCY_INCLUDE,
    });
    return toOfferDto(updated, userId, now);
  }

  async remove(userId: string, isAdmin: boolean, id: string): Promise<void> {
    await this.requireOwn(id, userId, isAdmin);
    await this.prisma.vacancyOffer.delete({ where: { id } });
  }

  /** Видно ли предложение смотрящему — то же условие, что в ленте. */
  async assertVisible(offerId: string, viewerId: string): Promise<void> {
    const now = new Date();
    const row = await this.prisma.vacancyOffer.findUnique({
      where: { id: offerId },
      select: {
        authorId: true,
        status: true,
        expiresAt: true,
        audience: true,
        cityKey: true,
        communityId: true,
      },
    });
    if (!row) throw new NotFoundException('Предложение не найдено');
    const viewer = await this.resolveViewer(viewerId, false);
    if (!this.mayView(row, viewer, now))
      throw new NotFoundException('Предложение не найдено');
  }

  // ===== Внутреннее =====

  /**
   * Место занято: соискателям с живыми откликами ждать ответа больше незачем.
   * По событию на получателя — так требует контракт уведомлений.
   */
  private async announceClosed(offer: {
    id: string;
    title: string;
    kind: VacancyOfferClosedEvent['offerKind'];
    authorId: string;
  }) {
    const responses = await this.prisma.vacancyResponse.findMany({
      where: { offerId: offer.id, status: { in: ['new', 'in_dialog'] } },
      select: { id: true, userId: true },
    });
    for (const response of responses) {
      const event: VacancyOfferClosedEvent = {
        name: VACANCY_EVENTS.offerClosed,
        recipientId: response.userId,
        offerId: offer.id,
        offerTitle: offer.title,
        offerKind: offer.kind,
        responseId: response.id,
        authorId: offer.authorId,
      };
      this.events.emit(event.name, event);
    }
  }

  private async viewerResponses(
    viewerId: string,
    offerIds: string[],
  ): Promise<Map<string, ViewerResponse>> {
    const map = new Map<string, ViewerResponse>();
    if (!offerIds.length) return map;
    const rows = await this.prisma.vacancyResponse.findMany({
      where: { userId: viewerId, offerId: { in: offerIds } },
      select: { id: true, status: true, offerId: true },
    });
    for (const row of rows) map.set(row.offerId, row);
    return map;
  }

  private async resolveViewer(
    viewerId: string,
    isAdmin: boolean,
  ): Promise<FeedViewer> {
    const [user, memberships, hiddenUserIds] = await Promise.all([
      // Портальный профиль читается read-only — это разрешено контрактом.
      this.prisma.user.findUnique({
        where: { id: viewerId },
        select: { homeLocation: true },
      }),
      this.communities.membershipsOf(viewerId),
      this.moderation.hiddenUserIds(viewerId, 'all'),
    ]);
    const location = user?.homeLocation as { city?: string } | null;
    return {
      userId: viewerId,
      isAdmin,
      city: location?.city ?? null,
      communityIds: memberships.map((badge) => badge.id),
      hiddenUserIds,
    };
  }

  private mayView(
    row: {
      authorId: string;
      status: string;
      expiresAt: Date;
      audience: string;
      cityKey: string | null;
      communityId: string | null;
    },
    viewer: FeedViewer,
    now: Date,
  ): boolean {
    if (viewer.isAdmin) return true;
    if (row.authorId === viewer.userId) return true;
    if (viewer.hiddenUserIds.has(row.authorId)) return false;
    if (row.status !== 'published') return false;
    if (row.expiresAt.getTime() <= now.getTime()) return false;
    if (row.audience === 'everyone') return true;
    if (row.audience === 'my_city')
      return Boolean(
        viewer.city &&
        row.cityKey &&
        normalizeCityKey(viewer.city) === row.cityKey,
      );
    return Boolean(
      row.communityId && viewer.communityIds.includes(row.communityId),
    );
  }

  private assertValid(
    body: CreateVacancyOfferRequest | UpdateVacancyOfferRequest,
    isCreate: boolean,
    now: Date,
  ) {
    const error = validateVacancy(body, { isCreate, now });
    if (error)
      throw new BadRequestException(VACANCY_VALIDATION_MESSAGES[error]);
  }

  private async requireOwn(id: string, userId: string, isAdmin: boolean) {
    const offer = await this.prisma.vacancyOffer.findUnique({ where: { id } });
    if (!offer) throw new NotFoundException('Предложение не найдено');
    if (offer.authorId !== userId && !isAdmin)
      throw new NotFoundException('Предложение не найдено');
    return offer;
  }

  /**
   * Право публиковать от имени общины перепроверяется на каждой правке:
   * роль могли снять, и предложение не должно продолжать говорить от её имени.
   */
  private async assertCommunityRight(
    userId: string,
    communityId: string | null,
  ) {
    if (!communityId) return;
    const allowed = await this.communities.canPostAs(userId, communityId);
    if (!allowed)
      throw new ForbiddenException(
        'Публиковать от имени общины могут её владелец и администраторы',
      );
  }

  private async assertDailyLimit(userId: string) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const published = await this.prisma.vacancyOffer.count({
      where: { authorId: userId, createdAt: { gte: since } },
    });
    if (published >= VACANCIES_PER_DAY)
      throw new BadRequestException(
        `Не больше ${VACANCIES_PER_DAY} предложений в сутки`,
      );
  }

  private locationColumns(
    location: ProfileLocation | null | undefined,
    communityId: string | null,
  ) {
    if (!location)
      return {
        location: Prisma.DbNull,
        city: null,
        cityKey: null,
        country: null,
        latitude: null,
        longitude: null,
        placePrecision: 'city' as const,
      };
    const placePrecision = communityId ? ('exact' as const) : ('city' as const);
    // При точности `city` координаты огрубляются уже на записи — и в
    // скалярах, и в JSON, чтобы точное место человека нигде не сохранялось.
    const { lat, lon } = coordsForPrecision(
      location.lat,
      location.lon,
      placePrecision,
    );
    return {
      location: { ...location, lat, lon } as unknown as Prisma.InputJsonValue,
      city: location.city.trim(),
      cityKey: normalizeCityKey(location.city),
      country: location.country?.trim() ?? null,
      latitude: lat,
      longitude: lon,
      placePrecision,
    };
  }
}

/**
 * «Место не важно». У работы это формат `remote`; у служения и задачи —
 * явный флаг из формы.
 */
function resolveIsRemote(body: {
  kind: CreateVacancyOfferRequest['kind'];
  isRemote?: boolean;
  workFormat?: CreateVacancyOfferRequest['workFormat'];
}): boolean {
  if (body.kind === 'work') return body.workFormat === 'remote';
  return body.isRemote ?? false;
}

/**
 * Колонки своего вида. Поля чужого вида не пишутся вовсе: у служения не
 * бывает оплаты, у работы — льгот, и мусор из формы в базу не попадает.
 */
type KindColumns = Partial<
  Pick<
    Prisma.VacancyOfferUncheckedCreateInput,
    | 'workFormat'
    | 'employment'
    | 'schedule'
    | 'payMin'
    | 'payMax'
    | 'payCurrency'
    | 'payPeriod'
    | 'payNegotiable'
    | 'sevaTerm'
  > & { perks: VacancyPerk[] }
>;

function kindColumns(
  body: UpdateVacancyOfferRequest & { kind: CreateVacancyOfferRequest['kind'] },
  partial = false,
): KindColumns {
  const data: KindColumns = {};
  const given = (value: unknown) => !partial || value !== undefined;
  if (body.kind === 'work') {
    if (given(body.workFormat)) data.workFormat = body.workFormat ?? null;
    if (given(body.employment)) data.employment = body.employment ?? null;
    if (given(body.schedule)) data.schedule = trimOrNull(body.schedule);
    if (given(body.pay)) Object.assign(data, payColumns(body.pay ?? null));
  } else if (body.kind === 'seva') {
    if (given(body.sevaTerm)) data.sevaTerm = body.sevaTerm ?? null;
    if (given(body.perks)) data.perks = body.perks ?? [];
  }
  return data;
}

function payColumns(pay: VacancyPayInput | null) {
  return {
    payMin: pay?.min ?? null,
    payMax: pay?.max ?? null,
    payCurrency: pay?.currency ?? 'RUB',
    payPeriod: pay?.period ?? 'month',
    payNegotiable: pay?.negotiable ?? false,
  };
}

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
