import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  resolveDisplayName,
  TRAVEL_MAP_CHECK_VERDICTS,
  TRAVEL_MAP_CLOSED_VOTES_TO_REPORT,
  TRAVEL_MAP_NOTE_TEXT_MAX,
  TRAVEL_MAP_NOTES_PER_PLACE,
  TRAVEL_MAP_PLACE_PHOTOS_MAX,
  type AccessTokenPayload,
  type LineageId,
  type TravelMapAuthorDto,
  type TravelMapCheckVerdict,
  type TravelMapCommunityPointDto,
  type TravelMapFreshnessDto,
  type TravelMapNoteDto,
  type TravelMapPlaceDto,
  type TravelMapPlacesResponse,
  type TravelMapPointDto,
  type TravelMapStayPointDto,
  type TravelMapReportDto,
} from '@vedamatch/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { isAdmin } from '../is-admin';
import { buildFreshness, closedWindowStart, isStale } from './map-freshness';
import {
  parseCreatePlaceInput,
  parseHideReason,
  parseReportReason,
  parseUpdatePlaceInput,
} from './map-input';
import {
  parseAdminPlacesQuery,
  parseAdminReportsQuery,
  parsePlacesQuery,
} from './map-query';
import {
  TravelMapPhotosService,
  type UploadedMapPhoto,
} from './travel-map-photos.service';

/** Больше меток на одном экране не прочитать; дальше — «приблизьте карту». */
export const MAP_POINTS_LIMIT = 500;
const ADMIN_PLACES_LIMIT = 200;
const ADMIN_REPORTS_LIMIT = 200;

// `spiritualName` и `isAgent` тянем всегда: имя наружу собирает
// resolveDisplayName, а признак ИИ едет рядом с ним.
const userSelect = {
  id: true,
  name: true,
  spiritualName: true,
  isAgent: true,
} as const;

const pointSelect = {
  id: true,
  kind: true,
  name: true,
  lat: true,
  lng: true,
  city: true,
  lineage: true,
  verifiedAt: true,
  photoUrls: true,
  // Для признака `stale`: метка тускнеет, когда ни подтверждений, ни правок.
  lastConfirmedAt: true,
  updatedAt: true,
} as const;

/** Причина автоматической жалобы, заведённой голосами «закрылось». */
const CLOSED_AUTO_REPORT_REASON =
  'Несколько человек отметили: место закрылось или переехало';

const noteInclude = { author: { select: userSelect } } as const;
type NoteRow = Prisma.TravelMapNoteGetPayload<{ include: typeof noteInclude }>;

const placeInclude = { createdBy: { select: userSelect } } as const;

type PlaceRow = Prisma.TravelMapPlaceGetPayload<{
  include: typeof placeInclude;
}>;
type PointRow = Prisma.TravelMapPlaceGetPayload<{
  select: typeof pointSelect;
}>;
type UserRow = Prisma.UserGetPayload<{ select: typeof userSelect }>;

function authorOf(user: UserRow | null): TravelMapAuthorDto | null {
  if (!user) return null;
  return {
    id: user.id,
    name: resolveDisplayName(user),
    isAgent: user.isAgent,
  };
}

function pointOf(row: PointRow): TravelMapPointDto {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    lat: row.lat,
    lng: row.lng,
    city: row.city,
    lineage: row.lineage as LineageId | null,
    verified: row.verifiedAt != null,
    photoUrl: row.photoUrls[0] ?? null,
    stale: isStale(new Date(), row),
  };
}

function parseVerdict(body: unknown): TravelMapCheckVerdict {
  const raw =
    body && typeof body === 'object'
      ? (body as Record<string, unknown>).verdict
      : undefined;
  const verdict = TRAVEL_MAP_CHECK_VERDICTS.find((v) => v === raw);
  if (!verdict) {
    throw new BadRequestException(
      'Отметка должна быть «был здесь» или «закрылось»',
    );
  }
  return verdict;
}

function parseNoteText(body: unknown): string {
  const raw =
    body && typeof body === 'object'
      ? (body as Record<string, unknown>).text
      : undefined;
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (text.length < 2 || text.length > TRAVEL_MAP_NOTE_TEXT_MAX) {
    throw new BadRequestException(
      `Заметка — от 2 до ${TRAVEL_MAP_NOTE_TEXT_MAX} символов`,
    );
  }
  return text;
}

@Injectable()
export class TravelMapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly photos: TravelMapPhotosService,
  ) {}

  // ===== Чтение =====

  async listPlaces(
    _viewer: AccessTokenPayload,
    rawQuery: Record<string, unknown>,
  ): Promise<TravelMapPlacesResponse> {
    const query = parsePlacesQuery(rawQuery);
    const bbox = query.bbox;

    const where: Prisma.TravelMapPlaceWhereInput = { status: 'active' };
    if (bbox) {
      where.lat = { gte: bbox.minLat, lte: bbox.maxLat };
      where.lng = { gte: bbox.minLng, lte: bbox.maxLng };
    }
    if (query.kinds.length > 0) where.kind = { in: query.kinds };
    if (query.lineage) where.lineage = query.lineage;
    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: 'insensitive' } },
        { city: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    const rows = await this.prisma.travelMapPlace.findMany({
      where,
      select: pointSelect,
      orderBy: { updatedAt: 'desc' },
      // Одна лишняя строка — признак «мест больше лимита», без count().
      take: MAP_POINTS_LIMIT + 1,
    });
    const truncated = rows.length > MAP_POINTS_LIMIT;

    const communities = query.communities
      ? await this.listCommunities(query)
      : [];

    const stays = query.stays ? await this.listStays(query) : [];

    return {
      points: rows.slice(0, MAP_POINTS_LIMIT).map(pointOf),
      communities,
      stays,
      truncated,
    };
  }

  /**
   * Слой общин: `Community` — одна из четырёх портальных моделей, доступных
   * только для чтения. Виды и линия к общинам не применяются: у них свой
   * справочник.
   */
  private async listCommunities(
    query: ReturnType<typeof parsePlacesQuery>,
  ): Promise<TravelMapCommunityPointDto[]> {
    const where: Prisma.CommunityWhereInput = {
      status: 'active',
      latitude: { not: null },
      longitude: { not: null },
    };
    if (query.bbox) {
      where.latitude = { gte: query.bbox.minLat, lte: query.bbox.maxLat };
      where.longitude = { gte: query.bbox.minLng, lte: query.bbox.maxLng };
    }
    if (query.q) where.name = { contains: query.q, mode: 'insensitive' };
    const rows = await this.prisma.community.findMany({
      where,
      select: {
        id: true,
        slug: true,
        kind: true,
        name: true,
        latitude: true,
        longitude: true,
        city: true,
        verifiedAt: true,
      },
      take: MAP_POINTS_LIMIT,
    });
    return rows.flatMap((row) =>
      row.latitude == null || row.longitude == null
        ? []
        : [
            {
              id: row.id,
              slug: row.slug,
              kind: row.kind,
              name: row.name,
              lat: row.latitude,
              lng: row.longitude,
              city: row.city,
              verified: row.verifiedAt != null,
            },
          ],
    );
  }

  /**
   * Слой ночлега: `TravelStay` живёт в том же сервисе «Путешествий», поэтому
   * читается прямой выборкой, без событий и чужих контрактов. Показываем
   * только опубликованные объекты с координатами. Виды мест и линия к
   * ночлегу не применяются. Ссылка с метки ведёт на страницу ночлега, где
   * уже есть заявка и «Написать хозяину», — второй формы на карте нет.
   */
  private async listStays(
    query: ReturnType<typeof parsePlacesQuery>,
  ): Promise<TravelMapStayPointDto[]> {
    const where: Prisma.TravelStayWhereInput = {
      status: 'published',
      lat: { not: null },
      lng: { not: null },
    };
    if (query.bbox) {
      where.lat = { gte: query.bbox.minLat, lte: query.bbox.maxLat };
      where.lng = { gte: query.bbox.minLng, lte: query.bbox.maxLng };
    }
    if (query.q) where.name = { contains: query.q, mode: 'insensitive' };
    const rows = await this.prisma.travelStay.findMany({
      where,
      select: {
        id: true,
        kind: true,
        name: true,
        lat: true,
        lng: true,
        address: true,
        payment: true,
        priceMinor: true,
        currency: true,
        photoUrls: true,
      },
      take: MAP_POINTS_LIMIT,
    });
    return rows.flatMap((row) =>
      row.lat == null || row.lng == null
        ? []
        : [
            {
              id: row.id,
              kind: row.kind,
              name: row.name,
              lat: row.lat,
              lng: row.lng,
              address: row.address,
              payment: row.payment,
              priceMinor: row.priceMinor,
              currency: row.currency,
              photoUrl: row.photoUrls[0] ?? null,
            },
          ],
    );
  }

  async getPlace(
    viewer: AccessTokenPayload,
    id: string,
  ): Promise<TravelMapPlaceDto> {
    const row = await this.prisma.travelMapPlace.findUnique({
      where: { id },
      include: placeInclude,
    });
    // Спрятанное видит автор и админ; остальным — «не найдено», а не
    // «запрещено»: незачем подтверждать, что место существует.
    if (!row || (row.status === 'hidden' && !this.canEdit(viewer, row))) {
      throw new NotFoundException('Место не найдено');
    }
    return this.toPlaceDto(viewer, row, await this.loadFreshness(viewer, row));
  }

  // ===== Запись =====

  async createPlace(
    viewer: AccessTokenPayload,
    body: unknown,
  ): Promise<TravelMapPlaceDto> {
    const data = parseCreatePlaceInput(body);
    const row = await this.prisma.travelMapPlace.create({
      data: { ...data, createdById: viewer.sub },
      include: placeInclude,
    });
    // Только что созданное место ничьих отметок не имеет: запросы не нужны.
    return this.toPlaceDto(viewer, row, this.emptyFreshness(row));
  }

  async updatePlace(
    viewer: AccessTokenPayload,
    id: string,
    body: unknown,
  ): Promise<TravelMapPlaceDto> {
    const current = await this.requireEditable(viewer, id);
    const data = parseUpdatePlaceInput(body, current.kind);
    const row = await this.prisma.travelMapPlace.update({
      where: { id },
      data,
      include: placeInclude,
    });
    return this.toPlaceDto(viewer, row, await this.loadFreshness(viewer, row));
  }

  async deletePlace(viewer: AccessTokenPayload, id: string): Promise<void> {
    const current = await this.requireEditable(viewer, id);
    // Сначала строка, потом файлы: упавшая чистка S3 оставит мусор в
    // бакете, а не место без картинок на карте.
    await this.prisma.travelMapPlace.delete({ where: { id } });
    for (const key of current.photoKeys) await this.photos.remove(key);
  }

  async addPhoto(
    viewer: AccessTokenPayload,
    placeId: string,
    file: UploadedMapPhoto | undefined,
  ): Promise<TravelMapPlaceDto> {
    const current = await this.requireEditable(viewer, placeId);
    if (current.photoKeys.length >= TRAVEL_MAP_PLACE_PHOTOS_MAX) {
      throw new BadRequestException(
        `К месту можно приложить не больше ${TRAVEL_MAP_PLACE_PHOTOS_MAX} фото`,
      );
    }
    const { key, url } = await this.photos.upload(placeId, file);
    // push обоих массивов одним апдейтом сохраняет парность по индексу.
    const row = await this.prisma.travelMapPlace.update({
      where: { id: placeId },
      data: { photoKeys: { push: key }, photoUrls: { push: url } },
      include: placeInclude,
    });
    return this.toPlaceDto(viewer, row, await this.loadFreshness(viewer, row));
  }

  async removePhoto(
    viewer: AccessTokenPayload,
    placeId: string,
    index: number,
  ): Promise<TravelMapPlaceDto> {
    const current = await this.requireEditable(viewer, placeId);
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= current.photoKeys.length
    ) {
      throw new NotFoundException('Фото не найдено');
    }
    const key = current.photoKeys[index];
    const row = await this.prisma.travelMapPlace.update({
      where: { id: placeId },
      data: {
        photoKeys: current.photoKeys.filter((_, i) => i !== index),
        photoUrls: current.photoUrls.filter((_, i) => i !== index),
      },
      include: placeInclude,
    });
    await this.photos.remove(key);
    return this.toPlaceDto(viewer, row, await this.loadFreshness(viewer, row));
  }

  async reportPlace(
    viewer: AccessTokenPayload,
    id: string,
    body: unknown,
  ): Promise<void> {
    const reason = parseReportReason(body);
    const place = await this.prisma.travelMapPlace.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!place) throw new NotFoundException('Место не найдено');
    const existing = await this.prisma.travelMapPlaceReport.findFirst({
      where: { placeId: id, reporterId: viewer.sub, status: 'open' },
      select: { id: true },
    });
    // Повторная жалоба молча принимается: человеку незачем видеть ошибку, а
    // очередь админа не пухнет от дублей.
    if (existing) return;
    await this.prisma.travelMapPlaceReport.create({
      data: { placeId: id, reporterId: viewer.sub, reason },
    });
  }

  // ===== Свежесть: «был здесь» =====

  async checkPlace(
    viewer: AccessTokenPayload,
    placeId: string,
    body: unknown,
  ): Promise<TravelMapFreshnessDto> {
    const verdict = parseVerdict(body);
    const place = await this.requireVisible(viewer, placeId);
    const now = new Date();

    // Одна отметка на человека: смена «закрылось» на «был» перезаписывает,
    // а не копит голоса.
    await this.prisma.travelMapCheck.upsert({
      where: { placeId_userId: { placeId, userId: viewer.sub } },
      create: { placeId, userId: viewer.sub, verdict },
      update: { verdict },
    });

    let lastConfirmedAt = place.lastConfirmedAt;
    if (verdict === 'confirmed') {
      await this.prisma.travelMapPlace.update({
        where: { id: placeId },
        data: { lastConfirmedAt: now },
      });
      lastConfirmedAt = now;
    }

    const closedVotes = await this.countClosedVotes(placeId, now);
    // Ровно порог, а не «не меньше»: третий и следующие голоса не должны
    // плодить жалобы. Открытая жалоба системы — вторая защита от дубля.
    if (
      verdict === 'closed' &&
      closedVotes === TRAVEL_MAP_CLOSED_VOTES_TO_REPORT
    ) {
      const open = await this.prisma.travelMapPlaceReport.findFirst({
        where: { placeId, reporterId: null, status: 'open' },
        select: { id: true },
      });
      if (!open) {
        await this.prisma.travelMapPlaceReport.create({
          data: {
            placeId,
            reporterId: null,
            reason: CLOSED_AUTO_REPORT_REASON,
          },
        });
      }
    }

    const confirmations = await this.prisma.travelMapCheck.count({
      where: { placeId, verdict: 'confirmed' },
    });
    return buildFreshness(
      {
        lastConfirmedAt,
        updatedAt: place.updatedAt,
        confirmations,
        closedVotes,
        myVerdict: verdict,
      },
      now,
    );
  }

  // ===== Заметки =====

  async listNotes(
    viewer: AccessTokenPayload,
    placeId: string,
  ): Promise<TravelMapNoteDto[]> {
    await this.requireVisible(viewer, placeId);
    const rows = await this.prisma.travelMapNote.findMany({
      where: { placeId },
      include: noteInclude,
      orderBy: { createdAt: 'desc' },
      take: TRAVEL_MAP_NOTES_PER_PLACE,
    });
    return rows.map((row) => this.noteOf(viewer, row));
  }

  async addNote(
    viewer: AccessTokenPayload,
    placeId: string,
    body: unknown,
  ): Promise<TravelMapNoteDto> {
    const text = parseNoteText(body);
    await this.requireVisible(viewer, placeId);
    const row = await this.prisma.travelMapNote.create({
      data: { placeId, authorId: viewer.sub, text },
      include: noteInclude,
    });
    return this.noteOf(viewer, row);
  }

  async deleteNote(
    viewer: AccessTokenPayload,
    placeId: string,
    noteId: string,
  ): Promise<void> {
    const note = await this.prisma.travelMapNote.findUnique({
      where: { id: noteId },
      select: { id: true, placeId: true, authorId: true },
    });
    // Заметка из другого места — та же «не найдена»: путь не должен
    // позволять удалять чужое, подставив свой placeId.
    if (!note || note.placeId !== placeId) {
      throw new NotFoundException('Заметка не найдена');
    }
    if (note.authorId !== viewer.sub && !isAdmin(viewer)) {
      throw new ForbiddenException('Удалить заметку может только её автор');
    }
    await this.prisma.travelMapNote.delete({ where: { id: noteId } });
  }

  private noteOf(viewer: AccessTokenPayload, row: NoteRow): TravelMapNoteDto {
    return {
      id: row.id,
      placeId: row.placeId,
      text: row.text,
      author: authorOf(row.author),
      canDelete: row.authorId === viewer.sub || isAdmin(viewer),
      createdAt: row.createdAt.toISOString(),
    };
  }

  /** Место, которое смотрящий вправе видеть: спрятанное — только автору и админу. */
  private async requireVisible(viewer: AccessTokenPayload, id: string) {
    const row = await this.prisma.travelMapPlace.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        createdById: true,
        lastConfirmedAt: true,
        updatedAt: true,
      },
    });
    if (!row || (row.status === 'hidden' && !this.canEdit(viewer, row))) {
      throw new NotFoundException('Место не найдено');
    }
    return row;
  }

  // ===== Администрация =====

  async adminListPlaces(
    viewer: AccessTokenPayload,
    rawQuery: Record<string, unknown>,
  ): Promise<TravelMapPlaceDto[]> {
    this.requireAdmin(viewer);
    const query = parseAdminPlacesQuery(rawQuery);
    const where: Prisma.TravelMapPlaceWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.verified !== null) {
      where.verifiedAt = query.verified ? { not: null } : null;
    }
    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: 'insensitive' } },
        { city: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    const rows = await this.prisma.travelMapPlace.findMany({
      where,
      include: placeInclude,
      orderBy: { createdAt: 'desc' },
      take: ADMIN_PLACES_LIMIT,
    });
    // Список админки — обзор, а не карточка: счётчики отметок здесь не
    // показываются, лишние запросы на 200 строк ни к чему.
    return rows.map((row) =>
      this.toPlaceDto(viewer, row, this.emptyFreshness(row)),
    );
  }

  async adminVerify(
    viewer: AccessTokenPayload,
    id: string,
  ): Promise<TravelMapPlaceDto> {
    return this.adminUpdate(viewer, id, {
      verifiedAt: new Date(),
      verifiedById: viewer.sub,
    });
  }

  async adminUnverify(
    viewer: AccessTokenPayload,
    id: string,
  ): Promise<TravelMapPlaceDto> {
    return this.adminUpdate(viewer, id, {
      verifiedAt: null,
      verifiedById: null,
    });
  }

  async adminHide(
    viewer: AccessTokenPayload,
    id: string,
    body: unknown,
  ): Promise<TravelMapPlaceDto> {
    const reason = parseHideReason(body);
    return this.adminUpdate(viewer, id, {
      status: 'hidden',
      hiddenReason: reason,
    });
  }

  async adminUnhide(
    viewer: AccessTokenPayload,
    id: string,
  ): Promise<TravelMapPlaceDto> {
    return this.adminUpdate(viewer, id, {
      status: 'active',
      hiddenReason: null,
    });
  }

  async adminListReports(
    viewer: AccessTokenPayload,
    rawQuery: Record<string, unknown>,
  ): Promise<TravelMapReportDto[]> {
    this.requireAdmin(viewer);
    const query = parseAdminReportsQuery(rawQuery);
    const rows = await this.prisma.travelMapPlaceReport.findMany({
      where: query.status ? { status: query.status } : {},
      include: {
        place: { select: { name: true } },
        reporter: { select: userSelect },
      },
      orderBy: { createdAt: 'desc' },
      take: ADMIN_REPORTS_LIMIT,
    });
    return rows.map((row) => ({
      id: row.id,
      placeId: row.placeId,
      placeName: row.place.name,
      reason: row.reason,
      status: row.status,
      reporter: authorOf(row.reporter),
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async adminResolveReport(
    viewer: AccessTokenPayload,
    id: string,
  ): Promise<void> {
    this.requireAdmin(viewer);
    const report = await this.prisma.travelMapPlaceReport.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!report) throw new NotFoundException('Жалоба не найдена');
    await this.prisma.travelMapPlaceReport.update({
      where: { id },
      data: { status: 'resolved' },
    });
  }

  // ===== Внутреннее =====

  private requireAdmin(viewer: AccessTokenPayload): void {
    if (!isAdmin(viewer)) throw new ForbiddenException('Нужны права админа');
  }

  private canEdit(
    viewer: AccessTokenPayload,
    row: { createdById: string | null },
  ): boolean {
    return row.createdById === viewer.sub || isAdmin(viewer);
  }

  private async requireEditable(viewer: AccessTokenPayload, id: string) {
    const row = await this.prisma.travelMapPlace.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Место не найдено');
    if (!this.canEdit(viewer, row)) {
      throw new ForbiddenException('Менять место может только его автор');
    }
    return row;
  }

  private async adminUpdate(
    viewer: AccessTokenPayload,
    id: string,
    data: Prisma.TravelMapPlaceUncheckedUpdateInput,
  ): Promise<TravelMapPlaceDto> {
    this.requireAdmin(viewer);
    const exists = await this.prisma.travelMapPlace.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Место не найдено');
    const row = await this.prisma.travelMapPlace.update({
      where: { id },
      data,
      include: placeInclude,
    });
    return this.toPlaceDto(viewer, row, await this.loadFreshness(viewer, row));
  }

  private emptyFreshness(row: PlaceRow): TravelMapFreshnessDto {
    return buildFreshness(
      { ...row, confirmations: 0, closedVotes: 0, myVerdict: null },
      new Date(),
    );
  }

  private async loadFreshness(
    viewer: AccessTokenPayload,
    row: PlaceRow,
  ): Promise<TravelMapFreshnessDto> {
    const now = new Date();
    const [confirmations, closedVotes, mine] = await Promise.all([
      this.prisma.travelMapCheck.count({
        where: { placeId: row.id, verdict: 'confirmed' },
      }),
      this.countClosedVotes(row.id, now),
      this.prisma.travelMapCheck.findUnique({
        where: { placeId_userId: { placeId: row.id, userId: viewer.sub } },
        select: { verdict: true },
      }),
    ]);
    return buildFreshness(
      { ...row, confirmations, closedVotes, myVerdict: mine?.verdict ?? null },
      now,
    );
  }

  private countClosedVotes(placeId: string, now: Date): Promise<number> {
    return this.prisma.travelMapCheck.count({
      where: {
        placeId,
        verdict: 'closed',
        updatedAt: { gte: closedWindowStart(now) },
      },
    });
  }

  private toPlaceDto(
    viewer: AccessTokenPayload,
    row: PlaceRow,
    freshness: TravelMapFreshnessDto,
  ): TravelMapPlaceDto {
    const author = this.canEdit(viewer, row);
    return {
      ...pointOf(row),
      freshness,
      description: row.description,
      address: row.address,
      country: row.country,
      openingHours: row.openingHours,
      website: row.website,
      phone: row.phone,
      telegram: row.telegram,
      photoUrls: row.photoUrls,
      status: row.status,
      // Причину скрытия видит тот, кто может править, — автор и админ.
      hiddenReason: author ? row.hiddenReason : null,
      verifiedAt: row.verifiedAt?.toISOString() ?? null,
      author: authorOf(row.createdBy),
      canEdit: author,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
