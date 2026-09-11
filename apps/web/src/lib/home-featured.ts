import type { ServiceCard } from "@vedamatch/shared";

/**
 * Три крупные кнопки над сеткой главной — свои у каждого (VED-86).
 *
 * Выбор живёт в cookie, как тема и язык, а не в localStorage, как порядок
 * сетки: кнопки отсеивают свои плитки из сетки ещё на сервере, и выбор,
 * известный только браузеру, давал бы главную, которая сначала рисует чужие
 * кнопки, а потом перескакивает на свои.
 *
 * Чистый модуль: разбор cookie и добор до трёх кнопок проверяются тестом.
 */
export const HOME_FEATURED_COOKIE = "vm_home_featured";
export const HOME_FEATURED_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
export const HOME_FEATURED_SIZE = 3;

/** Что стояло наверху до настройки — и что получает тот, кто её не трогал. */
export const DEFAULT_HOME_FEATURED: readonly string[] = ["chat", "music", "calls"];

export interface HomeFeaturedOption {
  /** Слаг сервиса из каталога либо ключ раздела вне каталога (`calls`). */
  key: string;
  name: string;
  /** Короткая подпись под названием; на узком экране не показывается. */
  hint: string | null;
  href: string;
}

/**
 * Разделы, которых нет в каталоге сервисов, но за которыми ходят напрямую.
 * Звонки — часть Общения, своей плитки в сетке у них нет.
 */
const EXTRA_OPTIONS: readonly HomeFeaturedOption[] = [
  { key: "calls", name: "Звонки", hint: "Кто звонил и кому", href: "/chat/calls" },
];

/**
 * Подписи короче описаний каталога: там по предложению, а под значком
 * помещается два-три слова.
 */
const HINTS: Record<string, string> = {
  chat: "Чаты и беседы",
  music: "Киртаны и бхаджаны",
  union: "Семья, дружба, служение",
  vedabase: "Ведическая литература",
  motivation: "Афоризмы на каждый день",
  library: "Статьи, видео, курсы",
  astro: "Карта рождения",
  market: "Товары и услуги",
  work: "Задачи и доски",
  notices: "Отдам даром, нужны руки",
  wellness: "Сканер состава",
};

/**
 * Из чего выбирать: работающие сервисы каталога, который видит человек, и
 * разделы вне каталога. «Скоро» сюда не попадает — кнопка наверху обещает
 * самое ходовое, а ведёт в пустоту.
 */
export function homeFeaturedOptions(
  services: readonly ServiceCard[],
): HomeFeaturedOption[] {
  const options: HomeFeaturedOption[] = [];
  for (const service of services) {
    if (service.status !== "active") continue;
    options.push({
      key: service.slug,
      name: service.name,
      hint: HINTS[service.slug] ?? null,
      href: service.url,
    });
    // Звонки — рядом с Общением: в списке выбора их ищут там же.
    if (service.slug === "chat") options.push(...EXTRA_OPTIONS);
  }
  if (!services.some((s) => s.slug === "chat" && s.status === "active")) {
    options.push(...EXTRA_OPTIONS);
  }
  return options;
}

const KEY_RE = /^[a-z0-9-]{1,40}$/;

/**
 * Значение cookie несёт `userId`: на общем устройстве второй человек не
 * должен получить чужие кнопки. Чужой или битый выбор — `null`, то есть
 * «как по умолчанию».
 */
export function parseHomeFeatured(
  raw: string | undefined,
  userId: string,
): string[] | null {
  if (!raw) return null;
  let value: string;
  try {
    value = decodeURIComponent(raw);
  } catch {
    return null;
  }
  const separator = value.indexOf("|");
  if (separator < 0 || value.slice(0, separator) !== userId) return null;
  const keys = value
    .slice(separator + 1)
    .split(",")
    .filter((key) => KEY_RE.test(key));
  return keys.length > 0 ? keys.slice(0, HOME_FEATURED_SIZE) : null;
}

export function serializeHomeFeatured(
  userId: string,
  keys: readonly string[],
): string {
  return encodeURIComponent(`${userId}|${keys.join(",")}`);
}

/**
 * Ровно три кнопки, без повторов. Сервис из сохранённого выбора мог
 * пропасть — выключен или человеку больше не виден; пустое место занимает
 * кнопка по умолчанию, а не дыра в ряду.
 */
export function resolveHomeFeatured(
  saved: readonly string[] | null,
  options: readonly HomeFeaturedOption[],
): HomeFeaturedOption[] {
  const byKey = new Map(options.map((option) => [option.key, option]));
  const picked: HomeFeaturedOption[] = [];
  const candidates = [
    ...(saved ?? []),
    ...DEFAULT_HOME_FEATURED,
    ...options.map((option) => option.key),
  ];
  for (const key of candidates) {
    if (picked.length === HOME_FEATURED_SIZE) break;
    const option = byKey.get(key);
    if (option && !picked.includes(option)) picked.push(option);
  }
  return picked;
}

/**
 * Поставить `key` в место `index`. Если сервис уже стоит в другом месте,
 * они меняются местами: иначе один выбор молча стирал бы другой, а
 * запрещённые пункты в списке заставляли бы сначала освобождать место.
 */
export function assignHomeFeaturedSlot(
  slots: readonly string[],
  index: number,
  key: string,
): string[] {
  const next = [...slots];
  const previous = next[index];
  const taken = next.indexOf(key);
  if (taken >= 0 && taken !== index && previous !== undefined) {
    next[taken] = previous;
  }
  next[index] = key;
  return next;
}
