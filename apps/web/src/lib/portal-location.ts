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
 * «Надпись не должна быть длинной» — это предел по смыслу, а не по
 * пикселям: четырнадцать знаков — строка самой широкой плитки (панель в
 * 26rem, 11px Manrope, ~85px под текст).
 *
 * Помещается ли подпись в плитку ЭТОГО экрана, решает не он. После VED-391
 * панель на телефоне встаёт в четыре столбца, и ширина плитки гуляет от
 * ~63px (экран 320) до ~93px (широкий экран). Поэтому здесь готовится
 * лестница вариантов — от полного к короткому (`portalLocationOptions`), а
 * плитка меряет их по своей фактической ширине и берёт первый, что влез.
 * CSS-обрезка многоточием остаётся последней страховкой: она режет посреди
 * слова, а знание о том, ЧТО выбросить, есть только здесь.
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
  // Мастер первого входа. Заголовок страницы — «Добро пожаловать», но
  // на кнопке это 99px при 71 доступных на телефоне (VED-391).
  welcome: "Первые шаги",
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
 * частной (ступень): сервис человек помнит — он сам это окно там оставил, —
 * а «Картинки» или «Плейлисты» — как раз то, чего он про второе окно не
 * помнит. (Значок у кнопки — всегда значок окна, а не сервиса, так что на
 * него здесь не рассчитываем.) Обрезать конец значило бы вернуться ровно к
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
  return portalLocationLabels(url, resolve, limit)[0]!;
}

/**
 * Все допустимые подписи места — от самой полной к самой короткой (VED-374,
 * VED-391). Плитка берёт первую, что влезла в её фактическую ширину; первая
 * в списке — то же, что `portalLocationLabel`.
 */
export function portalLocationLabels(
  url: string | null,
  resolve?: (slug: string, fallback: string) => string,
  limit: number = PORTAL_LOCATION_LIMIT,
): string[] {
  const { root, step } = portalLocation(url, resolve);
  return portalLocationOptions(root, step, limit);
}

/**
 * Лестница подписей по правилу обрезки из `portalLocationLabel`: сначала
 * «корень · ступень», потом одна ступень, и только последней — ступень,
 * обрезанная с конца. Каждый вариант не длиннее `limit`.
 */
export function portalLocationOptions(
  root: string,
  step: string | null,
  limit: number = PORTAL_LOCATION_LIMIT,
): string[] {
  if (!step) return [clip(root, limit)];
  const full = `${root}${PORTAL_LOCATION_JOINER}${step}`;
  const options = full.length <= limit ? [full] : [];
  const short = clip(step, limit);
  if (!options.includes(short)) options.push(short);
  return options;
}

export function shortenPortalLocation(
  root: string,
  step: string | null,
  limit: number = PORTAL_LOCATION_LIMIT,
): string {
  return portalLocationOptions(root, step, limit)[0]!;
}

function clip(value: string, limit: number): string {
  if (limit <= 1) return value.slice(0, Math.max(0, limit));
  // Хвост обрезанного слова не несёт смысла, а пробел перед многоточием
  // читается как пропущенное слово.
  return value.length <= limit
    ? value
    : `${value.slice(0, limit - 1).trimEnd()}…`;
}
