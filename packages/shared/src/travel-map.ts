// Подсервис «Карта» внутри папки «Путешествия»: места, которые отмечают сами
// люди портала — храмы, общины, вегетарианские кафе и магазины, места
// харинам и санкиртаны, святые места. В отличие от `TravelPlace` (точки
// администрации, вокруг которых собирается ночлег) это народная карта:
// добавить место может каждый, администрация лишь подтверждает и прячет.

import type { LineageId } from './lineage';

/**
 * Вид места. Закрытый список: он определяет значок, цвет метки и фильтр, а
 * не свойства места. Общины здесь названы по устройству (матх, нама-хатта,
 * бхакти-врикша), а к какому обществу относится место — отдельное поле
 * `lineage` из общего справочника линий.
 */
export const TRAVEL_MAP_PLACE_KINDS = [
  'temple',
  'math',
  'nama_hatta',
  'bhakti_vriksha',
  'ashram',
  'farm',
  'holy_place',
  'cafe',
  'shop',
  'eco_shop',
  'prasadam',
  'harinam_spot',
  'sankirtana_spot',
  'other',
] as const;
export type TravelMapPlaceKind = (typeof TRAVEL_MAP_PLACE_KINDS)[number];

/**
 * Группа видов — это ряд фильтров-чипов на карте. Четырнадцать чипов не
 * помещаются на телефоне, четыре — да.
 */
export const TRAVEL_MAP_PLACE_GROUPS = [
  'community',
  'food',
  'preaching',
  'holy',
] as const;
export type TravelMapPlaceGroup = (typeof TRAVEL_MAP_PLACE_GROUPS)[number];

export const TRAVEL_MAP_PLACE_GROUP_LABELS: Record<TravelMapPlaceGroup, string> =
  {
    community: 'Храмы и общины',
    food: 'Еда и магазины',
    preaching: 'Харинамы и санкиртана',
    holy: 'Святые места',
  };

export interface TravelMapPlaceKindOption {
  id: TravelMapPlaceKind;
  group: TravelMapPlaceGroup;
  label: string;
  /** Значок метки на карте и в чипе. Эмодзи, а не картинка: метка — divIcon. */
  icon: string;
}

/** Порядок — порядок в списках выбора. */
export const TRAVEL_MAP_PLACE_KIND_OPTIONS: readonly TravelMapPlaceKindOption[] =
  [
    { id: 'temple', group: 'community', label: 'Храм', icon: '🛕' },
    { id: 'math', group: 'community', label: 'Матх', icon: '🏯' },
    { id: 'nama_hatta', group: 'community', label: 'Нама-хатта', icon: '🏠' },
    {
      id: 'bhakti_vriksha',
      group: 'community',
      label: 'Бхакти-врикша',
      icon: '🌳',
    },
    { id: 'ashram', group: 'community', label: 'Ашрам', icon: '🧘' },
    { id: 'farm', group: 'community', label: 'Ферма, эко-поселение', icon: '🐄' },
    { id: 'cafe', group: 'food', label: 'Вегетарианское кафе', icon: '🍛' },
    { id: 'shop', group: 'food', label: 'Вегетарианский магазин', icon: '🛒' },
    { id: 'eco_shop', group: 'food', label: 'Эко-магазин', icon: '🌿' },
    { id: 'prasadam', group: 'food', label: 'Раздача прасада', icon: '🥣' },
    { id: 'harinam_spot', group: 'preaching', label: 'Место харинамы', icon: '🥁' },
    {
      id: 'sankirtana_spot',
      group: 'preaching',
      label: 'Место санкиртаны',
      icon: '📚',
    },
    { id: 'holy_place', group: 'holy', label: 'Святое место', icon: '🕉️' },
    { id: 'other', group: 'holy', label: 'Другое', icon: '📍' },
  ];

export const TRAVEL_MAP_PLACE_KIND_LABELS = Object.fromEntries(
  TRAVEL_MAP_PLACE_KIND_OPTIONS.map((option) => [option.id, option.label]),
) as Record<TravelMapPlaceKind, string>;

export function travelMapPlaceKindOption(
  kind: TravelMapPlaceKind,
): TravelMapPlaceKindOption {
  return (
    TRAVEL_MAP_PLACE_KIND_OPTIONS.find((option) => option.id === kind) ??
    TRAVEL_MAP_PLACE_KIND_OPTIONS[TRAVEL_MAP_PLACE_KIND_OPTIONS.length - 1]
  );
}

/** Виды, у которых есть смысл спрашивать линию (общество, матх, паривар). */
export const TRAVEL_MAP_LINEAGE_KINDS: readonly TravelMapPlaceKind[] = [
  'temple',
  'math',
  'nama_hatta',
  'bhakti_vriksha',
  'ashram',
  'farm',
];

/**
 * `active` — видно всем. `hidden` — спрятано администрацией (жалоба,
 * дубль, закрылось); автор видит своё место с пометкой. Черновиков нет:
 * место либо на карте, либо нет.
 */
export const TRAVEL_MAP_PLACE_STATUSES = ['active', 'hidden'] as const;
export type TravelMapPlaceStatus = (typeof TRAVEL_MAP_PLACE_STATUSES)[number];

export const TRAVEL_MAP_PLACE_NAME_MAX = 120;
export const TRAVEL_MAP_PLACE_DESCRIPTION_MAX = 4000;
export const TRAVEL_MAP_PLACE_ADDRESS_MAX = 300;
export const TRAVEL_MAP_PLACE_HOURS_MAX = 200;
export const TRAVEL_MAP_PLACE_PHOTOS_MAX = 10;
export const TRAVEL_MAP_REPORT_REASON_MAX = 1000;

/** Автор места наружу: имя по правилу портала, `isAgent` — рядом с именем. */
export interface TravelMapAuthorDto {
  id: string;
  name: string;
  isAgent: boolean;
}

/** Точка на карте — минимум для метки и подписи. */
export interface TravelMapPointDto {
  id: string;
  kind: TravelMapPlaceKind;
  name: string;
  lat: number;
  lng: number;
  city: string | null;
  lineage: LineageId | null;
  verified: boolean;
  photoUrl: string | null;
  /** Давно не подтверждалось — метка тусклая. */
  stale: boolean;
}

/**
 * Община из портального справочника, показанная слоем на той же карте.
 * Читается напрямую из `Community` — это одна из четырёх портальных моделей,
 * доступных любому сервису только для чтения. Ссылка ведёт в «Общение».
 */
export interface TravelMapCommunityPointDto {
  id: string;
  slug: string;
  kind: string;
  name: string;
  lat: number;
  lng: number;
  city: string | null;
  verified: boolean;
}

/**
 * Объект размещения из подсервиса ночлега — тот же модуль «Путешествий»,
 * поэтому читается своей таблицей `TravelStay`. Ссылка ведёт на страницу
 * объекта `/travel/stays/<id>`: там заявка на ночлег и «Написать хозяину»,
 * дублировать их на карте незачем.
 */
export interface TravelMapStayPointDto {
  id: string;
  /** TravelStayKind: hotel, hostel, guesthouse, ashram, homestay. */
  kind: string;
  name: string;
  lat: number;
  lng: number;
  address: string;
  /** TravelStayPayment: paid, seva, both. */
  payment: string;
  priceMinor: number | null;
  currency: string;
  photoUrl: string | null;
}

export interface TravelMapPlacesResponse {
  points: TravelMapPointDto[];
  communities: TravelMapCommunityPointDto[];
  stays: TravelMapStayPointDto[];
  /** Мест по фильтру больше, чем поместилось в ответ, — приблизьте карту. */
  truncated: boolean;
}

/**
 * Свежесть места. Народные карты умирают не от спама, а от устаревания:
 * кафе закрылось, а метка висит. Поэтому у каждого места есть дата
 * последнего подтверждения и число голосов «закрылось» за последние
 * `TRAVEL_MAP_CLOSED_WINDOW_DAYS`. `stale` — подтверждений и правок не было
 * дольше `TRAVEL_MAP_STALE_DAYS`: метка тускнеет и просит перепроверки.
 */
export interface TravelMapFreshnessDto {
  lastConfirmedAt: string | null;
  confirmations: number;
  closedVotes: number;
  stale: boolean;
  /** Что отметил смотрящий, если отмечал. */
  myVerdict: TravelMapCheckVerdict | null;
}

export const TRAVEL_MAP_CHECK_VERDICTS = ['confirmed', 'closed'] as const;
export type TravelMapCheckVerdict = (typeof TRAVEL_MAP_CHECK_VERDICTS)[number];

export const TRAVEL_MAP_CHECK_VERDICT_LABELS: Record<TravelMapCheckVerdict, string> =
  {
    confirmed: 'Был здесь, всё верно',
    closed: 'Закрылось или переехало',
  };

export const TRAVEL_MAP_STALE_DAYS = 365;
export const TRAVEL_MAP_CLOSED_WINDOW_DAYS = 90;
/** Столько разных людей отметили «закрылось» — заводится жалоба админу. */
export const TRAVEL_MAP_CLOSED_VOTES_TO_REPORT = 2;

export interface CheckTravelMapPlaceRequest {
  verdict: TravelMapCheckVerdict;
}

/** Короткая полезная заметка к месту: лайфхак, «вход со двора», «прасад по воскресеньям». */
export interface TravelMapNoteDto {
  id: string;
  placeId: string;
  text: string;
  author: TravelMapAuthorDto | null;
  canDelete: boolean;
  createdAt: string;
}

export const TRAVEL_MAP_NOTE_TEXT_MAX = 1000;
export const TRAVEL_MAP_NOTES_PER_PLACE = 50;

export interface CreateTravelMapNoteRequest {
  text: string;
}

export interface TravelMapPlaceDto extends TravelMapPointDto {
  freshness: TravelMapFreshnessDto;
  description: string;
  address: string;
  country: string | null;
  openingHours: string | null;
  website: string | null;
  phone: string | null;
  telegram: string | null;
  photoUrls: string[];
  status: TravelMapPlaceStatus;
  hiddenReason: string | null;
  verifiedAt: string | null;
  author: TravelMapAuthorDto | null;
  /** Смотрящий — автор или админ: показывать правку и удаление. */
  canEdit: boolean;
  /** Группа места в «Общении»; null — ещё не открывали. */
  chatConversationId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TravelMapPlacesQuery {
  minLat?: number;
  maxLat?: number;
  minLng?: number;
  maxLng?: number;
  /** Виды через запятую. Пусто — все. */
  kinds?: string;
  q?: string;
  lineage?: string;
  /** `0` — без слоя общин. По умолчанию слой включён. */
  communities?: string;
  /** `0` — без слоя ночлега (хостелы, отели, ашрамы). По умолчанию включён. */
  stays?: string;
}

export interface CreateTravelMapPlaceRequest {
  kind: TravelMapPlaceKind;
  name: string;
  lat: number;
  lng: number;
  description?: string;
  address?: string;
  city?: string | null;
  country?: string | null;
  lineage?: LineageId | null;
  openingHours?: string | null;
  website?: string | null;
  phone?: string | null;
  telegram?: string | null;
}

export type UpdateTravelMapPlaceRequest = Partial<CreateTravelMapPlaceRequest>;

export interface ReportTravelMapPlaceRequest {
  reason: string;
}

export const TRAVEL_MAP_REPORT_STATUSES = ['open', 'resolved'] as const;
export type TravelMapReportStatus = (typeof TRAVEL_MAP_REPORT_STATUSES)[number];

export interface TravelMapReportDto {
  id: string;
  placeId: string;
  placeName: string;
  reason: string;
  status: TravelMapReportStatus;
  reporter: TravelMapAuthorDto | null;
  createdAt: string;
}

export interface AdminTravelMapPlacesQuery {
  status?: TravelMapPlaceStatus;
  verified?: '0' | '1';
  q?: string;
}

export interface AdminHideTravelMapPlaceRequest {
  reason?: string;
}

export interface AdminTravelMapReportsQuery {
  status?: TravelMapReportStatus;
}

// ----- Связь с «Общением»: только события шины -----

/**
 * «Открыть группу места». Карта публикует через emitAsync, «Общение» заводит
 * группу со снимком места в `context*` и возвращает id беседы — тот же
 * приём, что `travel.contact.requested`.
 */
export const TRAVEL_MAP_GROUP_REQUESTED_EVENT = 'travel.map.group.requested';

export interface TravelMapGroupRequestedEvent {
  requesterId: string;
  placeId: string;
  title: string;
  kindLabel: string;
  lat: number;
  lng: number;
  city: string | null;
}

/**
 * Поиск мест для формы «Новая группа» в чате. Чат публикует через emitAsync,
 * карта отвечает снимками: компоненты и клиенты чужого сервиса на вебе не
 * импортируются, поэтому чат спрашивает свой API, а тот — шину.
 */
export const TRAVEL_MAP_PLACES_SEARCH_EVENT = 'travel.map.places.search';

export interface TravelMapPlacesSearchRequest {
  q: string;
  limit: number;
}

export interface TravelMapPlaceSnapshotDto {
  id: string;
  title: string;
  kindLabel: string;
  lat: number;
  lng: number;
  city: string | null;
}

/**
 * Чат привязал беседу к месту (создал группу с полем «Место» или по
 * запросу карты). Карта запоминает id беседы снимком, без FK.
 */
export const CHAT_CONVERSATION_CONTEXT_LINKED_EVENT =
  'chat.conversation.context-linked';

export interface ChatConversationContextLinkedEvent {
  service: string;
  contextId: string;
  conversationId: string;
}

export interface TravelMapGroupResponse {
  conversationId: string;
}
