/**
 * Название места портала по адресу (VED-326, VED-374).
 *
 * Кнопка второго окна писала «Окно 2» — номер, который ничего не говорит о
 * том, что там осталось. Человеку нужно название: «Работа», «Знакомства»,
 * «Уведомления». Тем же правилом подписываются закладки, поэтому разбор
 * адреса живёт здесь, а не внутри панели.
 *
 * VED-374: одного корневого сервиса мало. Человек стоял в Блог-ленте, а на
 * кнопке было написано «Портал» — корень `/blog` не значился ни в каталоге
 * сервисов, ни в списке разделов, и адрес честно не опознавался. Теперь у
 * места две части: КОРЕНЬ (сервис или раздел портала) и СТУПЕНЬ (второй
 * сегмент пути) — «Блог · Авторы», «Работа · Доска».
 *
 * Имена сервисов берутся из каталога (админка → каталог сервисов) и только
 * при его отсутствии — из запасного списка в `service-content.ts`: правка
 * названия обязана доезжать и сюда. Имена ступеней — наши: у подраздела нет
 * записи в каталоге.
 */

import { SERVICE_CONTENT } from "./service-content";

/** Что стоит между корнем и ступенью. Точка, а не тире: она уже полей. */
export const PORTAL_LOCATION_JOINER = " · ";

/**
 * Предел подписи в знаках (VED-374).
 *
 * Критерий приёмки заказчик назвал сам: значок окна не должен смещаться.
 * Плитка панели высотой 72px центрирует значок и подпись по вертикали, и
 * вторая строка подписи поднимает значок вверх. Значит подпись обязана
 * помещаться в одну строку. Ширина плитки при узкой панели — 94px, из них
 * под текст остаётся ~87px, а 11px Manrope тратит на кириллическую букву
 * около 6px: четырнадцать знаков — это замеренная вместимость строки, а не
 * круглое число (замер и цифры — в отчёте по VED-374).
 *
 * Предел здесь не единственная защита: сама плитка обрезает подпись в одну
 * строку средствами CSS. Но CSS режет посреди слова, а знание о том, ЧТО
 * именно выбросить, есть только здесь.
 */
export const PORTAL_LOCATION_LIMIT = 14;

/** Первый сегмент пути — тем же правилом, что и у закладок. */
export function portalLocationSlug(url: string): string {
  return segment(url, 1);
}

/** Второй сегмент пути — ступень внутри сервиса или раздела. */
export function portalLocationStep(url: string): string {
  return segment(url, 2);
}

function segment(url: string, index: number): string {
  const path = url.split(/[?#]/)[0] ?? "";
  const part = path.split("/")[index] ?? "";
  return /^[a-z0-9-]+$/.test(part) ? part : "";
}

/**
 * Разделы портала, у которых нет записи в каталоге сервисов: они не сервисы,
 * а части самого портала.
 *
 * VED-374: список перестал быть выборочным. Раньше «незнакомый адрес —
 * «Портал»» было разумной страховкой, а на деле под неё попадали живые
 * разделы вроде Блог-ленты, и страховка читалась как поломка. Здесь теперь
 * все корни маршрутов портала; «Портал» остаётся ответом только для
 * действительно нового адреса, которого в этом списке ещё нет.
 */
const PORTAL_SECTIONS: Readonly<Record<string, string>> = {
  admin: "Админка",
  app: "Приложение",
  assistant: "Ассистент",
  audit: "Проверка",
  blog: "Блог",
  communities: "Общины",
  donate: "Поддержать",
  gitabase: "Гитабаза",
  j: "Конференция",
  legal: "Документы",
  login: "Вход",
  m: "Открытка",
  "mentor-verification": "Наставник",
  moderation: "Модерация",
  notifications: "Уведомления",
  offline: "Офлайн",
  profile: "Профиль",
  rewards: "Баллы",
  search: "Поиск",
  "self-identification": "О себе",
  services: "Сервис",
  settings: "Настройки",
  share: "Поделиться",
  stats: "Статистика",
  support: "Поддержка",
  team: "Команда",
  travel: "Путешествия",
  updates: "Обновления",
  users: "Люди",
  vacancies: "Вакансии",
  vaishnava: "Вайшнавам",
  welcome: "Добро пожаловать",
};

/**
 * Ступени внутри корня (VED-374): второй сегмент пути → как он называется.
 *
 * Только известные ступени. Сегмент, которого здесь нет, ступенью не
 * становится вовсе — и это защита, а не пробел: в адресе на втором месте
 * часто стоит идентификатор (`/chat/8f21…`, `/notices/1487`), и показать его
 * человеку значит написать на кнопке мусор. Не опознали ступень — на кнопке
 * остаётся корень, как было до VED-374.
 *
 * Имена короткие намеренно: подпись живёт в одну строку шириной с плитку
 * (см. `PORTAL_LOCATION_LIMIT`), и «Рекомендации» вместо «Подбора» съедает
 * место, которое нужно названию сервиса рядом.
 */
const PORTAL_STEPS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  astro: {
    chart: "Карта",
    compatibility: "Совместимость",
    subjects: "Люди",
  },
  blog: { authors: "Авторы" },
  chat: {
    appearance: "Оформление",
    calls: "Звонки",
    discover: "Кого найти",
    forward: "Переслать",
    map: "Карта",
    new: "Новый чат",
    people: "Люди",
    requests: "Заявки",
    share: "Поделиться",
    with: "Переписка",
  },
  communities: { new: "Новая" },
  legal: { privacy: "Данные", terms: "Условия" },
  library: {
    add: "Добавить",
    entry: "Запись",
    favorites: "Избранное",
  },
  market: {
    cart: "Корзина",
    chats: "Переписка",
    favorites: "Избранное",
    listing: "Товар",
    orders: "Заказы",
    rules: "Правила",
    sell: "Продать",
    shops: "Магазины",
    subscriptions: "Подписки",
  },
  motivation: {
    collections: "Картинки",
    create: "Создать",
    favorites: "Избранное",
    my: "Моё",
    posts: "Запись",
    settings: "Настройки",
  },
  music: {
    albums: "Альбом",
    artists: "Артист",
    audiobooks: "Аудиокниги",
    favorites: "Избранное",
    friends: "Друзья",
    history: "История",
    offline: "Офлайн",
    playlists: "Плейлисты",
    settings: "Настройки",
    tracks: "Запись",
    uploads: "Загрузки",
  },
  notices: {
    events: "Афиша",
    map: "Карта",
    my: "Мои",
    new: "Новое",
    responses: "Отклики",
    rules: "Правила",
    subscriptions: "Подписки",
  },
  support: { track: "Обращение" },
  travel: {
    bookings: "Брони",
    cash: "Касса",
    manage: "Управление",
    stays: "Жильё",
  },
  union: {
    chats: "Переписка",
    collections: "Подборки",
    connections: "Связи",
    hidden: "Скрытые",
    likes: "Симпатии",
    location: "Город",
    profile: "Анкета",
    recommendations: "Подбор",
    users: "Анкета",
  },
  updates: { history: "История", news: "Новости", roadmap: "Планы" },
  vacancies: { mine: "Мои", new: "Новая", responses: "Отклики" },
  vedabase: { offline: "Офлайн" },
  wellness: {
    basket: "Корзина",
    diet: "Питание",
    history: "История",
    products: "Продукт",
    recipes: "Рецепты",
    scan: "Сканер",
  },
  work: {
    agenda: "Повестка",
    boards: "Доска",
    join: "Приглашение",
    planner: "Планировщик",
  },
};

export interface PortalLocation {
  /** Сервис или раздел портала: «Блог», «Работа», «Портал». */
  root: string;
  /** Ступень внутри него; `null` — её не опознали или её нет. */
  step: string | null;
}

/**
 * Разбор адреса на корень и ступень.
 *
 * `resolve` — функция из каталога (`useServiceNames`): слаг и запасное имя на
 * входе, настоящее имя на выходе. Без неё берётся запасное.
 */
export function portalLocation(
  url: string | null,
  resolve?: (slug: string, fallback: string) => string,
): PortalLocation {
  if (!url) return { root: "Новое окно", step: null };
  const path = url.split(/[?#]/)[0] ?? "";
  if (path === "" || path === "/") return { root: "Главная", step: null };

  const slug = portalLocationSlug(url);
  const service = SERVICE_CONTENT.find((item) => item.slug === slug);
  const root = service
    ? resolve
      ? resolve(service.slug, service.name)
      : service.name
    : (PORTAL_SECTIONS[slug] ?? "Портал");
  // Ступень ищем только у опознанного корня: у «Портала» мы не знаем даже,
  // что за сервис, и второй сегмент подписать нечем.
  const known = service || PORTAL_SECTIONS[slug];
  const step = known
    ? (PORTAL_STEPS[slug]?.[portalLocationStep(url)] ?? null)
    : null;
  return { root, step };
}

/**
 * Полное название места — «Блог · Авторы». Идёт в подсказку и скринридеру:
 * там места сколько угодно, и обрезать там нечего.
 */
export function portalLocationTitle(
  url: string | null,
  resolve?: (slug: string, fallback: string) => string,
): string {
  const { root, step } = portalLocation(url, resolve);
  return step ? `${root}${PORTAL_LOCATION_JOINER}${step}` : root;
}

/**
 * Как подписать место, где стоит окно, — коротко (VED-374).
 *
 * Правило обрезки: выбрасывается НАЧАЛО, а не конец. Длинное название —
 * это всегда «сервис · ступень», и из двух половин общая (сервис) хуже
 * частной (ступень): сервис человек и так узнаёт по значку и по тому, что
 * сам это окно оставил, а «Картинки» или «Плейлисты» — единственное, чего он
 * про второе окно не помнит. Обрезать конец значило бы вернуться ровно к
 * тому, на что жаловались: на кнопке снова один корневой сервис.
 *
 * И только если сама ступень длиннее строки — режем её с конца многоточием:
 * у одного слова голова опознаётся, хвост нет.
 */
export function portalLocationLabel(
  url: string | null,
  resolve?: (slug: string, fallback: string) => string,
  limit: number = PORTAL_LOCATION_LIMIT,
): string {
  const { root, step } = portalLocation(url, resolve);
  return shortenPortalLocation(root, step, limit);
}

export function shortenPortalLocation(
  root: string,
  step: string | null,
  limit: number = PORTAL_LOCATION_LIMIT,
): string {
  if (!step) return clip(root, limit);
  const full = `${root}${PORTAL_LOCATION_JOINER}${step}`;
  if (full.length <= limit) return full;
  return clip(step, limit);
}

function clip(value: string, limit: number): string {
  if (limit <= 1) return value.slice(0, Math.max(0, limit));
  // Хвост обрезанного слова не несёт смысла, а пробел перед многоточием
  // читается как пропущенное слово.
  return value.length <= limit
    ? value
    : `${value.slice(0, limit - 1).trimEnd()}…`;
}
