import type {
  NoticeAudience,
  NoticeDto,
  NoticeKind,
  NoticeRecurrence,
  NoticeStatus,
} from "@vedamatch/shared";

export const NOTICE_KIND_LABELS: Record<NoticeKind, string> = {
  offer: "Отдаю и предлагаю",
  request: "Ищу и прошу помощи",
  event: "Событие",
  info: "Информация",
};

/** Короткая подпись для чипа в карточке. */
export const NOTICE_KIND_CHIPS: Record<NoticeKind, string> = {
  offer: "Отдаю",
  request: "Ищу",
  event: "Событие",
  info: "Инфо",
};

export const NOTICE_KIND_ORDER: NoticeKind[] = [
  "offer",
  "request",
  "event",
  "info",
];

export const NOTICE_RECURRENCE_LABELS: Record<NoticeRecurrence, string> = {
  none: "Один раз",
  weekly: "Каждую неделю",
  biweekly: "Раз в две недели",
  monthly: "Раз в месяц",
  ekadashi: "По экадаши",
};

export const NOTICE_RECURRENCE_ORDER: NoticeRecurrence[] = [
  "none",
  "weekly",
  "biweekly",
  "monthly",
  "ekadashi",
];

export const NOTICE_AUDIENCE_LABELS: Record<NoticeAudience, string> = {
  everyone: "Всем на портале",
  my_city: "Только моему городу",
  my_community: "Только моей общине",
};

export const NOTICE_STATUS_LABELS: Record<NoticeStatus, string> = {
  draft: "Черновик",
  published: "Опубликовано",
  hidden_by_author: "Скрыто вами",
  resolved: "Вопрос решён",
  expired: "Срок вышел",
  moved_to_market: "Перенесено в Рынок",
  hidden_by_reports: "Скрыто по жалобам",
  removed_by_admin: "Снято администрацией",
};

/** Заголовок карточки: заполнена одна локаль из пары, берём ту, что есть. */
export function noticeTitle(notice: NoticeDto): string {
  return notice.titleRu ?? notice.titleEn ?? "Без названия";
}

export function noticeDescription(notice: NoticeDto): string | null {
  return notice.descriptionRu ?? notice.descriptionEn;
}

export function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
  });
}

/**
 * Подсказки к рубрикам, у которых край доски проходит прямо посередине.
 *
 * Показываются под выбором рубрики, а не в правилах: про границу с Рынком
 * человек должен узнать до того, как напишет текст, а не после того, как
 * объявление уедет в очередь модератора.
 *
 * Список короткий намеренно — подсказка у каждой рубрики превращается
 * в шум, который перестают читать.
 */
export const RUBRIC_HINTS: Record<string, string> = {
  housing:
    "Сосед, ночлег на фестиваль, «пущу пожить» — сюда. Сдача внаём и съём за деньги — это Рынок, даже если сумму не писать.",
  seva: "Служение и волонтёрство. Если за работу платят — это вакансия, и её место в Рынке.",
  rides:
    "Попутчики и передача вещей по-дружески. Извоз за плату — в Рынок; разделить бензин пополам можно и здесь.",
  teaching:
    "Наставничество и обучение бесплатно. Платные курсы и занятия — в Рынок.",
};

/**
 * Дата и время события в его собственном поясе. «Программа в 17:00» должна
 * остаться 17:00 по месту проведения, куда бы ни переехал смотрящий, —
 * поэтому пояс приходит с сервера и подставляется явно.
 */
export function formatEventTime(
  startsAt: string,
  timeZone: string | null,
): string {
  const options: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  };
  if (timeZone) options.timeZone = timeZone;
  try {
    return new Date(startsAt).toLocaleString("ru-RU", options);
  } catch {
    // Незнакомый пояс не должен ронять карточку — показываем без него.
    delete options.timeZone;
    return new Date(startsAt).toLocaleString("ru-RU", options);
  }
}
