// Типы сервиса «Путешествия». Первый раздел — ночлег: отели, хостелы,
// гостевые дома, ашрамы и комнаты у преданных. Часть мест принимает за
// деньги, часть — за служение, и это разные вещи, а не «цена ноль».

/**
 * Вид объекта размещения. Список закрытый: он определяет значок и подпись в
 * карточке, а не свойства объекта. Всё, что различает конкретные места
 * (цена, вместимость, условия), живёт полями, а не новым видом.
 */
export const TRAVEL_STAY_KINDS = [
  'hotel',
  'hostel',
  'guesthouse',
  'ashram',
  'homestay',
] as const;
export type TravelStayKind = (typeof TRAVEL_STAY_KINDS)[number];

export const TRAVEL_STAY_KIND_LABELS: Record<TravelStayKind, string> = {
  hotel: 'Отель',
  hostel: 'Хостел',
  guesthouse: 'Гостевой дом',
  ashram: 'Ашрам',
  homestay: 'Комната у преданных',
};

/**
 * Чем платят за ночлег. `seva` — служением: помощь на кухне, уборка храма,
 * подготовка программы. `both` — место принимает и так, и так, и выбор
 * остаётся за гостем.
 *
 * Отдельное поле, а не «цена = 0»: бесплатный ночлег и ночлег за служение —
 * это разный разговор с хозяином и разные ожидания у гостя.
 */
export const TRAVEL_STAY_PAYMENTS = ['paid', 'seva', 'both'] as const;
export type TravelStayPayment = (typeof TRAVEL_STAY_PAYMENTS)[number];

export const TRAVEL_STAY_PAYMENT_LABELS: Record<TravelStayPayment, string> = {
  paid: 'За плату',
  seva: 'За служение',
  both: 'За плату или за служение',
};

export const TRAVEL_STAY_STATUSES = [
  'draft',
  'published',
  'hidden_by_author',
  'removed_by_admin',
] as const;
export type TravelStayStatus = (typeof TRAVEL_STAY_STATUSES)[number];

/** Те же валюты, что на Рынке. Суммы — в минорных единицах, целым числом. */
export const TRAVEL_CURRENCIES = ['rub', 'usd', 'eur', 'inr'] as const;
export type TravelCurrency = (typeof TRAVEL_CURRENCIES)[number];

export const TRAVEL_CURRENCY_SIGNS: Record<TravelCurrency, string> = {
  rub: '₽',
  usd: '$',
  eur: '€',
  inr: '₹',
};

/**
 * Путь заявки. `new_request` → `accepted` | `declined`; принятая доходит до
 * `checked_in` и `completed`. `cancelled` ставит гость, и только до заезда.
 */
export const TRAVEL_BOOKING_STATUSES = [
  'new_request',
  'accepted',
  'declined',
  'cancelled',
  'checked_in',
  'completed',
] as const;
export type TravelBookingStatus = (typeof TRAVEL_BOOKING_STATUSES)[number];

export const TRAVEL_BOOKING_STATUS_LABELS: Record<TravelBookingStatus, string> =
  {
    new_request: 'Новая заявка',
    accepted: 'Принята',
    declined: 'Отклонена',
    cancelled: 'Отменена гостем',
    checked_in: 'Гость заселён',
    completed: 'Завершена',
  };

/** Роль в объекте: владелец ровно один, остальные — управляющие. */
export const TRAVEL_STAY_MANAGER_ROLES = ['owner', 'manager'] as const;
export type TravelStayManagerRole = (typeof TRAVEL_STAY_MANAGER_ROLES)[number];

/** Точка на карте, вокруг которой собираются места ночлега. */
export interface TravelPlaceDto {
  id: string;
  slug: string;
  name: string;
  country: string;
  region: string | null;
  lat: number;
  lng: number;
  summary: string;
  /** Сколько опубликованных объектов в этой точке — подпись на маркере. */
  stayCount: number;
}

export interface TravelStayCardDto {
  id: string;
  kind: TravelStayKind;
  name: string;
  /** Название точки; null — объект ещё не привязан к месту на карте. */
  placeName: string | null;
  address: string;
  lat: number | null;
  lng: number | null;
  payment: TravelStayPayment;
  priceMinor: number | null;
  currency: TravelCurrency;
  photoUrl: string | null;
  /** Публичный код: адрес страницы с QR — `/travel/s/<code>`. */
  publicCode: string;
}

export interface TravelRoomDto {
  id: string;
  /** Корпус: у хостеля при храме их бывает несколько. Пустая строка — один. */
  building: string;
  number: string;
  capacity: number;
  priceMinor: number | null;
}

export interface TravelStayDto extends TravelStayCardDto {
  description: string;
  sevaNote: string | null;
  photoUrls: string[];
  contactPhone: string | null;
  status: TravelStayStatus;
  rooms: TravelRoomDto[];
  /** Может ли текущий зритель управлять объектом. */
  manageable: boolean;
}

export interface TravelBookingDto {
  id: string;
  number: number;
  status: TravelBookingStatus;
  stayId: string;
  stayName: string;
  roomLabel: string | null;
  guestName: string;
  guestPhone: string;
  /** ISO-дата без времени: заезд считается днями, а не часами. */
  checkIn: string;
  checkOut: string;
  nights: number;
  guests: number;
  comment: string | null;
  declineReason: string | null;
  totalMinor: number | null;
  currency: TravelCurrency;
  createdAt: string;
}

export interface CreateTravelBookingRequest {
  stayId: string;
  roomId?: string | null;
  guestName: string;
  guestPhone: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  comment?: string | null;
}

/**
 * Ответ на заявку со страницы по QR. `claimToken` есть только у гостя без
 * аккаунта: браузер хранит его и после входа привязывает заявку к человеку.
 */
export interface TravelGuestBookingResponse {
  booking: TravelBookingDto;
  claimToken: string | null;
}

export interface ClaimTravelBookingRequest {
  token: string;
}

/** «Написать хозяину»: заявка — если вопрос по ней, сообщение — необязательно. */
export interface ContactTravelStayRequest {
  bookingId?: string | null;
  message?: string | null;
}

/** Беседа в «Общении»; null — переписку открыть не вышло. */
export interface ContactTravelStayResponse {
  conversationId: string | null;
}

/**
 * Событие шины: человек хочет написать хозяину объекта. Самодостаточно —
 * подписчик в «Общении» не читает таблицы «Путешествий», поэтому подпись
 * вида объекта и строка о заявке собраны здесь.
 */
export interface TravelContactRequestedEvent {
  requesterId: string;
  recipientId: string;
  stayId: string;
  stayName: string;
  stayKindLabel: string;
  bookingId: string | null;
  cardBody: string;
  message: string;
}

export interface UpdateTravelBookingStatusRequest {
  status: Extract<
    TravelBookingStatus,
    'accepted' | 'declined' | 'cancelled' | 'checked_in' | 'completed'
  >;
  declineReason?: string | null;
}

export interface CreateTravelStayRequest {
  kind: TravelStayKind;
  name: string;
  placeId?: string | null;
  description?: string;
  address?: string;
  lat?: number | null;
  lng?: number | null;
  payment: TravelStayPayment;
  priceMinor?: number | null;
  currency?: TravelCurrency;
  sevaNote?: string | null;
  contactPhone?: string | null;
}

export type UpdateTravelStayRequest = Partial<CreateTravelStayRequest> & {
  status?: TravelStayStatus;
};

export interface TravelStaysResponse {
  items: TravelStayCardDto[];
}

/**
 * Карточка объекта в админке. Отличается ровно состоянием: экран модерации
 * показывает и черновики, и снятое, и без состояния кнопка «вернуть хозяину»
 * непонятно что делает.
 */
export interface AdminTravelStayDto extends TravelStayCardDto {
  status: TravelStayStatus;
}

export interface AdminTravelStaysResponse {
  items: AdminTravelStayDto[];
}

export interface TravelPlacesResponse {
  items: TravelPlaceDto[];
}

export interface TravelBookingsResponse {
  items: TravelBookingDto[];
}

/**
 * Длина публичного кода объекта. Шесть знаков из алфавита без похожих букв —
 * это ~10^9 вариантов: код печатают под QR и иногда диктуют голосом, поэтому
 * он короткий, но угадать его перебором нельзя.
 */
export const TRAVEL_PUBLIC_CODE_LENGTH = 6;
export const TRAVEL_PUBLIC_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Дольше месяца подряд — это уже не заявка на ночлег, а переезд. */
export const TRAVEL_MAX_NIGHTS = 31;

// ===== Касса объекта =====

export const TRAVEL_CASH_KINDS = ['income', 'expense'] as const;
export type TravelCashKind = (typeof TRAVEL_CASH_KINDS)[number];

/**
 * Значки статей кассы. Закрытый список ключей, а не имена иконок библиотеки:
 * в базе лежит ключ, картинку к нему подбирает веб. Новый значок — строка
 * здесь и в карте на вебе, без миграции.
 */
export const TRAVEL_CASH_ICONS = [
  'house',
  'bed',
  'banknote',
  'gift',
  'seva',
  'cart',
  'food',
  'cleaning',
  'laundry',
  'repair',
  'utilities',
  'water',
  'internet',
  'ads',
  'salary',
  'transport',
  'fees',
  'package',
  'other',
] as const;
export type TravelCashIcon = (typeof TRAVEL_CASH_ICONS)[number];

/** Группировка ленты кассы. */
export const TRAVEL_CASH_GROUPINGS = ['day', 'week', 'month', 'year'] as const;
export type TravelCashGrouping = (typeof TRAVEL_CASH_GROUPINGS)[number];

export interface TravelCashCategoryDto {
  id: string;
  kind: TravelCashKind;
  name: string;
  icon: TravelCashIcon;
  position: number;
}

export interface TravelCashEntryDto {
  id: string;
  kind: TravelCashKind;
  /** Всегда положительная, знак задаёт `kind`. */
  amountMinor: number;
  /** ISO-дата без времени. */
  occurredOn: string;
  categoryId: string | null;
  note: string;
  tags: string[];
  authorName: string | null;
  createdAt: string;
  /** Гость, от которого пришли деньги; null — запись не про гостя. */
  guestId: string | null;
  guestName: string | null;
  guestColor: TravelGuestColor | null;
  /** Сколько суток оплачено записью. */
  nights: number | null;
}

export interface TravelCashCategoriesResponse {
  items: TravelCashCategoryDto[];
}

/**
 * Записи за промежуток и остаток на его начало. Остаток считает сервер: у
 * клиента нет всей истории, а бюджет в шапке обязан сходиться с кассой.
 */
export interface TravelCashEntriesResponse {
  stayName: string;
  currency: TravelCurrency;
  openingMinor: number;
  /** Остаток на утро дня `from`: начальный плюс всё, что было раньше. */
  balanceBeforeMinor: number;
  /** Остаток сейчас, по всем записям, включая будущие даты. */
  balanceMinor: number;
  from: string;
  to: string;
  /** Цена суток объекта — подсказка суммы при оплате за N суток. */
  nightPriceMinor: number | null;
  /**
   * Лента отфильтрована. Остатки по периодам тогда не считаются: сумма
   * отобранных строк — это не движение кассы.
   */
  filtered: boolean;
  items: TravelCashEntryDto[];
}

/** Фильтр ленты кассы. Суммы — в минорных единицах. */
export interface TravelCashFilters {
  q?: string;
  kind?: TravelCashKind;
  /** `none` — записи без статьи. */
  categoryId?: string;
  guestId?: string;
  tag?: string;
  minMinor?: number;
  maxMinor?: number;
}

export interface SaveTravelCashEntryRequest {
  kind: TravelCashKind;
  amountMinor: number;
  occurredOn: string;
  categoryId?: string | null;
  note?: string;
  tags?: string[];
  guestId?: string | null;
  nights?: number | null;
}

// ===== Клиентская база объекта =====

/**
 * Цвет гостя — ключ токена темы, а не код цвета: рамка в ленте и метка в
 * базе обязаны переключаться вместе с темой. `none` — без цвета.
 */
export const TRAVEL_GUEST_COLORS = [
  'none',
  'magenta',
  'cyan',
  'gold',
  'violet',
  'blue',
] as const;
export type TravelGuestColor = (typeof TRAVEL_GUEST_COLORS)[number];

export const TRAVEL_GUEST_COLOR_LABELS: Record<TravelGuestColor, string> = {
  none: 'Без цвета',
  magenta: 'Малиновый',
  cyan: 'Бирюзовый',
  gold: 'Золотой',
  violet: 'Фиолетовый',
  blue: 'Синий',
};

/** Больше года одной оплатой не вносят — это почти всегда лишняя цифра. */
export const TRAVEL_MAX_PAID_NIGHTS = 366;

export interface TravelGuestDto {
  id: string;
  fullName: string;
  phone: string;
  /** Подписанная ссылка на фото; null — фото нет или хранилище не настроено. */
  photoUrl: string | null;
  keyLabel: string;
  roomId: string | null;
  /** «Корпус 2 · 14» — готовая подпись комнаты. */
  roomLabel: string | null;
  personalInfo: string;
  color: TravelGuestColor;
  checkInOn: string;
  leftOn: string | null;
  /** Живёт сейчас: не отмечен выезд. */
  living: boolean;
  /** Сумма оплаченных суток по записям кассы. */
  paidNights: number;
  /** Последний оплаченный день включительно; null — оплат ещё не было. */
  paidThrough: string | null;
  /** Сколько суток проживания по сегодня не оплачено; 0 — долга нет. */
  unpaidNights: number;
}

export interface TravelGuestsResponse {
  items: TravelGuestDto[];
  rooms: { id: string; label: string }[];
}

export interface SaveTravelGuestRequest {
  fullName: string;
  phone?: string;
  keyLabel?: string;
  roomId?: string | null;
  personalInfo?: string;
  color?: TravelGuestColor;
  checkInOn: string;
  leftOn?: string | null;
}

export interface SaveTravelCashCategoryRequest {
  kind: TravelCashKind;
  name: string;
  icon: TravelCashIcon;
}

export interface TravelCashTemplateDto {
  id: string;
  name: string;
  kind: TravelCashKind;
  /** null — сумму вводят каждый раз. */
  amountMinor: number | null;
  categoryId: string | null;
  note: string;
  tags: string[];
}

export interface TravelCashTemplatesResponse {
  items: TravelCashTemplateDto[];
}

export type SaveTravelCashTemplateRequest = Omit<TravelCashTemplateDto, 'id'>;
