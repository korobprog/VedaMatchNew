import type { ProfileLocation, ProfileMessengers } from './index';

export type MarketListingKind = 'product' | 'service';

export type MarketListingStatus =
  | 'draft'
  | 'published'
  | 'hidden_by_author'
  | 'sold_out'
  | 'hidden_by_reports'
  | 'removed_by_admin';

export type MarketListingCondition =
  | 'new_item'
  | 'like_new'
  | 'used'
  | 'refurbished';

/** `negotiable` — цена договорная, `free` — отдам даром. В обоих случаях
 *  `minor` равен null, но подписи в карточке разные. */
export type MarketPriceMode = 'fixed' | 'from' | 'negotiable' | 'free';

export type MarketCurrency = 'rub' | 'usd' | 'eur' | 'inr';

export type MarketDeliveryOption =
  | 'pickup'
  | 'courier'
  | 'post'
  | 'cdek'
  | 'digital'
  | 'shipping_worldwide';

export type MarketServiceFormat = 'online' | 'offline' | 'any';

export type MarketShopStatus =
  | 'active'
  | 'closed'
  | 'hidden_by_reports'
  | 'blocked_by_admin';

export type MarketLocale = 'ru' | 'en';

export type MarketListingSort = 'new' | 'price_asc' | 'price_desc' | 'popular';

/** Гео объявления и магазина. Совпадает по форме с портальным ProfileLocation,
 *  чтобы геокодер и форма профиля переиспользовались без переходников. */
export type MarketLocationDto = ProfileLocation;

/** Цена. Хранится и передаётся в минорных единицах (копейки, центы):
 *  точная арифметика и прямое сравнение в диапазонном фильтре.
 *  `minor` равен null у режимов negotiable и free. */
export interface MarketPriceDto {
  mode: MarketPriceMode;
  minor: number | null;
  /** Верх вилки для режима `from`; null — вилки нет. */
  maxMinor: number | null;
  currency: MarketCurrency;
}

export interface MarketSectionDto {
  id: string;
  slug: string;
  titleRu: string;
  titleEn: string;
  descriptionRu: string | null;
  descriptionEn: string | null;
  iconKey: string | null;
  position: number;
  categoriesCount: number;
  listingsCount: number;
  /** `true` — текущий пользователь может править раздел (только админ). */
  canEdit: boolean;
}

export interface MarketCategoryDto {
  id: string;
  sectionId: string;
  sectionSlug: string;
  slug: string;
  titleRu: string;
  titleEn: string;
  descriptionRu: string | null;
  descriptionEn: string | null;
  position: number;
  listingsCount: number;
  /** `true` — правила Рынка запрещают размещение в этой категории. Она остаётся
   *  в каталоге, чтобы модерация могла переложить в неё уже поданное объявление
   *  и показать продавцу причину, но в форме создания не предлагается. */
  prohibited: boolean;
  canEdit: boolean;
}

/** Полка магазина — навигация по своей витрине, не связана с каталогом. */
export interface MarketShelfDto {
  id: string;
  shopId: string;
  slug: string;
  titleRu: string | null;
  titleEn: string | null;
  position: number;
  listingsCount: number;
}

export interface MarketShopSummary {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  city: string | null;
  country: string | null;
  status: MarketShopStatus;
  listingsCount: number;
  reviewsCount: number;
  ratingAvg: number;
}

export interface MarketShopDto extends MarketShopSummary {
  ownerId: string;
  taglineRu: string | null;
  taglineEn: string | null;
  aboutRu: string | null;
  aboutEn: string | null;
  coverUrl: string | null;
  location: MarketLocationDto | null;
  messengers: ProfileMessengers;
  deliveryOptions: MarketDeliveryOption[];
  ordersCount: number;
  followersCount: number;
  createdAt: string;
  /** `true` — текущий пользователь владелец магазина либо администратор. */
  canEdit: boolean;
}

export interface MarketShopListResponse {
  items: MarketShopSummary[];
  nextCursor: string | null;
  total: number;
}

/** Статистика витрины для владельца. `conversion` — доля просмотров,
 *  дошедших до заявки; при нулевых просмотрах равна 0, а не NaN. */
export interface MarketShopStatsDto {
  shopId: string;
  listingsPublished: number;
  viewsTotal: number;
  favoritesTotal: number;
  ordersTotal: number;
  conversion: number;
  topListings: Array<{
    id: string;
    title: string;
    viewsCount: number;
    favoritesCount: number;
    ordersCount: number;
  }>;
}

export interface MarketListingImageDto {
  id: string;
  url: string;
  width: number;
  height: number;
  sortOrder: number;
}

export interface MarketListingSummary {
  id: string;
  kind: MarketListingKind;
  titleRu: string | null;
  titleEn: string | null;
  price: MarketPriceDto;
  condition: MarketListingCondition | null;
  serviceFormat: MarketServiceFormat | null;
  status: MarketListingStatus;
  primaryImageUrl: string | null;
  city: string | null;
  country: string | null;
  favoritesCount: number;
  publishedAt: string;
  shop: Pick<MarketShopSummary, 'id' | 'slug' | 'name' | 'logoUrl'>;
  /** Поля зрителя. У гостя всегда `false`, а не undefined. */
  favorited: boolean;
  available: boolean;
}

export interface MarketListingDto extends MarketListingSummary {
  descriptionRu: string | null;
  descriptionEn: string | null;
  priceMaxMinor: number | null;
  quantity: number | null;
  trackStock: boolean;
  soldCount: number;
  serviceDurationMinutes: number | null;
  location: MarketLocationDto | null;
  deliveryOptions: MarketDeliveryOption[];
  images: MarketListingImageDto[];
  categories: Array<
    Pick<MarketCategoryDto, 'id' | 'slug' | 'sectionSlug' | 'titleRu' | 'titleEn'>
  >;
  shelves: Array<Pick<MarketShelfDto, 'id' | 'slug' | 'titleRu' | 'titleEn'>>;
  viewsCount: number;
  commentsCount: number;
  createdAt: string;
  canEdit: boolean;
}

export interface MarketListingFeedResponse {
  items: MarketListingSummary[];
  /** `null` — данных больше нет. */
  nextCursor: string | null;
  total: number;
}

/** Фильтры ленты объявлений. Цены приходят в мажорных единицах (рубли),
 *  сервис переводит их в минорные. Фильтр по цене работает внутри одной
 *  валюты: конвертации в Рынке нет. */
export interface MarketListingFilters {
  q?: string;
  kind?: MarketListingKind;
  sectionSlug?: string;
  /** Перебивает sectionSlug, если передан вместе с ним. */
  categorySlug?: string;
  shopSlug?: string;
  /** Работает только вместе с shopSlug. */
  shelfSlug?: string;
  priceMin?: number;
  priceMax?: number;
  currency?: MarketCurrency;
  condition?: MarketListingCondition;
  serviceFormat?: MarketServiceFormat;
  city?: string;
  country?: string;
  delivery?: MarketDeliveryOption;
  /** `true` — скрыть распроданное и то, у чего кончился отслеживаемый остаток. */
  available?: boolean;
  /** `true` — только избранное текущего пользователя. */
  favorited?: boolean;
  sort?: MarketListingSort;
  cursor?: string;
}

export interface MarketShopDirectoryFilters {
  q?: string;
  city?: string;
  country?: string;
  cursor?: string;
}

export interface CreateMarketShopRequest {
  name: string;
  slug?: string;
  taglineRu?: string | null;
  taglineEn?: string | null;
  aboutRu?: string | null;
  aboutEn?: string | null;
  location?: MarketLocationDto | null;
  messengers?: ProfileMessengers;
  deliveryOptions?: MarketDeliveryOption[];
  /** Обязателен при создании: без согласия с правилами магазин не заводится. */
  rulesAccepted: boolean;
}

/** Все поля необязательны — меняются только переданные. Слаг не редактируется:
 *  на него завязаны ссылки на витрину. */
export interface UpdateMarketShopRequest {
  name?: string;
  taglineRu?: string | null;
  taglineEn?: string | null;
  aboutRu?: string | null;
  aboutEn?: string | null;
  location?: MarketLocationDto | null;
  messengers?: ProfileMessengers;
  deliveryOptions?: MarketDeliveryOption[];
  status?: Extract<MarketShopStatus, 'active' | 'closed'>;
}

export interface CreateMarketShelfRequest {
  titleRu?: string | null;
  titleEn?: string | null;
  position?: number;
}

export interface UpdateMarketShelfRequest {
  titleRu?: string | null;
  titleEn?: string | null;
  position?: number;
}

export interface CreateMarketListingRequest {
  kind: MarketListingKind;
  titleRu?: string | null;
  titleEn?: string | null;
  descriptionRu?: string | null;
  descriptionEn?: string | null;
  priceMode: MarketPriceMode;
  /** Мажорные единицы (рубли), сервис переводит в минорные. */
  price?: number | null;
  priceMax?: number | null;
  currency: MarketCurrency;
  condition?: MarketListingCondition | null;
  quantity?: number | null;
  trackStock?: boolean;
  serviceFormat?: MarketServiceFormat | null;
  serviceDurationMinutes?: number | null;
  location?: MarketLocationDto | null;
  deliveryOptions?: MarketDeliveryOption[];
  /** От одной до пяти категорий глобального каталога. */
  categoryIds: string[];
  shelfIds?: string[];
}

/** Все поля необязательны — меняются только переданные. `kind` не меняется:
 *  переключение товар↔услуга обнуляет половину полей и путает покупателя. */
export interface UpdateMarketListingRequest {
  titleRu?: string | null;
  titleEn?: string | null;
  descriptionRu?: string | null;
  descriptionEn?: string | null;
  priceMode?: MarketPriceMode;
  price?: number | null;
  priceMax?: number | null;
  currency?: MarketCurrency;
  condition?: MarketListingCondition | null;
  quantity?: number | null;
  trackStock?: boolean;
  serviceFormat?: MarketServiceFormat | null;
  serviceDurationMinutes?: number | null;
  location?: MarketLocationDto | null;
  deliveryOptions?: MarketDeliveryOption[];
  categoryIds?: string[];
}

/** Автор переключает только между черновиком, публикацией, своим скрытием
 *  и «продано». Статусы модерации проставляет система и админ. */
export interface UpdateMarketListingStatusRequest {
  status: Extract<
    MarketListingStatus,
    'draft' | 'published' | 'hidden_by_author' | 'sold_out'
  >;
}

export interface ReorderMarketImagesRequest {
  /** Полный список id картинок объявления в нужном порядке. */
  imageIds: string[];
}

export interface SetMarketListingShelvesRequest {
  shelfIds: string[];
}

export interface MarketListingImagesResponse {
  images: MarketListingImageDto[];
  primaryImageUrl: string | null;
}

export interface MarketPreferencesDto {
  uiLanguage: MarketLocale;
  displayCurrency: MarketCurrency;
  priceDropAlerts: boolean;
}

export interface UpdateMarketPreferencesRequest {
  uiLanguage?: MarketLocale;
  displayCurrency?: MarketCurrency;
  priceDropAlerts?: boolean;
}

export interface CreateMarketSectionRequest {
  slug: string;
  titleRu: string;
  titleEn: string;
  descriptionRu?: string | null;
  descriptionEn?: string | null;
  iconKey?: string | null;
  position?: number;
}

export interface UpdateMarketSectionRequest {
  titleRu?: string;
  titleEn?: string;
  descriptionRu?: string | null;
  descriptionEn?: string | null;
  iconKey?: string | null;
  position?: number;
}

export interface CreateMarketCategoryRequest {
  sectionId: string;
  slug: string;
  titleRu: string;
  titleEn: string;
  descriptionRu?: string | null;
  descriptionEn?: string | null;
  position?: number;
}

export interface UpdateMarketCategoryRequest {
  sectionId?: string;
  titleRu?: string;
  titleEn?: string;
  descriptionRu?: string | null;
  descriptionEn?: string | null;
  position?: number;
}

/** Ручное скрытие объявления администратором. Перенесено в первую фазу:
 *  при постмодерации нельзя ждать полноценной системы жалоб. */
export interface HideMarketListingRequest {
  reason?: string;
}

// ===== Корзина, заявки, чат (фаза 2) =====

export type MarketOrderStatus =
  | 'new_request'
  | 'accepted'
  | 'in_progress'
  | 'completed'
  | 'declined_by_seller'
  | 'cancelled_by_buyer';

/** Статусы, после которых заявка закрыта и больше не меняется. */
export const MARKET_ORDER_FINAL_STATUSES: MarketOrderStatus[] = [
  'completed',
  'declined_by_seller',
  'cancelled_by_buyer',
];

export interface MarketCartItemDto {
  listingId: string;
  titleRu: string | null;
  titleEn: string | null;
  primaryImageUrl: string | null;
  price: MarketPriceDto;
  quantity: number;
  lineTotalMinor: number | null;
  /** `false` — позицию нельзя заказать: снята, распродана или магазин закрыт.
   *  Такие строки остаются видимыми, но не попадают в заявку. */
  available: boolean;
  /** Остаток, если продавец его отслеживает. */
  quantityAvailable: number | null;
}

/** Группа корзины — пара «магазин + валюта»: складывать рубли с рупиями
 *  в одну сумму нельзя, поэтому и заявка создаётся на каждую пару своя. */
export interface MarketCartShopGroup {
  shopId: string;
  shopSlug: string;
  shopName: string;
  shopLogoUrl: string | null;
  currency: MarketCurrency;
  items: MarketCartItemDto[];
  subtotalMinor: number;
  deliveryOptions: MarketDeliveryOption[];
}

export interface MarketCartDto {
  groups: MarketCartShopGroup[];
  /** Позиции, которые больше нельзя заказать. Показываем отдельно, чтобы
   *  человек понял, почему сумма изменилась. */
  unavailable: MarketCartItemDto[];
  itemsCount: number;
}

export interface MarketCartCountResponse {
  count: number;
}

export interface AddToMarketCartRequest {
  listingId: string;
  quantity?: number;
}

export interface UpdateMarketCartItemRequest {
  quantity: number;
}

/** Оформление: по одной записи на каждую группу корзины. Группы, которых нет
 *  в запросе, остаются в корзине — можно оформить часть. */
export interface MarketCheckoutRequest {
  groups: Array<{
    shopId: string;
    currency: MarketCurrency;
    deliveryOption?: MarketDeliveryOption | null;
    deliveryNote?: string | null;
    comment?: string | null;
  }>;
}

export interface MarketCheckoutResponse {
  orders: MarketOrderDto[];
}

export interface MarketOrderItemDto {
  id: string;
  /** `null` — объявление удалено; название и цена остались снимком. */
  listingId: string | null;
  titleSnapshot: string;
  priceMinor: number;
  currency: MarketCurrency;
  imageUrl: string | null;
  quantity: number;
  lineTotalMinor: number;
}

export interface MarketOrderDto {
  id: string;
  number: number;
  status: MarketOrderStatus;
  totalMinor: number;
  currency: MarketCurrency;
  deliveryOption: MarketDeliveryOption | null;
  deliveryNote: string | null;
  buyerComment: string | null;
  declineReason: string | null;
  createdAt: string;
  acceptedAt: string | null;
  completedAt: string | null;
  closedAt: string | null;
  items: MarketOrderItemDto[];
  shop: Pick<MarketShopSummary, 'id' | 'slug' | 'name' | 'logoUrl'>;
  buyer: { id: string; name: string } | null;
  /** Роль зрителя в этой заявке — от неё зависит набор доступных переходов. */
  viewerRole: 'buyer' | 'seller';
  /** Статусы, в которые зритель может перевести заявку прямо сейчас. */
  availableTransitions: MarketOrderStatus[];
  /** Диалог с продавцом, если он уже заведён. */
  conversationId: string | null;
}

export interface MarketOrderListResponse {
  items: MarketOrderDto[];
  nextCursor: string | null;
  total: number;
}

export interface UpdateMarketOrderStatusRequest {
  status: MarketOrderStatus;
  /** Причина отказа или отмены — попадает в `declineReason`. */
  reason?: string | null;
}

export interface MarketMessageDto {
  id: string;
  conversationId: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  readAt: string | null;
  /** `true` — сообщение написал зритель. */
  mine: boolean;
  author: { id: string; name: string; avatarUrl: string | null } | null;
  /** `true` — окно правки ещё не истекло и автор может изменить текст. */
  canEdit: boolean;
}

export interface MarketChatSummary {
  id: string;
  shop: Pick<MarketShopSummary, 'id' | 'slug' | 'name' | 'logoUrl'>;
  buyer: { id: string; name: string; avatarUrl: string | null } | null;
  /** Кто мы в этом диалоге: покупатель или магазин. */
  viewerRole: 'buyer' | 'seller';
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unreadCount: number;
  listingId: string | null;
  orderId: string | null;
}

export interface MarketChatsState {
  chats: MarketChatSummary[];
  unreadTotal: number;
}

export interface MarketChatState {
  chat: MarketChatSummary;
  messages: MarketMessageDto[];
}

/** Диалог заводится по паре «магазин + покупатель»; повторный вызов с другим
 *  поводом вернёт тот же диалог, а не создаст второй. */
export interface StartMarketChatRequest {
  shopId: string;
  listingId?: string | null;
  orderId?: string | null;
}

export interface SendMarketMessageRequest {
  body: string;
}

export interface EditMarketMessageRequest {
  body: string;
}

// ===== Отзывы, подписки, модерация (фаза 3) =====

export type MarketReviewStatus =
  | 'published'
  | 'removed_by_author'
  | 'removed_by_admin';

export type MarketCommentStatus =
  | 'published'
  | 'removed_by_author'
  | 'removed_by_admin';

export type MarketSubscriptionKind =
  | 'shop'
  | 'section'
  | 'category'
  | 'saved_search';

export type MarketReportTargetKind = 'listing' | 'shop' | 'comment' | 'review';

export type MarketReportReason =
  | 'spam'
  | 'prohibited_item'
  | 'scam'
  | 'wrong_category'
  | 'inappropriate_content'
  | 'other';

export type MarketReportStatus = 'open' | 'reviewed' | 'dismissed';

export interface MarketReviewDto {
  id: string;
  orderId: string;
  shopId: string;
  listingId: string | null;
  /** 1..5. */
  rating: number;
  body: string | null;
  status: MarketReviewStatus;
  createdAt: string;
  author: { id: string; name: string; avatarUrl: string | null } | null;
  /** `true` — зритель написал этот отзыв либо является админом. */
  canDelete: boolean;
}

export interface MarketReviewListResponse {
  items: MarketReviewDto[];
  total: number;
  /** Средняя оценка магазина; 0 — отзывов ещё нет. */
  ratingAvg: number;
  /** Сколько отзывов на каждую оценку: ключи от «1» до «5». */
  breakdown: Record<string, number>;
}

export interface CreateMarketReviewRequest {
  orderId: string;
  rating: number;
  body?: string | null;
}

export interface MarketCommentDto {
  id: string;
  listingId: string;
  body: string;
  status: MarketCommentStatus;
  createdAt: string;
  author: { id: string; name: string; avatarUrl: string | null } | null;
  canDelete: boolean;
}

export interface MarketCommentsResponse {
  items: MarketCommentDto[];
  total: number;
}

export interface CreateMarketCommentRequest {
  body: string;
}

export interface MarketSubscriptionDto {
  id: string;
  kind: MarketSubscriptionKind;
  /** Подпись для списка: имя магазина, раздела, категории или запроса. */
  title: string;
  shopSlug: string | null;
  sectionSlug: string | null;
  categorySlug: string | null;
  /** Фильтры сохранённого поиска — те же, что в адресе ленты. */
  query: MarketListingFilters | null;
  createdAt: string;
}

export interface CreateMarketSubscriptionRequest {
  kind: MarketSubscriptionKind;
  shopId?: string;
  sectionId?: string;
  categoryId?: string;
  /** Только для `saved_search`. */
  query?: MarketListingFilters;
  title?: string | null;
}

export interface CreateMarketReportRequest {
  targetKind: MarketReportTargetKind;
  targetId: string;
  reason: MarketReportReason;
  note?: string | null;
}

export interface AdminMarketReportDto {
  id: string;
  targetKind: MarketReportTargetKind;
  targetId: string;
  /** Название объявления, магазина или отрывок текста — чтобы админ понимал,
   *  о чём жалоба, не открывая цель. */
  targetLabel: string;
  reason: MarketReportReason;
  note: string | null;
  status: MarketReportStatus;
  createdAt: string;
  reporter: { id: string; name: string } | null;
  /** Сколько всего открытых жалоб на эту цель. */
  openReportsCount: number;
  /** `true` — цель уже скрыта автоматически по порогу. */
  targetHidden: boolean;
}

export interface AdminMarketReportListResponse {
  items: AdminMarketReportDto[];
  total: number;
}

export interface ResolveMarketReportRequest {
  /** `reviewed` — жалоба обоснована и меры приняты, `dismissed` — отклонена. */
  status: Extract<MarketReportStatus, 'reviewed' | 'dismissed'>;
  moderatorNote?: string | null;
  /** `true` — заодно скрыть цель насовсем. */
  hideTarget?: boolean;
}
