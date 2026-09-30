import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  resolveDisplayName,
  TRAVEL_MAP_ROUTE_KINDS,
  TRAVEL_MAP_STOP_PHOTOS_MAX,
  TRAVEL_MAP_STOP_STORY_MAX,
  type AccessTokenPayload,
  type TravelMapAuthorDto,
  type TravelMapRouteDto,
  type TravelMapRouteKind,
  type TravelMapRouteSummaryDto,
  type TravelMapRoutesResponse,
} from '@vedamatch/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { isAdmin } from '../is-admin';
import { isStale } from './map-freshness';
import { parseHideReason } from './map-input';
import {
  TravelMapPhotosService,
  type UploadedMapPhoto,
} from './travel-map-photos.service';
import { routeDistanceKm } from './route-geo';
import {
  parseCreateRouteInput,
  parseUpdateRouteInput,
  type RouteStopValue,
} from './route-input';

export const ROUTES_LIMIT = 200;
const ADMIN_ROUTES_LIMIT = 200;
const Q_MAX = 100;

// `spiritualName` и `isAgent` тянем всегда: имя наружу собирает
// resolveDisplayName, а признак ИИ едет рядом с ним.
const userSelect = {
  id: true,
  name: true,
  spiritualName: true,
  isAgent: true,
} as const;

const routeInclude = { author: { select: userSelect } } as const;
type RouteRow = Prisma.TravelMapRouteGetPayload<{
  include: typeof routeInclude;
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

function summaryOf(row: RouteRow): TravelMapRouteSummaryDto {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    city: row.city,
    stopsCount: row.stopsCount,
    distanceKm: row.distanceKm,
    startLat: row.startLat,
    startLng: row.startLng,
    author: authorOf(row.author),
    status: row.status,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function str(raw: Record<string, unknown> | undefined, key: string) {
  const v = raw?.[key];
  return typeof v === 'string' ? v : undefined;
}

/** Рамка — четыре границы или ни одной, как в map-query.ts. */
function parseBbox(raw: Record<string, unknown>) {
  const keys = ['minLat', 'maxLat', 'minLng', 'maxLng'] as const;
  const given = keys.filter((key) => str(raw, key)?.trim());
  if (given.length === 0) return null;
  if (given.length !== keys.length) {
    throw new BadRequestException(
      'Рамка карты задаётся четырьмя границами: minLat, maxLat, minLng, maxLng',
    );
  }
  const [minLat, maxLat, minLng, maxLng] = keys.map((key) =>
    Number(str(raw, key)),
  );
  if ([minLat, maxLat, minLng, maxLng].some((v) => !Number.isFinite(v))) {
    throw new BadRequestException('Границы рамки карты должны быть числами');
  }
  if (minLat > maxLat || minLng > maxLng) {
    throw new BadRequestException('Границы рамки карты перепутаны');
  }
  return { minLat, maxLat, minLng, maxLng };
}

function parseQ(raw: Record<string, unknown>): string | null {
  const q = str(raw, 'q')?.trim();
  return q ? q.slice(0, Q_MAX) : null;
}

/** Денормализация из остановок: список и метка старта читаются без join. */
function denormalize(stops: RouteStopValue[]) {
  return {
    stopsCount: stops.length,
    distanceKm: routeDistanceKm(stops),
    startLat: stops[0].lat,
    startLng: stops[0].lng,
  };
}

@Injectable()
export class TravelMapRoutesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly photos: TravelMapPhotosService,
  ) {}

  async list(
    _viewer: AccessTokenPayload,
    rawQuery: Record<string, unknown>,
  ): Promise<TravelMapRoutesResponse> {
    const where: Prisma.TravelMapRouteWhereInput = { status: 'active' };
    const bbox = parseBbox(rawQuery);
    if (bbox) {
      where.startLat = { gte: bbox.minLat, lte: bbox.maxLat };
      where.startLng = { gte: bbox.minLng, lte: bbox.maxLng };
    }
    const kinds = (str(rawQuery, 'kinds') ?? '')
      .split(',')
      .map((k) => k.trim())
      .filter((k): k is TravelMapRouteKind =>
        (TRAVEL_MAP_ROUTE_KINDS as readonly string[]).includes(k),
      );
    if (kinds.length > 0) where.kind = { in: [...new Set(kinds)] };
    const q = parseQ(rawQuery);
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { city: { contains: q, mode: 'insensitive' } },
      ];
    }
    const rows = await this.prisma.travelMapRoute.findMany({
      where,
      include: routeInclude,
      orderBy: { updatedAt: 'desc' },
      // Лишняя строка — признак «маршрутов больше лимита», без count().
      take: ROUTES_LIMIT + 1,
    });
    return {
      routes: rows.slice(0, ROUTES_LIMIT).map(summaryOf),
      truncated: rows.length > ROUTES_LIMIT,
    };
  }

  async get(
    viewer: AccessTokenPayload,
    id: string,
  ): Promise<TravelMapRouteDto> {
    const row = await this.prisma.travelMapRoute.findUnique({
      where: { id },
      include: {
        ...routeInclude,
        stops: {
          orderBy: { position: 'asc' },
          include: {
            place: {
              select: {
                kind: true,
                photoUrls: true,
                lastConfirmedAt: true,
                updatedAt: true,
              },
            },
          },
        },
      },
    });
    // Скрытый — «не найдено», а не «запрещено»: не подтверждаем существование.
    if (!row || (row.status === 'hidden' && !this.canEdit(viewer, row))) {
      throw new NotFoundException('Маршрут не найден');
    }
    const now = new Date();
    return {
      ...this.dtoOf(viewer, row),
      stops: row.stops.map((s) => ({
        id: s.id,
        position: s.position,
        placeId: s.placeId,
        name: s.name,
        lat: s.lat,
        lng: s.lng,
        note: s.note,
        media: {
          photoUrls: s.photoUrls,
          videoUrl: s.videoUrl,
          story: s.story,
        },
        place: s.place
          ? {
              kind: s.place.kind,
              photoUrl: s.place.photoUrls[0] ?? null,
              stale: isStale(now, s.place),
            }
          : null,
      })),
    };
  }

  async create(
    viewer: AccessTokenPayload,
    body: unknown,
  ): Promise<TravelMapRouteDto> {
    const input = parseCreateRouteInput(body);
    await this.assertPlacesUsable(input.stops);
    const id = await this.prisma.$transaction(async (tx) => {
      const route = await tx.travelMapRoute.create({
        data: {
          kind: input.kind,
          name: input.name,
          description: input.description,
          city: input.city,
          country: input.country,
          authorId: viewer.sub,
          ...denormalize(input.stops),
        },
        select: { id: true },
      });
      await tx.travelMapRouteStop.createMany({
        data: this.stopRows(route.id, input.stops),
      });
      return route.id;
    });
    return this.get(viewer, id);
  }

  async update(
    viewer: AccessTokenPayload,
    id: string,
    body: unknown,
  ): Promise<TravelMapRouteDto> {
    const input = parseUpdateRouteInput(body);
    const row = await this.prisma.travelMapRoute.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Маршрут не найден');
    if (!this.canEdit(viewer, row)) {
      throw new ForbiddenException('Менять маршрут может только его автор');
    }
    const { stops, ...fields } = input;
    if (stops) await this.assertPlacesUsable(stops);

    let orphanKeys: string[] = [];
    await this.prisma.$transaction(async (tx) => {
      if (stops) {
        orphanKeys = await this.syncStops(tx, id, stops);
      }
      await tx.travelMapRoute.update({
        where: { id },
        data: { ...fields, ...(stops ? denormalize(stops) : {}) },
      });
    });
    // Файлы удалённых остановок чистим после коммита: если транзакция
    // откатилась, строки живы и ссылаются на эти ключи.
    await this.removeKeys(orphanKeys);
    return this.get(viewer, id);
  }

  async remove(viewer: AccessTokenPayload, id: string): Promise<void> {
    const row = await this.prisma.travelMapRoute.findUnique({
      where: { id },
      select: {
        id: true,
        authorId: true,
        stops: { select: { photoKeys: true, videoKey: true } },
      },
    });
    if (!row) throw new NotFoundException('Маршрут не найден');
    if (!this.canEdit(viewer, row)) {
      throw new ForbiddenException('Удалить маршрут может только его автор');
    }
    // Остановки уйдут каскадом.
    await this.prisma.travelMapRoute.delete({ where: { id } });
    // Ключи собрали до удаления, чистим S3 после: строки уже не вернуть.
    await this.removeKeys(row.stops.flatMap((s) => this.stopKeys(s)));
  }

  // ===== Медиа остановки =====

  async addStopPhoto(
    viewer: AccessTokenPayload,
    routeId: string,
    stopId: string,
    file: UploadedMapPhoto | undefined,
  ): Promise<TravelMapRouteDto> {
    const stop = await this.editableStop(viewer, routeId, stopId);
    if (stop.photoKeys.length >= TRAVEL_MAP_STOP_PHOTOS_MAX) {
      throw new BadRequestException(
        `На остановке не больше ${TRAVEL_MAP_STOP_PHOTOS_MAX} фото`,
      );
    }
    const { key, url } = await this.photos.uploadImage(
      `travel/map/routes/${routeId}/${stopId}`,
      file,
    );
    // Массивы дописываем атомарно (push), а не перезаписываем прочитанным
    // списком: два одновременных фото не затрут друг друга.
    await this.prisma.travelMapRouteStop.update({
      where: { id: stopId },
      data: { photoKeys: { push: key }, photoUrls: { push: url } },
    });
    return this.get(viewer, routeId);
  }

  async removeStopPhoto(
    viewer: AccessTokenPayload,
    routeId: string,
    stopId: string,
    index: number,
  ): Promise<TravelMapRouteDto> {
    const stop = await this.editableStop(viewer, routeId, stopId);
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= stop.photoKeys.length
    ) {
      throw new NotFoundException('Фото не найдено');
    }
    const key = stop.photoKeys[index];
    await this.prisma.travelMapRouteStop.update({
      where: { id: stopId },
      data: {
        photoKeys: stop.photoKeys.filter((_, i) => i !== index),
        photoUrls: stop.photoUrls.filter((_, i) => i !== index),
      },
    });
    await this.photos.remove(key);
    return this.get(viewer, routeId);
  }

  async setStopVideo(
    viewer: AccessTokenPayload,
    routeId: string,
    stopId: string,
    file: UploadedMapPhoto | undefined,
  ): Promise<TravelMapRouteDto> {
    const stop = await this.editableStop(viewer, routeId, stopId);
    const { key, url } = await this.photos.uploadVideo(
      `travel/map/routes/${routeId}/${stopId}`,
      file,
    );
    await this.prisma.travelMapRouteStop.update({
      where: { id: stopId },
      data: { videoKey: key, videoUrl: url },
    });
    // Старое видео убираем только после того, как новое записано.
    await this.photos.remove(stop.videoKey);
    return this.get(viewer, routeId);
  }

  async removeStopVideo(
    viewer: AccessTokenPayload,
    routeId: string,
    stopId: string,
  ): Promise<TravelMapRouteDto> {
    const stop = await this.editableStop(viewer, routeId, stopId);
    await this.prisma.travelMapRouteStop.update({
      where: { id: stopId },
      data: { videoKey: null, videoUrl: null },
    });
    await this.photos.remove(stop.videoKey);
    return this.get(viewer, routeId);
  }

  async updateStopStory(
    viewer: AccessTokenPayload,
    routeId: string,
    stopId: string,
    body: unknown,
  ): Promise<TravelMapRouteDto> {
    await this.editableStop(viewer, routeId, stopId);
    const raw =
      body && typeof body === 'object'
        ? (body as Record<string, unknown>).story
        : undefined;
    if (typeof raw !== 'string') {
      throw new BadRequestException('Рассказ должен быть строкой');
    }
    const story = raw.trim();
    if (story.length > TRAVEL_MAP_STOP_STORY_MAX) {
      throw new BadRequestException(
        `Рассказ — не длиннее ${TRAVEL_MAP_STOP_STORY_MAX} символов`,
      );
    }
    await this.prisma.travelMapRouteStop.update({
      where: { id: stopId },
      data: { story },
    });
    return this.get(viewer, routeId);
  }

  // ===== Администрация =====

  async adminList(
    viewer: AccessTokenPayload,
    rawQuery: Record<string, unknown>,
  ): Promise<TravelMapRouteSummaryDto[]> {
    this.requireAdmin(viewer);
    const where: Prisma.TravelMapRouteWhereInput = {};
    const status = str(rawQuery, 'status');
    if (status === 'active' || status === 'hidden') {
      where.status = status;
    }
    const q = parseQ(rawQuery);
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { city: { contains: q, mode: 'insensitive' } },
      ];
    }
    const rows = await this.prisma.travelMapRoute.findMany({
      where,
      include: routeInclude,
      orderBy: { updatedAt: 'desc' },
      take: ADMIN_ROUTES_LIMIT,
    });
    return rows.map(summaryOf);
  }

  async adminHide(
    viewer: AccessTokenPayload,
    id: string,
    body: unknown,
  ): Promise<TravelMapRouteSummaryDto> {
    this.requireAdmin(viewer);
    const reason = parseHideReason(body);
    return this.adminUpdate(id, { status: 'hidden', hiddenReason: reason });
  }

  async adminUnhide(
    viewer: AccessTokenPayload,
    id: string,
  ): Promise<TravelMapRouteSummaryDto> {
    this.requireAdmin(viewer);
    return this.adminUpdate(id, { status: 'active', hiddenReason: null });
  }

  // ===== Внутреннее =====

  private async adminUpdate(
    id: string,
    data: Prisma.TravelMapRouteUncheckedUpdateInput,
  ): Promise<TravelMapRouteSummaryDto> {
    const exists = await this.prisma.travelMapRoute.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Маршрут не найден');
    const row = await this.prisma.travelMapRoute.update({
      where: { id },
      data,
      include: routeInclude,
    });
    return summaryOf(row);
  }

  /**
   * Ссылаться из остановки можно только на живое место: скрытое или
   * несуществующее дало бы маршрут с дырой. Одним запросом на все id.
   */
  private async assertPlacesUsable(stops: RouteStopValue[]): Promise<void> {
    const ids = [
      ...new Set(stops.map((s) => s.placeId).filter((v): v is string => !!v)),
    ];
    if (ids.length === 0) return;
    const found = await this.prisma.travelMapPlace.findMany({
      where: { id: { in: ids }, status: 'active' },
      select: { id: true },
    });
    if (found.length !== ids.length) {
      throw new BadRequestException(
        'Одна из остановок ссылается на место, которого нет на карте',
      );
    }
  }

  /**
   * Остановка маршрута для правки: маршрут есть, viewer — автор или админ,
   * остановка принадлежит именно этому маршруту (чужая — 404, а не 403, чтобы
   * не подтверждать существование).
   */
  private async editableStop(
    viewer: AccessTokenPayload,
    routeId: string,
    stopId: string,
  ) {
    const route = await this.prisma.travelMapRoute.findUnique({
      where: { id: routeId },
      select: { id: true, authorId: true },
    });
    if (!route) throw new NotFoundException('Маршрут не найден');
    if (!this.canEdit(viewer, route)) {
      throw new ForbiddenException('Менять маршрут может только его автор');
    }
    const stop = await this.prisma.travelMapRouteStop.findUnique({
      where: { id: stopId },
      select: {
        id: true,
        routeId: true,
        photoKeys: true,
        photoUrls: true,
        videoKey: true,
      },
    });
    if (!stop || stop.routeId !== routeId) {
      throw new NotFoundException('Остановка не найдена');
    }
    return stop;
  }

  private stopKeys(s: { photoKeys: string[]; videoKey: string | null }) {
    return [...s.photoKeys, ...(s.videoKey ? [s.videoKey] : [])];
  }

  private async removeKeys(keys: string[]): Promise<void> {
    for (const key of keys) await this.photos.remove(key);
  }

  /**
   * Приводит остановки маршрута к присланному списку, не трогая медиа тех,
   * что остались: с `id` — update, без — create, пропавшие — delete.
   * Возвращает ключи S3 удалённых остановок.
   *
   * Конфликт @@unique([routeId, position]) при перестановке обходим так:
   * после удаления лишних переводим оставшиеся в отрицательные позиции
   * (-1, -2, …; они различны и не пересекаются с настоящими, которые >= 0),
   * а затем одним проходом ставим итоговые. Два прохода по N строк — проще и
   * надёжнее, чем вычислять безопасный порядок сдвигов.
   */
  private async syncStops(
    tx: Prisma.TransactionClient,
    routeId: string,
    stops: RouteStopValue[],
  ): Promise<string[]> {
    const existing = await tx.travelMapRouteStop.findMany({
      where: { routeId },
      select: { id: true, photoKeys: true, videoKey: true },
    });
    const byId = new Map(existing.map((e) => [e.id, e]));
    const seen = new Set<string>();
    for (const s of stops) {
      if (!s.id) continue;
      if (!byId.has(s.id) || seen.has(s.id)) {
        throw new BadRequestException(
          'Остановка не принадлежит этому маршруту',
        );
      }
      seen.add(s.id);
    }
    const removed = existing.filter((e) => !seen.has(e.id));
    if (removed.length > 0) {
      await tx.travelMapRouteStop.deleteMany({
        where: { id: { in: removed.map((r) => r.id) } },
      });
    }
    const kept = stops.filter((s) => s.id);
    for (const [i, s] of kept.entries()) {
      await tx.travelMapRouteStop.update({
        where: { id: s.id as string },
        data: { position: -(i + 1) },
      });
    }
    for (const [position, s] of stops.entries()) {
      const data = {
        placeId: s.placeId,
        name: s.name,
        lat: s.lat,
        lng: s.lng,
        note: s.note,
        position,
      };
      if (s.id) {
        await tx.travelMapRouteStop.update({ where: { id: s.id }, data });
      } else {
        await tx.travelMapRouteStop.create({ data: { ...data, routeId } });
      }
    }
    return removed.flatMap((r) => this.stopKeys(r));
  }

  private stopRows(routeId: string, stops: RouteStopValue[]) {
    return stops.map((s, position) => ({
      routeId,
      position,
      placeId: s.placeId,
      name: s.name,
      lat: s.lat,
      lng: s.lng,
      note: s.note,
    }));
  }

  private dtoOf(viewer: AccessTokenPayload, row: RouteRow) {
    return {
      ...summaryOf(row),
      description: row.description,
      country: row.country,
      hiddenReason: row.hiddenReason,
      canEdit: this.canEdit(viewer, row),
      createdAt: row.createdAt.toISOString(),
    };
  }

  private canEdit(
    viewer: AccessTokenPayload,
    row: { authorId: string | null },
  ): boolean {
    return row.authorId === viewer.sub || isAdmin(viewer);
  }

  private requireAdmin(viewer: AccessTokenPayload): void {
    if (!isAdmin(viewer)) throw new ForbiddenException('Нужны права админа');
  }
}
