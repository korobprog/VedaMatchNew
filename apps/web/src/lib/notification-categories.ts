import type { NotificationPreferencesDto } from "@vedamatch/shared";

/**
 * Список тумблеров уведомлений и их подписи.
 *
 * Вынесено из разметки (`components/pwa/notification-settings.tsx`) вместе с
 * VED-361: у звонков появился свой выключатель, и главным в настройках стало
 * не перечисление, а объяснение — что именно замолчит и что продолжит
 * работать. Такое объяснение — решение, а не оформление: его проверяет тест,
 * а не взгляд на страницу.
 */

/** Ключ тумблера: категория уведомлений либо канал доставки (`telegram`). */
export type NotificationSwitchKey = keyof Pick<
  NotificationPreferencesDto,
  | "chat"
  | "calls"
  | "connections"
  | "support"
  | "transits"
  | "market"
  | "notices"
  | "motivation"
  | "music"
  | "work"
  | "travel"
  | "announcements"
  | "telegram"
>;

export interface NotificationCategoryRow {
  key: NotificationSwitchKey;
  label: string;
  /**
   * Что происходит при текущем положении тумблера; `null` — строка не нужна,
   * подписи хватает. Объяснение есть там, где человек иначе ошибётся: у
   * «Сообщений» и «Звонков», которые легко принять за один выключатель.
   */
  note: string | null;
}

export function notificationCategoryRows(preferences: {
  chat: boolean;
  calls: boolean;
}): NotificationCategoryRow[] {
  return [
    {
      key: "chat",
      label: "Сообщения",
      note: preferences.chat
        ? "Выключите — перестанут приходить сообщения, звонки продолжат звонить."
        : "Сообщения не приходят. Звонки при этом звонят — у них свой выключатель ниже.",
    },
    {
      key: "calls",
      label: "Звонки",
      note: preferences.calls
        ? "Звонок дойдёт, даже если беседа без звука. Выключите — перестанут звонить звонки, сообщения продолжат приходить."
        : "О звонке не сообщаем нигде — ни в браузере, ни на телефоне. Сообщения при этом приходят — у них свой выключатель выше.",
    },
    { key: "connections", label: "Заявки и совпадения", note: null },
    { key: "support", label: "Поддержка", note: null },
    { key: "transits", label: "Персональный день (астрология)", note: null },
    // Сообщения чата Рынка идут под тумблером «Сообщения»: это та же переписка.
    { key: "market", label: "Заявки на Рынке", note: null },
    // Отдельно от Рынка: выключив коммерцию, человек не должен молча потерять
    // доску общины — подписки на рубрику и город, отклики на свои объявления.
    { key: "notices", label: "Доска «Объявления»", note: null },
    // Только про свои публикации: лента вдохновения сама по себе не пишет.
    { key: "motivation", label: "Мои рилсы: студия «Вдохновения»", note: null },
    // Тоже только про своё: о чужих новинках каталога тумблер не сообщает.
    { key: "music", label: "Мои записи в «Музыке»", note: null },
    { key: "work", label: "Задачи и приглашения в «Работе»", note: null },
    // Отдельно от Рынка: выключив торговлю, человек не должен потерять
    // ответ хозяина по ночлегу на своём пути.
    { key: "travel", label: "Заявки на ночлег в «Путешествиях»", note: null },
    { key: "announcements", label: "Новости VedaMatch", note: null },
    // Не категория, а канал: всё включённое выше дублируется сообщением от
    // @vedamatch_bot тем, кто вошёл через Telegram и разрешил боту писать.
    {
      key: "telegram",
      label: "Дублировать в Telegram (@vedamatch_bot)",
      note: null,
    },
  ];
}
