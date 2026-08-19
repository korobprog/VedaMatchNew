import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CreateMarketShopRequest,
  MarketLocationDto,
  MarketShopDto,
  MarketShopListResponse,
  MarketShopSummary,
  ProfileMessengers,
  UpdateMarketShopRequest,
} from '@vedamatch/shared';
import { normalizeCityKey } from '../../common/city-key';
import { PrismaService } from '../../prisma/prisma.service';
import { OWNER_SHOP_STATUSES, assertOneOf } from './market-enums';
import {
  MarketImagesService,
  type UploadedImageFile,
} from './market-images.service';
import { buildShopSlug, isReservedShopSlug, withSlugSuffix } from './shop-slug';

const MAX_NAME_LENGTH = 80;
const MAX_TAGLINE_LENGTH = 160;
const MAX_ABOUT_LENGTH = 4000;
const SHOPS_PAGE_SIZE = 24;
/** Больше — почти наверняка гонка или подбор слага, а не живой пользователь. */
const MAX_SLUG_ATTEMPTS = 20;

const SHOP_SELECT = {
  id: true,
  ownerId: true,
  slug: true,
  name: true,
  taglineRu: true,
  taglineEn: true,
  aboutRu: true,
  aboutEn: true,
  logoUrl: true,
  logoKey: true,
  coverUrl: true,
  coverKey: true,
  location: true,
  city: true,
  country: true,
  messengers: true,
  deliveryOptions: true,
  status: true,
  listingsCount: true,
  ordersCount: true,
  reviewsCount: true,
  ratingAvg: true,
  followersCount: true,
  createdAt: true,
} satisfies Prisma.MarketShopSelect;

type ShopRow = Prisma.MarketShopGetPayload<{ select: typeof SHOP_SELECT }>;

@Injectable()
export class MarketShopsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly images: MarketImagesService,
  ) {}

  /**
   * Витрина магазина. Заблокированный или закрытый магазин видит только
   * владелец и админ — покупателю он не должен попадаться даже по прямой ссылке.
   */
  async bySlug(
    slug: string,
    viewerId: string | undefined,
    viewerIsAdmin: boolean,
  ): Promise<MarketShopDto> {
    const shop = await this.prisma.marketShop.findUnique({
      where: { slug },
      select: SHOP_SELECT,
    });
    if (!shop) throw new NotFoundException('shop_not_found');

    const isOwner = Boolean(viewerId) && shop.ownerId === viewerId;
    if (shop.status !== 'active' && !isOwner && !viewerIsAdmin) {
      throw new NotFoundException('shop_not_found');
    }
    if (await this.isHiddenByBlock(shop.ownerId, viewerId)) {
      throw new NotFoundException('shop_not_found');
    }

    return toShopDto(shop, isOwner || viewerIsAdmin);
  }

  async mine(userId: string): Promise<MarketShopDto | null> {
    const shop = await this.prisma.marketShop.findUnique({
      where: { ownerId: userId },
      select: SHOP_SELECT,
    });
    return shop ? toShopDto(shop, true) : null;
  }

  async list(
    params: { q?: string; city?: string; country?: string; cursor?: string },
    viewerId: string | undefined,
  ): Promise<MarketShopListResponse> {
    const where: Prisma.MarketShopWhereInput = {
      status: 'active',
      // Пустую витрину в справочнике показывать незачем.
      listingsCount: { gt: 0 },
    };

    const q = params.q?.trim();
    if (q && q.length >= 2) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { taglineRu: { contains: q, mode: 'insensitive' } },
        { taglineEn: { contains: q, mode: 'insensitive' } },
      ];
    }
    // Город — по нормализованному ключу (индекс (status, cityKey)), а не через
    // `mode: 'insensitive'`: Prisma превращает его в ILIKE и мимо индекса.
    if (params.city?.trim()) {
      where.cityKey = normalizeCityKey(params.city);
    }
    if (params.country?.trim()) {
      where.country = { equals: params.country.trim(), mode: 'insensitive' };
    }

    const blockedOwnerIds = await this.blockedUserIds(viewerId);
    if (blockedOwnerIds.length > 0) {
      where.ownerId = { notIn: blockedOwnerIds };
    }

    const cursor = decodeShopCursor(params.cursor);
    if (cursor) {
      where.AND = [
        {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.marketShop.findMany({
        where,
        select: { ...SHOP_SELECT, createdAt: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: SHOPS_PAGE_SIZE + 1,
      }),
      this.prisma.marketShop.count({ where }),
    ]);

    const hasMore = rows.length > SHOPS_PAGE_SIZE;
    const items = hasMore ? rows.slice(0, SHOPS_PAGE_SIZE) : rows;
    const last = items[items.length - 1];

    return {
      items: items.map(toShopSummary),
      nextCursor: hasMore && last ? encodeShopCursor(last) : null,
      total,
    };
  }

  async create(
    userId: string,
    body: CreateMarketShopRequest,
  ): Promise<MarketShopDto> {
    // Согласие с правилами — обязательное условие, а не галочка для вида:
    // именно на него ссылается модерация, снимая объявление.
    if (!body.rulesAccepted)
      throw new BadRequestException('rules_not_accepted');

    const existing = await this.prisma.marketShop.findUnique({
      where: { ownerId: userId },
      select: { id: true },
    });
    if (existing) throw new ConflictException('shop_already_exists');

    const name = body.name?.trim() ?? '';
    if (!name) throw new BadRequestException('shop_name_required');
    if (name.length > MAX_NAME_LENGTH) {
      throw new BadRequestException('shop_name_too_long');
    }

    const texts = this.normalizeTexts(body);
    const slug = await this.allocateSlug(body.slug?.trim() || name);
    // Гео берём из портального профиля, если магазин своё не прислал: чтение
    // User read-only разрешено контрактом, а владелец потом переопределит.
    const location = body.location ?? (await this.homeLocationOf(userId));

    const created = await this.prisma.marketShop.create({
      data: {
        ownerId: userId,
        slug,
        name,
        ...texts,
        ...locationColumns(location),
        messengers: (body.messengers ?? {}) as Prisma.InputJsonValue,
        deliveryOptions: body.deliveryOptions ?? [],
        rulesAcceptedAt: new Date(),
      },
      select: SHOP_SELECT,
    });

    return toShopDto(created, true);
  }

  async update(
    userId: string,
    viewerIsAdmin: boolean,
    id: string,
    body: UpdateMarketShopRequest,
  ): Promise<MarketShopDto> {
    const shop = await this.assertOwner(id, userId, viewerIsAdmin);

    const data: Prisma.MarketShopUpdateInput = {};

    if (body.name !== undefined) {
      const name = body.name.trim();
      if (!name) throw new BadRequestException('shop_name_required');
      if (name.length > MAX_NAME_LENGTH) {
        throw new BadRequestException('shop_name_too_long');
      }
      data.name = name;
    }

    Object.assign(data, this.normalizeTexts(body, shop));

    if (body.location !== undefined) {
      Object.assign(data, locationColumns(body.location));
    }
    if (body.messengers !== undefined) {
      data.messengers = body.messengers as Prisma.InputJsonValue;
    }
    if (body.deliveryOptions !== undefined) {
      data.deliveryOptions = body.deliveryOptions;
    }
    // Владелец переключает только между «работает» и «закрыт»; статусы
    // модерации ставит система и админ, и через этот маршрут их не снять.
    if (body.status !== undefined) {
      // Тип DTO сужает статус до active|closed, но тип не защищает от JSON:
      // без проверки владелец мог бы прислать `blocked_by_admin` или мусор.
      const status = assertOneOf(
        OWNER_SHOP_STATUSES,
        body.status,
        'invalid_status',
      );
      if (
        shop.status !== 'active' &&
        shop.status !== 'closed' &&
        !viewerIsAdmin
      ) {
        throw new ForbiddenException('shop_status_locked');
      }
      data.status = status;
    }

    const updated = await this.prisma.marketShop.update({
      where: { id },
      data,
      select: SHOP_SELECT,
    });
    return toShopDto(updated, true);
  }

  async uploadImage(
    userId: string,
    viewerIsAdmin: boolean,
    id: string,
    kind: 'logo' | 'cover',
    file: UploadedImageFile | undefined,
  ): Promise<MarketShopDto> {
    const shop = await this.assertOwner(id, userId, viewerIsAdmin);

    const invalid = this.images.validate(file);
    if (invalid) throw new BadRequestException(invalid);
    if (!this.images.configured) {
      throw new BadRequestException('image_upload_unavailable');
    }

    const stored = await this.images.storeShopImage(id, kind, file!);
    if (!stored) throw new BadRequestException('image_upload_unavailable');

    // Ключ фиксированный, поэтому старый объект уже перезаписан — удалять
    // предыдущий не нужно и нечего.
    const updated = await this.prisma.marketShop.update({
      where: { id: shop.id },
      data:
        kind === 'logo'
          ? { logoKey: stored.key, logoUrl: stored.url }
          : { coverKey: stored.key, coverUrl: stored.url },
      select: SHOP_SELECT,
    });
    return toShopDto(updated, true);
  }

  /** Магазин владельца или 404. Общий вход для всех правок витрины. */
  async assertOwner(
    id: string,
    userId: string,
    viewerIsAdmin: boolean,
  ): Promise<ShopRow> {
    const shop = await this.prisma.marketShop.findUnique({
      where: { id },
      select: SHOP_SELECT,
    });
    if (!shop) throw new NotFoundException('shop_not_found');
    if (shop.ownerId !== userId && !viewerIsAdmin) {
      throw new ForbiddenException('not_shop_owner');
    }
    return shop;
  }

  /**
   * Пользователи, чьи магазины не должны попадаться зрителю: блокировка в
   * портале действует в обе стороны. `UserBlock` — портальная инфраструктура
   * модерации, читаем её read-only, как и модель `User`.
   */
  async blockedUserIds(viewerId: string | undefined): Promise<string[]> {
    if (!viewerId) return [];
    const blocks = await this.prisma.userBlock.findMany({
      where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] },
      select: { blockerId: true, blockedId: true },
    });
    const ids = new Set<string>();
    for (const block of blocks) {
      ids.add(block.blockerId === viewerId ? block.blockedId : block.blockerId);
    }
    return [...ids];
  }

  private async isHiddenByBlock(
    ownerId: string,
    viewerId: string | undefined,
  ): Promise<boolean> {
    if (!viewerId || ownerId === viewerId) return false;
    const block = await this.prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: viewerId, blockedId: ownerId },
          { blockerId: ownerId, blockedId: viewerId },
        ],
      },
      select: { blockerId: true },
    });
    return Boolean(block);
  }

  private async homeLocationOf(
    userId: string,
  ): Promise<MarketLocationDto | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { homeLocation: true },
    });
    const home = user?.homeLocation as MarketLocationDto | null | undefined;
    return home?.city ? home : null;
  }

  private async allocateSlug(source: string): Promise<string> {
    const base = buildShopSlug(source);
    for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
      const candidate = withSlugSuffix(base, attempt);
      // Зарезервированные слаги перехватили бы маршруты Рынка (/market/cart и
      // прочие), поэтому пропускаем их и берём следующий суффикс.
      if (isReservedShopSlug(candidate)) continue;
      const taken = await this.prisma.marketShop.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      if (!taken) return candidate;
    }
    throw new ConflictException('slug_taken');
  }

  private normalizeTexts(
    body: Partial<CreateMarketShopRequest & UpdateMarketShopRequest>,
    existing?: ShopRow,
  ): Partial<
    Record<'taglineRu' | 'taglineEn' | 'aboutRu' | 'aboutEn', string | null>
  > {
    const result: Record<string, string | null> = {};
    const fields = [
      ['taglineRu', MAX_TAGLINE_LENGTH],
      ['taglineEn', MAX_TAGLINE_LENGTH],
      ['aboutRu', MAX_ABOUT_LENGTH],
      ['aboutEn', MAX_ABOUT_LENGTH],
    ] as const;

    for (const [field, limit] of fields) {
      const incoming = body[field];
      if (incoming === undefined) {
        if (!existing) result[field] = null;
        continue;
      }
      const value = trimOrNull(incoming);
      if (value && value.length > limit) {
        throw new BadRequestException(
          limit === MAX_TAGLINE_LENGTH ? 'tagline_too_long' : 'about_too_long',
        );
      }
      result[field] = value;
    }
    return result;
  }
}

function locationColumns(location: MarketLocationDto | null | undefined) {
  if (!location) {
    return {
      location: Prisma.DbNull,
      city: null,
      cityKey: null,
      country: null,
      latitude: null,
      longitude: null,
    };
  }
  return {
    location: location as unknown as Prisma.InputJsonValue,
    city: location.city,
    cityKey: normalizeCityKey(location.city),
    country: location.country ?? null,
    latitude: location.lat,
    longitude: location.lon,
  };
}

export function toShopSummary(shop: ShopRow): MarketShopSummary {
  return {
    id: shop.id,
    slug: shop.slug,
    name: shop.name,
    logoUrl: shop.logoUrl,
    city: shop.city,
    country: shop.country,
    status: shop.status,
    listingsCount: shop.listingsCount,
    reviewsCount: shop.reviewsCount,
    ratingAvg: shop.ratingAvg,
  };
}

export function toShopDto(shop: ShopRow, canEdit: boolean): MarketShopDto {
  return {
    ...toShopSummary(shop),
    ownerId: shop.ownerId,
    taglineRu: shop.taglineRu,
    taglineEn: shop.taglineEn,
    aboutRu: shop.aboutRu,
    aboutEn: shop.aboutEn,
    coverUrl: shop.coverUrl,
    location: (shop.location as MarketLocationDto | null) ?? null,
    messengers: (shop.messengers as ProfileMessengers | null) ?? {},
    deliveryOptions: shop.deliveryOptions,
    ordersCount: shop.ordersCount,
    followersCount: shop.followersCount,
    createdAt: shop.createdAt.toISOString(),
    canEdit,
  };
}

function encodeShopCursor(shop: { createdAt: Date; id: string }): string {
  return Buffer.from(
    JSON.stringify({ c: shop.createdAt.toISOString(), i: shop.id }),
    'utf8',
  ).toString('base64url');
}

function decodeShopCursor(
  cursor: string | undefined,
): { createdAt: Date; id: string } | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    ) as { c?: unknown; i?: unknown };
    if (typeof parsed.c !== 'string' || typeof parsed.i !== 'string')
      return null;
    const createdAt = new Date(parsed.c);
    if (Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id: parsed.i };
  } catch {
    return null;
  }
}

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
