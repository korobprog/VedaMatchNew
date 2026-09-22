/**
 * Название места портала по адресу (VED-326).
 *
 * Кнопка второго окна писала «Окно 2» — номер, который ничего не говорит о
 * том, что там осталось. Человеку нужно название: «Работа», «Знакомства»,
 * «Уведомления». Тем же правилом подписываются закладки, поэтому разбор
 * адреса живёт здесь, а не внутри панели.
 *
 * Имена сервисов берутся из каталога (админка → каталог сервисов) и только
 * при его отсутствии — из запасного списка в `service-content.ts`: правка
 * названия обязана доезжать и сюда.
 */

import { SERVICE_CONTENT } from "./service-content";

/** Первый сегмент пути — тем же правилом, что и у закладок. */
export function portalLocationSlug(url: string): string {
  const path = url.split(/[?#]/)[0] ?? "";
  const segment = path.split("/")[1] ?? "";
  return /^[a-z0-9-]+$/.test(segment) ? segment : "";
}

/**
 * Разделы портала, у которых нет записи в каталоге сервисов: они не сервисы,
 * а части самого портала. Список не обязан быть полным — незнакомый адрес
 * подписывается словом «Портал», и это честнее выдуманного названия.
 */
const PORTAL_SECTIONS: Readonly<Record<string, string>> = {
  admin: "Админка",
  assistant: "Ассистент",
  audit: "Проверка",
  communities: "Общины",
  donate: "Поддержать",
  legal: "Документы",
  moderation: "Модерация",
  notifications: "Уведомления",
  profile: "Профиль",
  rewards: "Баллы",
  search: "Поиск",
  settings: "Настройки",
  support: "Поддержка",
  updates: "Обновления",
  users: "Люди",
  vacancies: "Вакансии",
  welcome: "Добро пожаловать",
};

/**
 * Как подписать место, где стоит окно.
 *
 * `resolve` — функция из каталога (`useServiceNames`): слаг и запасное имя на
 * входе, настоящее имя на выходе. Без неё берётся запасное.
 */
export function portalLocationLabel(
  url: string | null,
  resolve?: (slug: string, fallback: string) => string,
): string {
  if (!url) return "Новое окно";
  const path = url.split(/[?#]/)[0] ?? "";
  if (path === "" || path === "/") return "Главная";
  const slug = portalLocationSlug(url);
  const service = SERVICE_CONTENT.find((item) => item.slug === slug);
  if (service) {
    return resolve ? resolve(service.slug, service.name) : service.name;
  }
  return PORTAL_SECTIONS[slug] ?? "Портал";
}
