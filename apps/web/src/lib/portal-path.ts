/**
 * Путь по порталу для хлебных крошек (VED-92).
 *
 * «Тонкая панель, которая показывает путь по порталу, чтобы в любой момент
 * кликнуть и перейти на любой шаг» — как строка пути в файловом менеджере.
 * Путь строится из адреса и только из него: никаких запросов к API, имя
 * записи или человека на последнем шаге берётся из заголовка страницы,
 * который она и так отдаёт (`document.title`).
 *
 * Имена сервисов — из каталога (через `resolve`, как у окон портала), имена
 * разделов портала и ступеней второго уровня — из того же словаря, что у
 * окон (`portal-location.ts`): одно место не должно называться на кнопке
 * окна и в пути по-разному. Глубже второго уровня имена — здесь.
 */

import { SERVICE_CONTENT } from "./service-content";
import { portalSectionName, portalStepName } from "./portal-location";

export interface PortalCrumb {
  label: string;
  /** Куда ведёт шаг; `null` — у адреса нет своей страницы, шаг без ссылки. */
  href: string | null;
  /** Последний шаг — текущая страница: не ссылка, `aria-current="page"`. */
  current: boolean;
}

export interface PortalPathOptions {
  /** Имя сервиса из каталога: слаг и запасное имя на входе. */
  resolve?: (slug: string, fallback: string) => string;
  /** Подпись первого шага; зависит от языка интерфейса. */
  home?: string;
  /**
   * Заголовок текущей страницы — уже очищенный `pageTitleForCrumb`. Идёт в
   * последний шаг, если тот — идентификатор или слаг, а не известный раздел.
   */
  title?: string | null;
}

/** Предел подписи шага в знаках: полоса тонкая, а шагов бывает пять. */
export const PORTAL_CRUMB_LIMIT = 40;

/**
 * Адреса-«папки» без своей страницы: `/market/listing` существует только как
 * часть `/market/listing/<id>`. Ссылка на такой шаг вела бы в 404.
 *
 * `*` — динамический сегмент. Список сверяется с деревом `src/app` тестом
 * `portal-path.spec.ts`: новая папка без page.tsx уронит его, и её придётся
 * внести сюда.
 */
export const PORTAL_PATH_CONTAINERS: readonly string[] = [
  "blog/authors",
  "blog/posts",
  "chat/*/thread",
  "chat/forward",
  "chat/people/users",
  "chat/with",
  "j",
  "legal",
  "library/entry",
  "m",
  "market/listing",
  "mentor-verification",
  "motivation/posts",
  "music/albums",
  "music/artists",
  "music/tracks",
  "services",
  "support/track",
  "travel/manage/*",
  "travel/s",
  "travel/stays",
  "union/users",
  "vedabase/books",
  "vedabase/books/*",
  "wellness/knowledge/article",
  "wellness/products",
  "work/act",
  "work/join",
];

/**
 * Имена шагов по шаблону пути (`*` — динамический сегмент). Для динамических
 * шагов это имя «что это такое» — «Товар», «Беседа»; последний шаг заменит
 * его заголовком страницы, если та его отдала.
 */
const ROUTE_LABELS: Readonly<Record<string, string>> = {
  "astro/subjects/*": "Человек",
  "blog/authors/*": "Автор",
  "blog/posts/*": "Запись",
  "chat/*": "Беседа",
  "chat/*/members": "Участники",
  "chat/*/thread/*": "Ветка",
  "chat/calls/probe": "Проверка связи",
  "chat/forward/*": "Переслать",
  "chat/people/disclosures": "Доступы",
  "chat/people/profile": "Анкета",
  "chat/people/requests": "Заявки",
  "chat/people/users/*": "Человек",
  "chat/with/*": "Переписка",
  "communities/*": "Община",
  "j/*": "Комната",
  "library/*": "Рубрика",
  "library/*/*": "Рубрика",
  "library/add/pro": "Подробно",
  "library/add/shloka": "Шлока",
  "library/add/simple": "Просто",
  "library/entry/*": "Запись",
  "m/*": "Открытка",
  "market/*": "Раздел",
  "market/*/*": "Категория",
  "market/chats/*": "Переписка",
  "market/listing/*": "Товар",
  "market/orders/*": "Заказ",
  "market/sell/edit": "Правка",
  "market/sell/listings": "Мои товары",
  "market/sell/listings/*": "Товар",
  "market/sell/listings/new": "Новый товар",
  "market/sell/new": "Новый товар",
  "market/shops/*": "Магазин",
  "market/shops/*/*": "Полка",
  "mentor-verification/*": "Подтверждение",
  "motivation/collections/*": "Подборка",
  "motivation/posts/*": "Запись",
  "music/albums/*": "Альбом",
  "music/artists/*": "Артист",
  "music/audiobooks/*": "Аудиокнига",
  "music/lectures/*": "Лекция",
  "music/playlists/*": "Плейлист",
  "music/tracks/*": "Запись",
  "notices/*": "Объявление",
  "services/*": "Сервис",
  "support/*": "Обращение",
  "support/track/*": "Обращение",
  "travel/manage/*": "Объект",
  "travel/manage/*/bookings": "Брони",
  "travel/manage/*/calendar": "Календарь",
  "travel/manage/*/cash": "Касса",
  "travel/manage/*/cash/stats": "Статистика",
  "travel/manage/*/guests": "Гости",
  "travel/s/*": "Приглашение",
  "travel/stays/*": "Жильё",
  "union/chats/*": "Переписка",
  "union/users/*": "Анкета",
  "vacancies/*": "Вакансия",
  "vacancies/*/edit": "Правка",
  "vacancies/*/responses": "Отклики",
  "vedabase/books/*": "Книга",
  "vedabase/books/*/*": "Глава",
  "wellness/products/*": "Продукт",
  "wellness/recipes/*": "Рецепт",
  "work/act/*": "Действие",
  "work/join/*": "Приглашение",
  "work/planner/*": "Пространство",
};

/**
 * Общие слова адресов — прежде всего разделы админки. Сегмент, которого нет
 * ни здесь, ни в шаблонах, показывается как есть, только очеловеченный.
 */
const COMMON_SEGMENTS: Readonly<Record<string, string>> = {
  add: "Добавить",
  analytics: "Аналитика",
  audio: "Аудио",
  audiobooks: "Аудиокниги",
  calls: "Звонки",
  catalog: "Каталог",
  categories: "Категории",
  changelog: "Обновления",
  contacts: "Контакты",
  create: "Создать",
  delivery: "Доставка",
  edit: "Правка",
  emoji: "Эмодзи",
  entries: "Записи",
  events: "События",
  favorites: "Избранное",
  hidden: "Скрытые",
  history: "История",
  ingest: "Загрузка",
  lectures: "Лекции",
  new: "Новое",
  official: "Официальные",
  people: "Люди",
  pictures: "Картинки",
  playlists: "Плейлисты",
  profiles: "Анкеты",
  published: "Опубликованные",
  pwa: "Приложение",
  queue: "Очередь",
  radio: "Радио",
  reels: "Рилсы",
  reports: "Жалобы",
  search: "Поиск",
  settings: "Настройки",
  stats: "Статистика",
  "team-applications": "Заявки в команду",
  tickets: "Обращения",
  users: "Люди",
  "verification-requests": "Подтверждения",
};

/** Адрес, который в пути стоит показывать. Главная — нет: путь из одного шага. */
export function portalPathSegments(pathname: string): string[] {
  const path = pathname.split(/[?#]/)[0] ?? "";
  return path
    .split("/")
    .filter(Boolean)
    .map((part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    });
}

/**
 * Где портальную полосу не рисуем.
 *
 * Главная — путь из одного шага. Рубрика Образования (`/library/<slug>`)
 * рисует свои крошки по дереву рубрик: плоский адрес места в дереве не
 * знает, и портальная полоса над ними была бы вторым, более бедным путём.
 */
export function portalBreadcrumbsHidden(pathname: string): boolean {
  const segments = portalPathSegments(pathname);
  if (segments.length === 0) return true;
  if (segments[0] === "library" && segments.length >= 2) {
    const known = ["add", "entry", "favorites"];
    return !known.includes(segments[1]!);
  }
  return false;
}

/**
 * Шаблон (или `null`) из таблицы, подходящий к сегментам. Чем меньше
 * звёздочек, тем сильнее: `market/sell/new` — «Новый товар», а не
 * «Категория» из двухзвёздного шаблона `market/<раздел>/<категория>`.
 */
function matchPattern(
  table: Iterable<string>,
  segments: readonly string[],
): string | null {
  let best: string | null = null;
  let bestStars = Infinity;
  for (const pattern of table) {
    const parts = pattern.split("/");
    if (parts.length !== segments.length) continue;
    let stars = 0;
    let ok = true;
    for (let i = 0; i < parts.length; i += 1) {
      if (parts[i] === "*") stars += 1;
      else if (parts[i] !== segments[i]) {
        ok = false;
        break;
      }
    }
    if (ok && stars < bestStars) {
      best = pattern;
      bestStars = stars;
    }
  }
  return best;
}

/** Похоже на идентификатор: число, uuid, cuid, токен — не на слово. */
export function isIdLike(segment: string): boolean {
  if (/^\d+$/.test(segment)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(segment)) return true;
  return segment.length >= 16 && /\d/.test(segment) && !segment.includes("-");
}

/** «sri-isopanishad» → «Sri isopanishad»: для слагов без имени. */
export function humanizeSegment(segment: string): string {
  const words = segment.replace(/[-_]+/g, " ").trim();
  if (!words) return segment;
  return words[0]!.toLocaleUpperCase("ru") + words.slice(1);
}

function clip(value: string, limit = PORTAL_CRUMB_LIMIT): string {
  return value.length <= limit
    ? value
    : `${value.slice(0, limit - 1).trimEnd()}…`;
}

/**
 * Заголовок документа → подпись последнего шага. Снимает суффикс шаблона
 * (`%s — VedaMatch`) и отбрасывает заголовок по умолчанию: он не про
 * страницу, а про портал.
 */
export function pageTitleForCrumb(
  title: string | null | undefined,
): string | null {
  if (!title) return null;
  const clean = title.replace(/\s+[—–-]\s+VedaMatch\s*$/, "").trim();
  if (!clean || /^VedaMatch(\s+Portal)?$/i.test(clean)) return null;
  return clean;
}

function serviceName(
  slug: string,
  resolve?: (slug: string, fallback: string) => string,
): string | null {
  const service = SERVICE_CONTENT.find((item) => item.slug === slug);
  if (!service) return null;
  return resolve ? resolve(service.slug, service.name) : service.name;
}

/**
 * Путь по адресу: «Главная › Маркет › Заказы › Заказ».
 *
 * Правила:
 * - первый шаг — Главная, второй — сервис или раздел портала;
 * - «папки» без своей страницы (`PORTAL_PATH_CONTAINERS`) внутри сервиса
 *   выпадают из пути, если это буквальное слово (`/market/listing`), и
 *   остаются шагом без ссылки, если это корень или идентификатор
 *   (`/legal`, `/travel/manage/<id>`) — иначе потерялся бы смысл;
 * - последний шаг — текущая страница, не ссылка;
 * - на Главной путь пуст: показывать нечего.
 */
export function buildPortalPath(
  pathname: string,
  options: PortalPathOptions = {},
): PortalCrumb[] {
  const segments = portalPathSegments(pathname);
  if (segments.length === 0) return [];
  const { resolve, home = "Главная", title = null } = options;
  const containers = new Set(PORTAL_PATH_CONTAINERS);
  const labelPatterns = Object.keys(ROUTE_LABELS);

  const crumbs: PortalCrumb[] = [{ label: home, href: "/", current: false }];
  const root = segments[0]!;

  segments.forEach((segment, index) => {
    const prefix = segments.slice(0, index + 1);
    const last = index === segments.length - 1;
    const matchedContainer = matchPattern(containers, prefix);
    const isContainer = !last && matchedContainer !== null;
    // Буквальная «папка» внутри сервиса — просто пространство имён: шаг
    // «Товар» после неё скажет то же самое, и ссылки у неё всё равно нет.
    if (isContainer && index > 0 && !matchedContainer!.endsWith("*")) return;

    let label: string | null = null;
    let literal = true;
    if (index === 0) {
      label = serviceName(segment, resolve) ?? portalSectionName(segment);
    } else {
      // Известная ступень второго уровня — буквальное знание, оно сильнее
      // звёздочки: `/market/orders` — «Заказы», а не «Раздел» из `market/*`.
      if (index === 1) label = portalStepName(root, segment);
      if (!label) {
        const pattern = matchPattern(labelPatterns, prefix);
        if (pattern) {
          label = ROUTE_LABELS[pattern]!;
          literal = pattern.split("/")[index] !== "*";
        }
      }
      if (!label && index === 1 && root === "admin") {
        label = serviceName(segment, resolve) ?? portalSectionName(segment);
      }
      if (!label) label = COMMON_SEGMENTS[segment] ?? null;
    }
    if (!label) {
      literal = false;
      label = isIdLike(segment)
        ? `#${segment.slice(0, 6)}`
        : humanizeSegment(segment);
    }
    // Имя записи, человека, товара — из заголовка страницы, если он есть.
    if (last && !literal && title) label = title;

    crumbs.push({
      label: clip(label),
      href: last || isContainer ? null : `/${prefix.join("/")}`,
      current: last,
    });
  });

  return crumbs;
}
