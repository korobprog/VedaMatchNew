import { canAdminService } from "@vedamatch/shared";
import type { AdminServiceSlug, Role } from "@vedamatch/shared";

/**
 * Кому виден раздел админки. `portal` — общепортальные разделы (пользователи,
 * поддержка, биллинг): только роль `admin`. Слаг сервиса — раздел сервиса, его
 * видит и `admin`, и `service-admin`, которому этот сервис выдан.
 */
export type AdminNavScope = "portal" | AdminServiceSlug;

export interface AdminNavItem {
  href: string;
  label: string;
  /** Строка под заголовком на главной админки; в сайдбаре не показывается. */
  hint: string;
  scope: AdminNavScope;
}

export interface AdminNavGroup {
  title: string;
  items: AdminNavItem[];
}

export const ADMIN_NAV: AdminNavGroup[] = [
  {
    title: "Люди",
    items: [
      {
        href: "/admin/users",
        label: "Пользователи",
        hint: "Поиск, роли, этапы, подписки, блокировки",
        scope: "portal",
      },
      {
        href: "/admin/verification-requests",
        label: "Заявки на проверку",
        hint: "Подтверждение преданных наставниками",
        scope: "portal",
      },
      {
        href: "/admin/reports",
        label: "Жалобы на людей",
        hint: "Обращения из Union: блокировка и разбор",
        scope: "portal",
      },
      {
        href: "/admin/communities",
        label: "Сообщества",
        hint: "Заявки храмов и общин на подтверждение",
        scope: "portal",
      },
      {
        href: "/admin/tickets",
        label: "Поддержка",
        hint: "Обращения пользователей и гостей",
        scope: "portal",
      },
    ],
  },
  {
    title: "Сервисы",
    items: [
      {
        href: "/admin/union",
        label: "Знакомства",
        hint: "Анкеты, скрытие из выдачи, сводка сервиса",
        scope: "union",
      },
      {
        href: "/admin/motivation",
        label: "Motivation",
        hint: "Очередь модерации, категории, музыка, настройки",
        scope: "motivation",
      },
      {
        href: "/admin/market",
        label: "Market",
        hint: "Каталог, жалобы на объявления, скрытие лотов",
        scope: "market",
      },
      {
        href: "/admin/library",
        label: "Образование",
        hint: "Дубли категорий, записи каталога",
        scope: "library",
      },
      {
        href: "/admin/notices",
        label: "Объявления",
        hint: "Жалобы на доску объявлений",
        scope: "notices",
      },
      {
        href: "/admin/contacts",
        label: "Справочник",
        hint: "Теги справочника и карточки участников",
        scope: "contacts",
      },
      {
        href: "/admin/astro",
        label: "Astro",
        hint: "Расход токенов и пауза генерации",
        scope: "astro",
      },
    ],
  },
  {
    title: "Платформа",
    items: [
      {
        href: "/admin/audit",
        label: "Журнал действий",
        hint: "Кто и что сделал в админке",
        scope: "portal",
      },
      {
        href: "/admin/notifications",
        label: "Рассылки",
        hint: "Объявления администрации в колокольчик и пуш",
        scope: "portal",
      },
      {
        href: "/admin/services",
        label: "Каталог сервисов",
        hint: "Карточки в сетке портала: статус, порядок, видимость",
        scope: "portal",
      },
      {
        href: "/admin/settings",
        label: "Настройки",
        hint: "Режим биллинга и глобальные параметры",
        scope: "portal",
      },
      {
        href: "/admin/changelog",
        label: "Changelog",
        hint: "Релизы, анонсы и дорожная карта",
        scope: "portal",
      },
    ],
  },
];

type NavViewer = { role: Role; adminServices?: string[] };

/** Открыт ли раздел этому администратору. */
export function canOpenAdminSection(
  user: NavViewer,
  scope: AdminNavScope,
): boolean {
  if (scope === "portal") return user.role === "admin";
  return canAdminService(user, scope);
}

/**
 * Навигация, очищенная от недоступных пунктов. Группы без единого доступного
 * пункта выпадают целиком, иначе у администратора сервиса остались бы пустые
 * заголовки.
 */
export function visibleAdminNav(
  user: NavViewer,
  groups: AdminNavGroup[] = ADMIN_NAV,
): AdminNavGroup[] {
  return groups
    .map((group) => ({
      title: group.title,
      items: group.items.filter((item) => canOpenAdminSection(user, item.scope)),
    }))
    .filter((group) => group.items.length > 0);
}

/**
 * Активный пункт для текущего пути. Сравнение по префиксу: у Motivation и
 * Market вложенные вкладки, и подсветка не должна с них слетать. `/admin`
 * совпадает только сам с собой — иначе подсвечивался бы на любой странице.
 */
export function isAdminNavItemActive(href: string, pathname: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Название текущего раздела для кнопки мобильного меню. Без него человек на
 * телефоне видел бы свёрнутый список и не понимал, где находится.
 */
export function currentAdminNavLabel(
  groups: AdminNavGroup[],
  pathname: string,
): string {
  for (const group of groups) {
    for (const item of group.items) {
      if (isAdminNavItemActive(item.href, pathname)) return item.label;
    }
  }
  return "Обзор";
}
