// API-клиент сервиса «Контакты». См. docs/service-module-contract.md.
// Запросы идут из браузера: авторизация — той же cookie, что и у остальных
// сервисов, поэтому здесь только знание эндпоинтов, без работы с токенами.
import type {
  ContactsAshram,
  ContactsCardDto,
  ContactsCreateRequestBody,
  ContactsDisclosuresState,
  ContactsFieldPrivacy,
  ContactsFieldVisibility,
  ContactsFormat,
  ContactsMapResponse,
  ContactsProfileDto,
  ContactsProfileState,
  ContactsRequestsState,
  ContactsRespondBody,
  ContactsSearchFilters,
  ContactsSearchResponse,
  ContactsTagsResponse,
  ContactsUpdateProfileRequest,
  ContactsVisibility,
  SpiritualStage,
} from "@vedamatch/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Лимиты повторяют ограничения contacts-profile.service.ts на стороне API. */
export const CONTACTS_MAX_HEADLINE_LENGTH = 120;
export const CONTACTS_MAX_TEXT_LENGTH = 2000;
export const CONTACTS_MAX_LANGUAGES = 10;
export const CONTACTS_MAX_TAGS = 12;
/** Столько же, сколько принимает contacts-requests.service.ts. */
export const CONTACTS_MAX_MESSAGE_LENGTH = 500;

export class ContactsApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function requestJson<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    ...init,
  });
  if (!res.ok) {
    // Бэкенд присылает готовый русский текст ошибки — он точнее кода статуса.
    const message = await res
      .json()
      .then((body: { message?: string | string[] }) =>
        Array.isArray(body.message) ? body.message.join(", ") : body.message,
      )
      .catch(() => undefined);
    throw new ContactsApiError(
      message ?? `Запрос не выполнен (${res.status})`,
      res.status,
    );
  }
  return (await res.json()) as T;
}

/** Своя карточка. `profile: null` — карточки ещё нет. */
export const getContactsProfileState = (signal?: AbortSignal) =>
  requestJson<ContactsProfileState>("/contacts/profile", {
    method: "GET",
    signal,
  });

/** Справочник тегов для выбора: сгруппировать по `kind` — задача формы. */
export const getContactsTags = (signal?: AbortSignal) =>
  requestJson<ContactsTagsResponse>("/contacts/tags", { method: "GET", signal });

export const updateContactsProfile = (body: ContactsUpdateProfileRequest) =>
  requestJson<ContactsProfileDto>("/contacts/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

// ===== Поиск по справочнику =====

/** Порядок значений в фильтрах. Заодно белый список для разбора URL. */
export const CONTACTS_STAGES: SpiritualStage[] = [
  "seeker",
  "practitioner",
  "yogi",
  "devotee",
];

export const CONTACTS_ASHRAMS: ContactsAshram[] = [
  "brahmachari",
  "grihastha",
  "vanaprastha",
  "sannyasi",
];

/** `any` в фильтре не нужен: «любой формат» — это отсутствие параметра. */
export const CONTACTS_SEARCH_FORMATS: ContactsFormat[] = ["online", "offline"];

function appendText(
  query: URLSearchParams,
  key: string,
  value: string | undefined,
): void {
  const trimmed = value?.trim();
  if (trimmed) query.append(key, trimmed);
}

function appendNumber(
  query: URLSearchParams,
  key: string,
  value: number | undefined,
): void {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    query.append(key, String(value));
  }
}

function appendList(
  query: URLSearchParams,
  key: string,
  values: string[] | undefined,
): void {
  // Повторяющийся параметр: `?tagIds=a&tagIds=b` — так их ждёт бэкенд.
  for (const value of values ?? []) appendText(query, key, value);
}

/**
 * Центр радиуса уходит только парой и только вместе с радиусом: точка без
 * радиуса ничего не сужает, а половина пары — ошибка запроса на бэкенде.
 * Ноль здесь допустим (экватор и Гринвич), поэтому `appendNumber` не годится.
 */
function appendCoordinates(
  query: URLSearchParams,
  filters: ContactsSearchFilters,
): void {
  const { lat, lon, radiusKm } = filters;
  if (!radiusKm) return;
  if (typeof lat !== "number" || !Number.isFinite(lat)) return;
  if (typeof lon !== "number" || !Number.isFinite(lon)) return;
  query.append("lat", String(lat));
  query.append("lon", String(lon));
}

/** Ложный флаг равен отсутствию фильтра, поэтому в запрос он не попадает. */
function appendFlag(
  query: URLSearchParams,
  key: string,
  value: boolean | undefined,
): void {
  if (value) query.append(key, "true");
}

/**
 * Query-строка `GET contacts/search`. Пустые, нулевые и неопределённые
 * значения не отправляются: пустой параметр бэкенд трактовал бы как фильтр
 * «пустая строка», а не как «фильтра нет».
 */
export function buildContactsSearchQuery(
  filters: ContactsSearchFilters,
): string {
  const query = new URLSearchParams();
  appendText(query, "q", filters.q);
  appendText(query, "city", filters.city);
  appendText(query, "country", filters.country);
  appendNumber(query, "radiusKm", filters.radiusKm);
  appendCoordinates(query, filters);
  appendList(query, "stages", filters.stages);
  appendList(query, "ashram", filters.ashram);
  appendList(query, "tagIds", filters.tagIds);
  appendList(query, "languages", filters.languages);
  appendText(query, "format", filters.format);
  appendFlag(query, "verifiedDevoteeOnly", filters.verifiedDevoteeOnly);
  appendFlag(query, "photoVerifiedOnly", filters.photoVerifiedOnly);
  appendNumber(query, "page", filters.page);
  appendNumber(query, "pageSize", filters.pageSize);
  return query.toString();
}

/** Минимум от `URLSearchParams`, чтобы принимать и `useSearchParams()`. */
export interface ContactsQueryParams {
  get(name: string): string | null;
  getAll(name: string): string[];
}

function parseList<T extends string>(
  params: ContactsQueryParams,
  key: string,
  allowed: readonly T[],
): T[] | undefined {
  // Мусор из адресной строки отбрасываем молча: иначе он уехал бы в API.
  const values = allowed.filter((value) => params.getAll(key).includes(value));
  return values.length > 0 ? values : undefined;
}

function parseText(
  params: ContactsQueryParams,
  key: string,
): string | undefined {
  const value = params.get(key)?.trim();
  return value ? value : undefined;
}

function parseNumber(
  params: ContactsQueryParams,
  key: string,
): number | undefined {
  const value = Number(params.get(key));
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

/** Координата может быть нулём и отрицательной, поэтому проверка своя. */
function parseCoordinate(
  params: ContactsQueryParams,
  key: string,
  limit: number,
): number | undefined {
  const raw = params.get(key);
  if (raw === null || raw.trim() === "") return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < -limit || value > limit) {
    return undefined;
  }
  return value;
}

/**
 * Фильтры из адресной строки страницы. Ключи URL совпадают с параметрами API,
 * поэтому ссылкой на поиск можно поделиться, а «назад» возвращает прошлую выдачу.
 */
export function parseContactsSearchFilters(
  params: ContactsQueryParams,
): ContactsSearchFilters {
  const format = CONTACTS_SEARCH_FORMATS.find(
    (value) => value === params.get("format"),
  );

  // Координаты берём только парой: одна половина центра для бэкенда — ошибка,
  // и достраивать её из адресной строки нечем.
  const lat = parseCoordinate(params, "lat", 90);
  const lon = parseCoordinate(params, "lon", 180);
  const hasCenter = lat !== undefined && lon !== undefined;

  return {
    q: parseText(params, "q"),
    city: parseText(params, "city"),
    country: parseText(params, "country"),
    radiusKm: parseNumber(params, "radiusKm"),
    lat: hasCenter ? lat : undefined,
    lon: hasCenter ? lon : undefined,
    stages: parseList(params, "stages", CONTACTS_STAGES),
    ashram: parseList(params, "ashram", CONTACTS_ASHRAMS),
    tagIds: params.getAll("tagIds").filter(Boolean),
    languages: params.getAll("languages").filter(Boolean),
    format,
    verifiedDevoteeOnly: params.get("verifiedDevoteeOnly") === "true",
    photoVerifiedOnly: params.get("photoVerifiedOnly") === "true",
    page: parseNumber(params, "page") ?? 1,
  };
}

export const searchContacts = (
  filters: ContactsSearchFilters,
  signal?: AbortSignal,
) => {
  const query = buildContactsSearchQuery(filters);
  return requestJson<ContactsSearchResponse>(
    query ? `/contacts/search?${query}` : "/contacts/search",
    { method: "GET", signal },
  );
};

/**
 * Города для карты по тем же фильтрам, что и выдача. Страница и её размер
 * карте не нужны: ей нужны все совпадения сразу, а не текущий срез.
 */
export const getContactsMapPoints = (
  filters: ContactsSearchFilters,
  signal?: AbortSignal,
) => {
  const query = buildContactsSearchQuery({
    ...filters,
    page: undefined,
    pageSize: undefined,
  });
  return requestJson<ContactsMapResponse>(
    query ? `/contacts/map?${query}` : "/contacts/map",
    { method: "GET", signal },
  );
};

/**
 * Чужая карточка по прямой ссылке.
 *
 * На 404 бэкенд намеренно не различает «карточки нет» и «вам её не видно»,
 * поэтому и клиент этой разницы знать не может: у него на руках только статус.
 */
export const getContactsCard = (userId: string, signal?: AbortSignal) =>
  requestJson<ContactsCardDto>(
    `/contacts/users/${encodeURIComponent(userId)}`,
    { method: "GET", signal },
  );

/**
 * Черновик формы. Отличается от DTO тем, что поля здесь всегда строки:
 * `<input>` не умеет хранить `null`, а `<select>` — `undefined`.
 */
export interface ContactsProfileDraft {
  headline: string;
  about: string;
  offers: string;
  languages: string[];
  /** Пустая строка — «ашрам не указан». */
  ashram: ContactsAshram | "";
  format: ContactsFormat;
  visibility: ContactsVisibility;
  /** `YYYY-MM-DD` из `<input type="date">`; пустая строка — паузы нет. */
  pausedUntil: string;
  fieldPrivacy: Required<ContactsFieldPrivacy>;
  requestsFromVerifiedOnly: boolean;
  tagIds: string[];
}

const visibleIfUnset = (
  value: ContactsFieldVisibility | undefined,
): ContactsFieldVisibility => value ?? "everyone";

export function toContactsDraft(
  profile: ContactsProfileDto | null,
): ContactsProfileDraft {
  return {
    headline: profile?.headline ?? "",
    about: profile?.about ?? "",
    offers: profile?.offers ?? "",
    languages: profile?.languages ?? [],
    ashram: profile?.ashram ?? "",
    format: profile?.format ?? "any",
    visibility: profile?.visibility ?? "everyone",
    // Сервер отдаёт ISO-момент, `<input type="date">` понимает только дату.
    pausedUntil: profile?.pausedUntil ? profile.pausedUntil.slice(0, 10) : "",
    fieldPrivacy: {
      city: visibleIfUnset(profile?.fieldPrivacy?.city),
      photo: visibleIfUnset(profile?.fieldPrivacy?.photo),
      age: visibleIfUnset(profile?.fieldPrivacy?.age),
    },
    requestsFromVerifiedOnly: profile?.requestsFromVerifiedOnly ?? false,
    tagIds: profile?.tagIds ?? [],
  };
}

/** Пустой текст на бэкенде означает «поле не заполнено», то есть `null`. */
function textOrNull(value: string, maxLength: number): string | null {
  const trimmed = value.trim().slice(0, maxLength);
  return trimmed === "" ? null : trimmed;
}

/**
 * Тело `PUT contacts/profile` из черновика формы: обрезает тексты по лимитам,
 * выкидывает пустые языки и переводит «ничего не выбрано» в `null`.
 */
export function buildContactsProfileRequest(
  draft: ContactsProfileDraft,
): ContactsUpdateProfileRequest {
  const languages: string[] = [];
  for (const language of draft.languages) {
    const trimmed = language.trim();
    if (trimmed === "" || languages.includes(trimmed)) continue;
    if (languages.length >= CONTACTS_MAX_LANGUAGES) break;
    languages.push(trimmed);
  }

  return {
    headline: textOrNull(draft.headline, CONTACTS_MAX_HEADLINE_LENGTH),
    about: textOrNull(draft.about, CONTACTS_MAX_TEXT_LENGTH),
    offers: textOrNull(draft.offers, CONTACTS_MAX_TEXT_LENGTH),
    languages,
    ashram: draft.ashram === "" ? null : draft.ashram,
    format: draft.format,
    visibility: draft.visibility,
    // Пауза задаётся датой, а снимается концом суток — иначе «пауза до сегодня»
    // сняла бы карточку с публикации ещё до конца выбранного дня.
    pausedUntil:
      draft.pausedUntil === ""
        ? null
        : new Date(`${draft.pausedUntil}T23:59:59.999Z`).toISOString(),
    fieldPrivacy: draft.fieldPrivacy,
    requestsFromVerifiedOnly: draft.requestsFromVerifiedOnly,
    tagIds: draft.tagIds.slice(0, CONTACTS_MAX_TAGS),
  };
}

// ===== Запросы контакта и журнал раскрытий =====

/**
 * Тело `POST contacts/requests`. Пустое сообщение — это его отсутствие, а не
 * пустая строка: иначе получателю пришёл бы запрос с пустой репликой.
 */
export function buildContactsCreateRequestBody(
  toUserId: string,
  message: string,
): ContactsCreateRequestBody {
  return {
    toUserId: toUserId.trim(),
    message: textOrNull(message, CONTACTS_MAX_MESSAGE_LENGTH),
  };
}

/**
 * Тело `POST contacts/requests/:id/respond`.
 *
 * `hideFromRequester` попадает в тело ТОЛЬКО когда галочка включена явно.
 * Отказ дать телефон и желание исчезнуть из справочника — разные вещи, и
 * отправлять скрытие «за компанию» с отказом нельзя.
 */
export function buildContactsRespondBody(
  accept: boolean,
  hideFromRequester = false,
): ContactsRespondBody {
  return hideFromRequester ? { accept, hideFromRequester: true } : { accept };
}

/** Оба списка запросов и остаток суточного лимита — одним ответом. */
export const getContactsRequests = (signal?: AbortSignal) =>
  requestJson<ContactsRequestsState>("/contacts/requests", {
    method: "GET",
    signal,
  });

/** Все изменяющие вызовы возвращают уже пересчитанное состояние списков. */
export const createContactsRequest = (toUserId: string, message = "") =>
  requestJson<ContactsRequestsState>("/contacts/requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildContactsCreateRequestBody(toUserId, message)),
  });

export const respondToContactsRequest = (
  requestId: string,
  accept: boolean,
  hideFromRequester = false,
) =>
  requestJson<ContactsRequestsState>(
    `/contacts/requests/${encodeURIComponent(requestId)}/respond`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildContactsRespondBody(accept, hideFromRequester)),
    },
  );

/** Отзыв своего ещё не рассмотренного запроса. */
export const cancelContactsRequest = (requestId: string) =>
  requestJson<ContactsRequestsState>(
    `/contacts/requests/${encodeURIComponent(requestId)}`,
    { method: "DELETE" },
  );

/** Журнал «кому я открыл контакты», вместе с уже отозванными записями. */
export const getContactsDisclosures = (signal?: AbortSignal) =>
  requestJson<ContactsDisclosuresState>("/contacts/disclosures", {
    method: "GET",
    signal,
  });

export const revokeContactsDisclosure = (disclosureId: string) =>
  requestJson<ContactsDisclosuresState>(
    `/contacts/disclosures/${encodeURIComponent(disclosureId)}`,
    { method: "DELETE" },
  );
