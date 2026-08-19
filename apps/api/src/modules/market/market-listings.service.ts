import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CreateMarketListingRequest,
  MarketListingDto,
  MarketListingFilters,
  MarketListingFeedResponse,
  MarketListingImagesResponse,
  MarketListingSummary,
  MarketLocationDto,
  ReorderMarketImagesRequest,
  SetMarketListingShelvesRequest,
  UpdateMarketListingRequest,
  UpdateMarketListingStatusRequest,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { isAvailable, isPubliclyVisible } from './market-availability';
import {
  PAGE_SIZE,
  cursorFilter,
  decodeCursor,
  encodeCursor,
  feedOrderBy,
  resolveSort,
} from './market-feed-query';
import {
  MAX_IMAGES_PER_LISTING,
  MarketImagesService,
  type UploadedImageFile,
} from './market-images.service';
import {
  MAX_CATEGORIES_PER_LISTING,
  validateListing,
} from './market-listing-validate';
import { MINOR_UNITS, parsePriceMajor, validatePrice } from './market-price';
import { MarketShopsService } from './market-shops.service';
import { MarketSubscriptionsService } from './market-subscriptions.service';

const LISTING_SELECT = {
  id: true,
  shopId: true,
  kind: true,
  titleRu: true,
  titleEn: true,
  descriptionRu: true,
  descriptionEn: true,
  priceMode: true,
  priceMinor: true,
  priceMaxMinor: true,
  currency: true,
  condition: true,
  quantity: true,
  trackStock: true,
  soldCount: true,
  serviceFormat: true,
  serviceDurationMinutes: true,
  location: true,
  city: true,
  country: true,
  deliveryOptions: true,
  status: true,
  primaryImageUrl: true,
  viewsCount: true,
  favoritesCount: true,
  commentsCount: true,
  ordersCount: true,
  publishedAt: true,
  createdAt: true,
  shop: {
    select: {
      id: true,
      slug: true,
      name: true,
      logoUrl: true,
      status: true,
      ownerId: true,
    },
  },
  images: {
    select: { id: true, url: true, width: true, height: true, sortOrder: true },
    orderBy: { sortOrder: 'asc' },
  },
  categories: {
    select: {
      category: {
        select: {
          id: true,
          slug: true,
          titleRu: true,
          titleEn: true,
          section: { select: { slug: true } },
        },
      },
    },
  },
  shelves: {
    select: {
      shelf: { select: { id: true, slug: true, titleRu: true, titleEn: true } },
    },
  },
} satisfies Prisma.MarketListingSelect;

type ListingRow = Prisma.MarketListingGetPayload<{
  select: typeof LISTING_SELECT;
}>;

/** Один просмотр на пользователя в сутки: иначе viewsCount превращается в
 *  счётчик перезагрузок страницы и врёт в статистике продавца. */
const VIEW_THROTTLE_MS = 24 * 60 * 60 * 1000;
/** Потолок карты просмотров: дальше — эвикция протухших ключей. Число с
 *  запасом относительно суточной аудитории, но не даёт памяти расти вечно. */
const VIEW_WRITES_MAX = 10_000;

@Injectable()
export class MarketListingsService {
  /** Ключ — `listingId:viewerId`, значение — момент последнего засчитанного
   *  просмотра. Память процесса: точность здесь не критична, а таблица ради
   *  счётчика просмотров не окупается. */
  private readonly viewWrites = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly images: MarketImagesService,
    private readonly shops: MarketShopsService,
    private readonly subscriptions: MarketSubscriptionsService,
  ) {}

  async feed(
    filters: MarketListingFilters,
    viewerId: string | undefined,
  ): Promise<MarketListingFeedResponse> {
    const sort = resolveSort(filters.sort);
    const where = await this.buildWhere(filters, viewerId);

    const cursor = decodeCursor(filters.cursor, sort);
    const finalWhere: Prisma.MarketListingWhereInput = cursor
      ? { AND: [where, cursorFilter(cursor)] }
      : where;

    const [rows, total] = await Promise.all([
      this.prisma.marketListing.findMany({
        where: finalWhere,
        select: LISTING_SELECT,
        orderBy: feedOrderBy(sort),
        take: PAGE_SIZE + 1,
      }),
      this.prisma.marketListing.count({ where }),
    ]);

    const hasMore = rows.length > PAGE_SIZE;
    const items = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
    const favorited = await this.favoritedAmong(
      viewerId,
      items.map((row) => row.id),
    );
    const last = items[items.length - 1];

    return {
      items: items.map((row) => toListingSummary(row, favorited.has(row.id))),
      nextCursor: hasMore && last ? encodeCursor(sort, last) : null,
      total,
    };
  }

  async byId(
    id: string,
    viewerId: string | undefined,
    viewerIsAdmin: boolean,
  ): Promise<MarketListingDto> {
    const listing = await this.prisma.marketListing.findUnique({
      where: { id },
      select: LISTING_SELECT,
    });
    if (!listing) throw new NotFoundException('listing_not_found');

    const isOwner = Boolean(viewerId) && listing.shop.ownerId === viewerId;
    if (
      !isPubliclyVisible({
        status: listing.status,
        shopStatus: listing.shop.status,
      }) &&
      !isOwner &&
      !viewerIsAdmin
    ) {
      throw new NotFoundException('listing_not_found');
    }
    if (
      viewerId &&
      !isOwner &&
      (await this.shops.blockedUserIds(viewerId)).includes(listing.shop.ownerId)
    ) {
      throw new NotFoundException('listing_not_found');
    }

    // Свои просмотры не считаем: иначе продавец накручивает себе статистику,
    // просто редактируя объявление. Просмотры гостей тоже не считаются —
    // их нечем ограничить до раза в сутки, а без ограничения счётчик
    // превращается в счётчик перезагрузок. В первой фазе витрина всё равно
    // за логином; когда её откроют гостям, сюда понадобится отдельный ключ.
    if (viewerId && !isOwner) this.countView(id, viewerId);

    const favorited = await this.favoritedAmong(viewerId, [id]);
    return toListingDto(listing, favorited.has(id), isOwner || viewerIsAdmin);
  }

  async create(
    userId: string,
    body: CreateMarketListingRequest,
  ): Promise<MarketListingDto> {
    const shop = await this.prisma.marketShop.findUnique({
      where: { ownerId: userId },
      select: {
        id: true,
        status: true,
        city: true,
        country: true,
        location: true,
      },
    });
    if (!shop) throw new NotFoundException('shop_not_found');
    if (shop.status !== 'active')
      throw new ForbiddenException('shop_not_active');

    const categoryIds = body.categoryIds ?? [];
    const categories = await this.resolveCategories(categoryIds);
    const price = this.resolvePrice(body.priceMode, body.price, body.priceMax);

    const invalid = validateListing({
      kind: body.kind,
      titleRu: body.titleRu,
      titleEn: body.titleEn,
      descriptionRu: body.descriptionRu,
      descriptionEn: body.descriptionEn,
      condition: body.condition,
      quantity: body.quantity,
      trackStock: body.trackStock,
      serviceFormat: body.serviceFormat,
      serviceDurationMinutes: body.serviceDurationMinutes,
      categoryIds,
      categorySlugs: categories.map((category) => category.slug),
    });
    if (invalid) throw new BadRequestException(invalid);

    const shelfIds = await this.resolveShelves(shop.id, body.shelfIds ?? []);
    // Гео объявления по умолчанию наследуется от витрины, но остаётся своим:
    // мастерская может стоять не там, где зарегистрирован магазин.
    const location =
      body.location ?? (shop.location as MarketLocationDto | null) ?? null;

    const created = await this.prisma.$transaction(async (tx) => {
      const listing = await tx.marketListing.create({
        data: {
          shopId: shop.id,
          kind: body.kind,
          titleRu: trimOrNull(body.titleRu),
          titleEn: trimOrNull(body.titleEn),
          descriptionRu: trimOrNull(body.descriptionRu),
          descriptionEn: trimOrNull(body.descriptionEn),
          priceMode: body.priceMode,
          priceMinor: price.minor,
          priceMaxMinor: price.maxMinor,
          currency: body.currency,
          condition: body.kind === 'product' ? (body.condition ?? null) : null,
          quantity: body.trackStock ? (body.quantity ?? 0) : null,
          trackStock:
            body.kind === 'product' ? Boolean(body.trackStock) : false,
          serviceFormat: body.kind === 'service' ? body.serviceFormat! : null,
          serviceDurationMinutes:
            body.kind === 'service'
              ? (body.serviceDurationMinutes ?? null)
              : null,
          ...locationColumns(location),
          deliveryOptions: body.deliveryOptions ?? [],
          categories: {
            create: categoryIds.map((categoryId) => ({ categoryId })),
          },
          shelves: { create: shelfIds.map((shelfId) => ({ shelfId })) },
        },
        select: { id: true },
      });

      await this.bumpCounters(tx, {
        shopId: shop.id,
        categoryIds,
        shelfIds,
        delta: 1,
      });
      return listing;
    });

    // Рассылка подписчикам — побочный эффект: она не должна ни задерживать
    // ответ, ни отменять уже созданное объявление, если упадёт.
    void this.subscriptions.notifyNewListing(created.id);

    return this.byId(created.id, userId, false);
  }

  async update(
    userId: string,
    viewerIsAdmin: boolean,
    id: string,
    body: UpdateMarketListingRequest,
  ): Promise<MarketListingDto> {
    const listing = await this.assertOwner(id, userId, viewerIsAdmin);

    const data: Prisma.MarketListingUpdateInput = {};

    if (body.titleRu !== undefined) data.titleRu = trimOrNull(body.titleRu);
    if (body.titleEn !== undefined) data.titleEn = trimOrNull(body.titleEn);
    if (body.descriptionRu !== undefined) {
      data.descriptionRu = trimOrNull(body.descriptionRu);
    }
    if (body.descriptionEn !== undefined) {
      data.descriptionEn = trimOrNull(body.descriptionEn);
    }

    if (
      body.priceMode !== undefined ||
      body.price !== undefined ||
      body.priceMax !== undefined
    ) {
      const mode = body.priceMode ?? listing.priceMode;
      const price = this.resolvePrice(
        mode,
        body.price !== undefined
          ? body.price
          : listing.priceMinor === null
            ? null
            : listing.priceMinor / MINOR_UNITS,
        body.priceMax !== undefined
          ? body.priceMax
          : listing.priceMaxMinor === null
            ? null
            : listing.priceMaxMinor / MINOR_UNITS,
      );
      data.priceMode = mode;
      data.priceMinor = price.minor;
      data.priceMaxMinor = price.maxMinor;
    }
    if (body.currency !== undefined) data.currency = body.currency;

    const kind = listing.kind;
    const trackStock =
      body.trackStock !== undefined ? body.trackStock : listing.trackStock;
    const quantity =
      body.quantity !== undefined ? body.quantity : listing.quantity;
    const condition =
      body.condition !== undefined ? body.condition : listing.condition;
    const serviceFormat =
      body.serviceFormat !== undefined
        ? body.serviceFormat
        : listing.serviceFormat;
    const serviceDuration =
      body.serviceDurationMinutes !== undefined
        ? body.serviceDurationMinutes
        : listing.serviceDurationMinutes;

    let categoryIds: string[] | undefined;
    let categorySlugs: string[] | undefined;
    if (body.categoryIds !== undefined) {
      const categories = await this.resolveCategories(body.categoryIds);
      categoryIds = body.categoryIds;
      categorySlugs = categories.map((category) => category.slug);
    }

    const invalid = validateListing({
      kind,
      titleRu: body.titleRu !== undefined ? body.titleRu : listing.titleRu,
      titleEn: body.titleEn !== undefined ? body.titleEn : listing.titleEn,
      descriptionRu:
        body.descriptionRu !== undefined
          ? body.descriptionRu
          : listing.descriptionRu,
      descriptionEn:
        body.descriptionEn !== undefined
          ? body.descriptionEn
          : listing.descriptionEn,
      condition,
      quantity: trackStock ? quantity : null,
      trackStock: kind === 'product' ? trackStock : false,
      serviceFormat,
      serviceDurationMinutes: serviceDuration,
      categoryIds,
      categorySlugs,
    });
    if (invalid) throw new BadRequestException(invalid);

    if (kind === 'product') {
      if (body.condition !== undefined) data.condition = body.condition;
      if (body.trackStock !== undefined) data.trackStock = body.trackStock;
      if (body.trackStock !== undefined || body.quantity !== undefined) {
        data.quantity = trackStock ? (quantity ?? 0) : null;
      }
    } else {
      if (body.serviceFormat !== undefined)
        data.serviceFormat = body.serviceFormat;
      if (body.serviceDurationMinutes !== undefined) {
        data.serviceDurationMinutes = body.serviceDurationMinutes;
      }
    }

    if (body.location !== undefined)
      Object.assign(data, locationColumns(body.location));
    if (body.deliveryOptions !== undefined)
      data.deliveryOptions = body.deliveryOptions;

    await this.prisma.$transaction(async (tx) => {
      await tx.marketListing.update({ where: { id }, data });

      if (categoryIds) {
        const previous = await tx.marketListingCategory.findMany({
          where: { listingId: id },
          select: { categoryId: true },
        });
        const previousIds = previous.map((row) => row.categoryId);
        const added = categoryIds.filter((cid) => !previousIds.includes(cid));
        const removed = previousIds.filter(
          (cid) => !categoryIds!.includes(cid),
        );

        await tx.marketListingCategory.deleteMany({
          where: { listingId: id, categoryId: { in: removed } },
        });
        if (added.length > 0) {
          await tx.marketListingCategory.createMany({
            data: added.map((categoryId) => ({ listingId: id, categoryId })),
          });
        }
        // Счётчики двигаем только если объявление сейчас видно в каталоге,
        // иначе черновик накрутил бы категориям несуществующие позиции.
        if (listing.status === 'published') {
          await tx.marketCategory.updateMany({
            where: { id: { in: added } },
            data: { listingsCount: { increment: 1 } },
          });
          await tx.marketCategory.updateMany({
            where: { id: { in: removed } },
            data: { listingsCount: { decrement: 1 } },
          });
        }
      }
    });

    // О снижении цены сообщаем тем, у кого объявление в избранном. Сравниваем
    // с прежним значением, а не с ценой на момент добавления в избранное:
    // тот снимок хранится у каждого свой и проверяется в самой рассылке.
    const nextPrice = data.priceMinor as number | null | undefined;
    if (
      nextPrice !== undefined &&
      nextPrice !== null &&
      listing.priceMinor !== null &&
      nextPrice < listing.priceMinor
    ) {
      void this.subscriptions.notifyPriceDrop(id, nextPrice);
    }

    return this.byId(id, userId, viewerIsAdmin);
  }

  async setStatus(
    userId: string,
    viewerIsAdmin: boolean,
    id: string,
    body: UpdateMarketListingStatusRequest,
  ): Promise<MarketListingDto> {
    const listing = await this.assertOwner(id, userId, viewerIsAdmin);

    // Из-под модерации автор сам не выходит: снять hidden_by_reports или
    // removed_by_admin может только администратор.
    if (
      (listing.status === 'hidden_by_reports' ||
        listing.status === 'removed_by_admin') &&
      !viewerIsAdmin
    ) {
      throw new ForbiddenException('listing_status_locked');
    }

    const wasCounted = listing.status === 'published';
    const willCount = body.status === 'published';

    await this.prisma.$transaction(async (tx) => {
      await tx.marketListing.update({
        where: { id },
        data: {
          status: body.status,
          // Дата публикации обновляется при первом выходе из черновика, чтобы
          // объявление встало в начало ленты, но не прыгало при каждом
          // «скрыл/показал».
          publishedAt:
            !wasCounted && willCount && listing.status === 'draft'
              ? new Date()
              : undefined,
        },
      });

      if (wasCounted !== willCount) {
        const delta = willCount ? 1 : -1;
        const categories = await tx.marketListingCategory.findMany({
          where: { listingId: id },
          select: { categoryId: true },
        });
        const shelves = await tx.marketListingShelf.findMany({
          where: { listingId: id },
          select: { shelfId: true },
        });
        await this.bumpCounters(tx, {
          shopId: listing.shopId,
          categoryIds: categories.map((row) => row.categoryId),
          shelfIds: shelves.map((row) => row.shelfId),
          delta,
        });
      }
    });

    // Первый выход из черновика — тот же повод сообщить подписчикам, что и
    // создание сразу опубликованного объявления.
    if (listing.status === 'draft' && body.status === 'published') {
      void this.subscriptions.notifyNewListing(id);
    }

    return this.byId(id, userId, viewerIsAdmin);
  }

  /** Административное скрытие. Перенесено в первую фазу: при постмодерации
   *  нельзя ждать полноценной системы жалоб из третьей. */
  async hideByAdmin(viewerIsAdmin: boolean, id: string): Promise<void> {
    if (!viewerIsAdmin) throw new ForbiddenException('not_admin');

    const listing = await this.prisma.marketListing.findUnique({
      where: { id },
      select: { id: true, shopId: true, status: true },
    });
    if (!listing) throw new NotFoundException('listing_not_found');
    if (listing.status === 'removed_by_admin') return;

    await this.prisma.$transaction(async (tx) => {
      await tx.marketListing.update({
        where: { id },
        data: { status: 'removed_by_admin', needsReview: true },
      });
      if (listing.status === 'published') {
        const categories = await tx.marketListingCategory.findMany({
          where: { listingId: id },
          select: { categoryId: true },
        });
        const shelves = await tx.marketListingShelf.findMany({
          where: { listingId: id },
          select: { shelfId: true },
        });
        await this.bumpCounters(tx, {
          shopId: listing.shopId,
          categoryIds: categories.map((row) => row.categoryId),
          shelfIds: shelves.map((row) => row.shelfId),
          delta: -1,
        });
      }
    });
  }

  async remove(
    userId: string,
    viewerIsAdmin: boolean,
    id: string,
  ): Promise<void> {
    const listing = await this.assertOwner(id, userId, viewerIsAdmin);

    const images = await this.prisma.marketListingImage.findMany({
      where: { listingId: id },
      select: { storageKey: true },
    });
    const categories = await this.prisma.marketListingCategory.findMany({
      where: { listingId: id },
      select: { categoryId: true },
    });
    const shelves = await this.prisma.marketListingShelf.findMany({
      where: { listingId: id },
      select: { shelfId: true },
    });

    await this.prisma.$transaction(async (tx) => {
      if (listing.status === 'published') {
        await this.bumpCounters(tx, {
          shopId: listing.shopId,
          categoryIds: categories.map((row) => row.categoryId),
          shelfIds: shelves.map((row) => row.shelfId),
          delta: -1,
        });
      }
      await tx.marketListing.delete({ where: { id } });
    });

    // Файлы чистим после транзакции: S3 нельзя откатить, а осиротевший объект
    // безобиднее, чем удалённая картинка у выжившей строки.
    await this.images.removeMany(images.map((image) => image.storageKey));
  }

  async addImages(
    userId: string,
    viewerIsAdmin: boolean,
    id: string,
    files: UploadedImageFile[] | undefined,
  ): Promise<MarketListingImagesResponse> {
    await this.assertOwner(id, userId, viewerIsAdmin);
    if (!files || files.length === 0)
      throw new BadRequestException('image_required');
    if (!this.images.configured) {
      throw new BadRequestException('image_upload_unavailable');
    }
    for (const file of files) {
      const invalid = this.images.validate(file);
      if (invalid) throw new BadRequestException(invalid);
    }

    const existing = await this.prisma.marketListingImage.count({
      where: { listingId: id },
    });
    if (existing + files.length > MAX_IMAGES_PER_LISTING) {
      throw new BadRequestException('too_many_images');
    }

    let sortOrder = existing;
    for (const file of files) {
      const stored = await this.images.storeListingImage(id, file);
      if (!stored) throw new BadRequestException('image_upload_unavailable');
      await this.prisma.marketListingImage.create({
        data: {
          listingId: id,
          storageKey: stored.key,
          url: stored.url,
          width: stored.width,
          height: stored.height,
          sizeBytes: stored.sizeBytes,
          sortOrder: sortOrder++,
        },
      });
    }

    return this.syncImages(id);
  }

  async removeImage(
    userId: string,
    viewerIsAdmin: boolean,
    id: string,
    imageId: string,
  ): Promise<void> {
    await this.assertOwner(id, userId, viewerIsAdmin);
    const image = await this.prisma.marketListingImage.findUnique({
      where: { id: imageId },
      select: { id: true, listingId: true, storageKey: true },
    });
    if (!image || image.listingId !== id) {
      throw new NotFoundException('image_not_found');
    }

    await this.prisma.marketListingImage.delete({ where: { id: imageId } });
    await this.images.remove(image.storageKey);
    await this.syncImages(id);
  }

  async reorderImages(
    userId: string,
    viewerIsAdmin: boolean,
    id: string,
    body: ReorderMarketImagesRequest,
  ): Promise<MarketListingImagesResponse> {
    await this.assertOwner(id, userId, viewerIsAdmin);

    const images = await this.prisma.marketListingImage.findMany({
      where: { listingId: id },
      select: { id: true },
    });
    const known = new Set(images.map((image) => image.id));
    const requested = body.imageIds ?? [];
    // Требуем полный список: частичный порядок оставил бы дыры в sortOrder и
    // молча поменял обложку.
    if (
      requested.length !== known.size ||
      requested.some((imageId) => !known.has(imageId))
    ) {
      throw new BadRequestException('image_order_mismatch');
    }

    await this.prisma.$transaction(
      requested.map((imageId, index) =>
        this.prisma.marketListingImage.update({
          where: { id: imageId },
          data: { sortOrder: index },
        }),
      ),
    );

    return this.syncImages(id);
  }

  async setShelves(
    userId: string,
    viewerIsAdmin: boolean,
    id: string,
    body: SetMarketListingShelvesRequest,
  ): Promise<MarketListingDto> {
    const listing = await this.assertOwner(id, userId, viewerIsAdmin);
    const shelfIds = await this.resolveShelves(
      listing.shopId,
      body.shelfIds ?? [],
    );

    await this.prisma.$transaction(async (tx) => {
      const previous = await tx.marketListingShelf.findMany({
        where: { listingId: id },
        select: { shelfId: true },
      });
      const previousIds = previous.map((row) => row.shelfId);
      const added = shelfIds.filter((sid) => !previousIds.includes(sid));
      const removed = previousIds.filter((sid) => !shelfIds.includes(sid));

      await tx.marketListingShelf.deleteMany({
        where: { listingId: id, shelfId: { in: removed } },
      });
      if (added.length > 0) {
        await tx.marketListingShelf.createMany({
          data: added.map((shelfId) => ({ listingId: id, shelfId })),
        });
      }
      if (listing.status === 'published') {
        await tx.marketShelf.updateMany({
          where: { id: { in: added } },
          data: { listingsCount: { increment: 1 } },
        });
        await tx.marketShelf.updateMany({
          where: { id: { in: removed } },
          data: { listingsCount: { decrement: 1 } },
        });
      }
    });

    return this.byId(id, userId, viewerIsAdmin);
  }

  async assertOwner(id: string, userId: string, viewerIsAdmin: boolean) {
    const listing = await this.prisma.marketListing.findUnique({
      where: { id },
      include: { shop: { select: { ownerId: true } } },
    });
    if (!listing) throw new NotFoundException('listing_not_found');
    if (listing.shop.ownerId !== userId && !viewerIsAdmin) {
      throw new ForbiddenException('not_listing_owner');
    }
    return listing;
  }

  /** Обложка ленты — первая картинка по порядку; пересчитываем после любой
   *  правки галереи, иначе карточка покажет удалённое фото. */
  private async syncImages(id: string): Promise<MarketListingImagesResponse> {
    const images = await this.prisma.marketListingImage.findMany({
      where: { listingId: id },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        url: true,
        width: true,
        height: true,
        sortOrder: true,
      },
    });
    const primaryImageUrl = images[0]?.url ?? null;
    await this.prisma.marketListing.update({
      where: { id },
      data: { primaryImageUrl },
    });
    return { images, primaryImageUrl };
  }

  private async buildWhere(
    filters: MarketListingFilters,
    viewerId: string | undefined,
  ): Promise<Prisma.MarketListingWhereInput> {
    const and: Prisma.MarketListingWhereInput[] = [
      { status: 'published', shop: { status: 'active' } },
    ];

    const q = filters.q?.trim();
    if (q && q.length >= 2) {
      // ILIKE, а не tsvector: полнотекстовый поиск в этом проекте живёт
      // отдельным $queryRaw с LIMIT 200 и не композится ни с курсорной
      // пагинацией, ни с фильтром по цене. См. план, раздел 2.
      and.push({
        OR: [
          { titleRu: { contains: q, mode: 'insensitive' } },
          { titleEn: { contains: q, mode: 'insensitive' } },
          { descriptionRu: { contains: q, mode: 'insensitive' } },
          { descriptionEn: { contains: q, mode: 'insensitive' } },
          { shop: { name: { contains: q, mode: 'insensitive' } } },
        ],
      });
    }

    if (filters.kind) and.push({ kind: filters.kind });
    if (filters.condition) and.push({ condition: filters.condition });
    if (filters.serviceFormat)
      and.push({ serviceFormat: filters.serviceFormat });
    if (filters.currency) and.push({ currency: filters.currency });
    if (filters.delivery)
      and.push({ deliveryOptions: { has: filters.delivery } });
    if (filters.city?.trim()) {
      and.push({ city: { equals: filters.city.trim(), mode: 'insensitive' } });
    }
    if (filters.country?.trim()) {
      and.push({
        country: { equals: filters.country.trim(), mode: 'insensitive' },
      });
    }

    // Категория перебивает раздел: она уже внутри него.
    if (filters.categorySlug) {
      and.push({
        categories: { some: { category: { slug: filters.categorySlug } } },
      });
    } else if (filters.sectionSlug) {
      and.push({
        categories: {
          some: { category: { section: { slug: filters.sectionSlug } } },
        },
      });
    }

    if (filters.shopSlug) {
      and.push({ shop: { slug: filters.shopSlug } });
      if (filters.shelfSlug) {
        and.push({ shelves: { some: { shelf: { slug: filters.shelfSlug } } } });
      }
    }

    const priceMin = toMinor(filters.priceMin);
    const priceMax = toMinor(filters.priceMax);
    if (priceMin !== null || priceMax !== null) {
      // Объявления без цены («договорная», «даром») из ценового диапазона
      // выпадают: сравнивать нечего, и в выборке «до 1000 ₽» им не место.
      and.push({
        priceMinor: {
          not: null,
          ...(priceMin !== null ? { gte: priceMin } : {}),
          ...(priceMax !== null ? { lte: priceMax } : {}),
        },
      });
    }

    if (filters.available) {
      and.push({
        status: 'published',
        OR: [{ trackStock: false }, { trackStock: true, quantity: { gt: 0 } }],
      });
    }

    if (filters.favorited && viewerId) {
      and.push({ favorites: { some: { userId: viewerId } } });
    }

    const blocked = await this.shops.blockedUserIds(viewerId);
    if (blocked.length > 0) {
      and.push({ shop: { ownerId: { notIn: blocked } } });
    }

    return { AND: and };
  }

  private async favoritedAmong(
    viewerId: string | undefined,
    listingIds: string[],
  ): Promise<Set<string>> {
    if (!viewerId || listingIds.length === 0) return new Set();
    const rows = await this.prisma.marketFavorite.findMany({
      where: { userId: viewerId, listingId: { in: listingIds } },
      select: { listingId: true },
    });
    return new Set(rows.map((row) => row.listingId));
  }

  private countView(listingId: string, viewerId: string): void {
    const key = `${listingId}:${viewerId}`;
    const now = Date.now();
    const last = this.viewWrites.get(key);
    if (last && now - last < VIEW_THROTTLE_MS) return;
    this.evictStaleViews(now);
    this.viewWrites.set(key, now);
    void this.prisma.marketListing
      .update({
        where: { id: listingId },
        data: { viewsCount: { increment: 1 } },
      })
      .catch(() => this.viewWrites.delete(key));
  }

  /** Карта живёт в памяти процесса и без чистки росла бы на каждую пару
   *  «объявление × зритель». По достижении потолка выбрасываем записи, чей
   *  троттлинг уже истёк — они и так больше ничего не запрещают. Если протухших
   *  нет (10k живых просмотров за сутки), сбрасываем целиком: лишний засчитанный
   *  просмотр дешевле утечки. */
  private evictStaleViews(now: number): void {
    if (this.viewWrites.size < VIEW_WRITES_MAX) return;
    for (const [key, at] of this.viewWrites) {
      if (now - at >= VIEW_THROTTLE_MS) this.viewWrites.delete(key);
    }
    if (this.viewWrites.size >= VIEW_WRITES_MAX) this.viewWrites.clear();
  }

  private resolvePrice(
    mode: CreateMarketListingRequest['priceMode'],
    price: number | null | undefined,
    priceMax: number | null | undefined,
  ): { minor: number | null; maxMinor: number | null } {
    const minor =
      price === null || price === undefined ? null : parsePriceMajor(price);
    const maxMinor =
      priceMax === null || priceMax === undefined
        ? null
        : parsePriceMajor(priceMax);

    // parsePriceMajor вернул null там, где значение прислали — значит это не
    // «цены нет», а «цена не разобрана».
    if (price !== null && price !== undefined && minor === null) {
      throw new BadRequestException('price_invalid');
    }
    if (priceMax !== null && priceMax !== undefined && maxMinor === null) {
      throw new BadRequestException('price_invalid');
    }

    const invalid = validatePrice({ mode, minor, maxMinor });
    if (invalid) throw new BadRequestException(invalid);
    return { minor, maxMinor };
  }

  private async resolveCategories(categoryIds: string[]) {
    if (categoryIds.length === 0) {
      throw new BadRequestException('category_required');
    }
    if (categoryIds.length > MAX_CATEGORIES_PER_LISTING) {
      throw new BadRequestException('too_many_categories');
    }
    const categories = await this.prisma.marketCategory.findMany({
      where: { id: { in: categoryIds } },
      select: { id: true, slug: true },
    });
    if (categories.length !== new Set(categoryIds).size) {
      throw new BadRequestException('category_not_found');
    }
    return categories;
  }

  private async resolveShelves(
    shopId: string,
    shelfIds: string[],
  ): Promise<string[]> {
    if (shelfIds.length === 0) return [];
    const shelves = await this.prisma.marketShelf.findMany({
      where: { id: { in: shelfIds }, shopId },
      select: { id: true },
    });
    if (shelves.length !== new Set(shelfIds).size) {
      throw new BadRequestException('shelf_not_found');
    }
    return shelves.map((shelf) => shelf.id);
  }

  /** Все денормализованные счётчики двигаются вместе и только внутри той же
   *  транзакции, что и сама строка, иначе они разъезжаются с реальностью. */
  private async bumpCounters(
    tx: Prisma.TransactionClient,
    params: {
      shopId: string;
      categoryIds: string[];
      shelfIds: string[];
      delta: number;
    },
  ): Promise<void> {
    const step =
      params.delta > 0
        ? { increment: params.delta }
        : { decrement: -params.delta };
    await tx.marketShop.update({
      where: { id: params.shopId },
      data: { listingsCount: step },
    });
    if (params.categoryIds.length > 0) {
      await tx.marketCategory.updateMany({
        where: { id: { in: params.categoryIds } },
        data: { listingsCount: step },
      });
    }
    if (params.shelfIds.length > 0) {
      await tx.marketShelf.updateMany({
        where: { id: { in: params.shelfIds } },
        data: { listingsCount: step },
      });
    }
  }
}

function toMinor(value: number | string | undefined): number | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = parsePriceMajor(value);
  return parsed;
}

function locationColumns(location: MarketLocationDto | null | undefined) {
  if (!location) {
    return {
      location: Prisma.DbNull,
      city: null,
      country: null,
      latitude: null,
      longitude: null,
    };
  }
  return {
    location: location as unknown as Prisma.InputJsonValue,
    city: location.city,
    country: location.country ?? null,
    latitude: location.lat,
    longitude: location.lon,
  };
}

export function toListingSummary(
  row: ListingRow,
  favorited: boolean,
): MarketListingSummary {
  return {
    id: row.id,
    kind: row.kind,
    titleRu: row.titleRu,
    titleEn: row.titleEn,
    price: {
      mode: row.priceMode,
      minor: row.priceMinor,
      maxMinor: row.priceMaxMinor,
      currency: row.currency,
    },
    condition: row.condition,
    serviceFormat: row.serviceFormat,
    status: row.status,
    primaryImageUrl: row.primaryImageUrl,
    city: row.city,
    country: row.country,
    favoritesCount: row.favoritesCount,
    publishedAt: row.publishedAt.toISOString(),
    shop: {
      id: row.shop.id,
      slug: row.shop.slug,
      name: row.shop.name,
      logoUrl: row.shop.logoUrl,
    },
    favorited,
    available: isAvailable({
      status: row.status,
      trackStock: row.trackStock,
      quantity: row.quantity,
      shopStatus: row.shop.status,
    }),
  };
}

export function toListingDto(
  row: ListingRow,
  favorited: boolean,
  canEdit: boolean,
): MarketListingDto {
  return {
    ...toListingSummary(row, favorited),
    descriptionRu: row.descriptionRu,
    descriptionEn: row.descriptionEn,
    priceMaxMinor: row.priceMaxMinor,
    quantity: row.quantity,
    trackStock: row.trackStock,
    soldCount: row.soldCount,
    serviceDurationMinutes: row.serviceDurationMinutes,
    location: (row.location as MarketLocationDto | null) ?? null,
    deliveryOptions: row.deliveryOptions,
    images: row.images,
    categories: row.categories.map((link) => ({
      id: link.category.id,
      slug: link.category.slug,
      sectionSlug: link.category.section.slug,
      titleRu: link.category.titleRu,
      titleEn: link.category.titleEn,
    })),
    shelves: row.shelves.map((link) => ({
      id: link.shelf.id,
      slug: link.shelf.slug,
      titleRu: link.shelf.titleRu,
      titleEn: link.shelf.titleEn,
    })),
    viewsCount: row.viewsCount,
    commentsCount: row.commentsCount,
    createdAt: row.createdAt.toISOString(),
    canEdit,
  };
}

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
