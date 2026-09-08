import type {
  VacancyAudience,
  VacancyEmployment,
  VacancyKind,
  VacancyOfferDto,
  VacancyPayDto,
  VacancyPayPeriod,
  VacancyPerk,
  VacancyReportReason,
  VacancyResponseStatus,
  VacancySevaTerm,
  VacancyStatus,
  VacancyWorkFormat,
} from "@vedamatch/shared";

export const VACANCY_KIND_LABELS: Record<VacancyKind, string> = {
  work: "Работа",
  seva: "Служение",
  task: "Разовая задача",
};

/** Короткая подпись для чипа в карточке. */
export const VACANCY_KIND_CHIPS: Record<VacancyKind, string> = {
  work: "Работа",
  seva: "Служение",
  task: "Задача",
};

export const VACANCY_KIND_ORDER: VacancyKind[] = ["work", "seva", "task"];

/** Подсказка под выбором вида в форме. */
export const VACANCY_KIND_HINTS: Record<VacancyKind, string> = {
  work: "За оплату: у преданного-предпринимателя, в проекте, в храмовом кафе.",
  seva: "Сева в храме или ятре. Публикуется только от имени общины.",
  task: "Один раз: перевезти, сверстать, помочь на фестивале.",
};

/**
 * Цвет чипа вида. Токены дизайн-системы, а не #RRGGBB: cyan и magenta
 * мелким текстом на светлой теме не проходят контраст, поэтому чип
 * рисуется подложкой с текстом основного цвета, а не цветным текстом.
 */
export const VACANCY_KIND_CHIP_STYLE: Record<VacancyKind, string> = {
  work: "border-cyan/40 bg-cyan/10 text-text-0",
  seva: "border-gold/40 bg-gold/10 text-text-0",
  task: "border-magenta/40 bg-magenta/10 text-text-0",
};

export const VACANCY_WORK_FORMAT_LABELS: Record<VacancyWorkFormat, string> = {
  onsite: "На месте",
  remote: "Удалённо",
  hybrid: "Гибрид",
};

export const VACANCY_EMPLOYMENT_LABELS: Record<VacancyEmployment, string> = {
  full_time: "Полная занятость",
  part_time: "Частичная занятость",
  project: "Проект",
  shift: "Смены",
};

export const VACANCY_PAY_PERIOD_LABELS: Record<VacancyPayPeriod, string> = {
  month: "в месяц",
  day: "в день",
  hour: "в час",
  task: "за задачу",
};

export const VACANCY_SEVA_TERM_LABELS: Record<VacancySevaTerm, string> = {
  ongoing: "Постоянно",
  until: "До даты",
  event: "На время события",
};

export const VACANCY_PERK_LABELS: Record<VacancyPerk, string> = {
  prasad: "Прасад",
  housing: "Проживание",
  travel: "Дорога",
  stipend: "Стипендия",
};

export const VACANCY_AUDIENCE_LABELS: Record<VacancyAudience, string> = {
  everyone: "Всем на портале",
  my_city: "Только моему городу",
  my_community: "Только моей общине",
};

export const VACANCY_STATUS_LABELS: Record<VacancyStatus, string> = {
  draft: "Черновик",
  published: "Опубликовано",
  hidden_by_author: "Скрыто вами",
  closed: "Закрыто: человек найден",
  expired: "Срок вышел",
  hidden_by_reports: "Скрыто по жалобам",
  removed_by_admin: "Снято администрацией",
};

export const VACANCY_RESPONSE_STATUS_LABELS: Record<
  VacancyResponseStatus,
  string
> = {
  new: "Новый",
  in_dialog: "В диалоге",
  accepted: "Принят",
  declined: "Отклонён",
  withdrawn: "Отозван",
};

export const VACANCY_REPORT_REASON_LABELS: Record<VacancyReportReason, string> =
  {
    spam: "Спам",
    scam: "Мошенничество",
    misleading: "Условия не совпадают с описанием",
    not_community: "Выдаёт себя за общину",
    inappropriate_content: "Неуместное содержание",
    duplicate: "Дубль",
    other: "Другое",
  };

const CURRENCY_SIGNS: Record<string, string> = {
  RUB: "₽",
  USD: "$",
  EUR: "€",
  INR: "₹",
};

/** «60–80 тыс. ₽ в месяц», «от 500 ₽ в час», «по договорённости». */
export function formatPay(pay: VacancyPayDto | null): string | null {
  if (!pay) return null;
  const sign = CURRENCY_SIGNS[pay.currency] ?? pay.currency;
  const period = VACANCY_PAY_PERIOD_LABELS[pay.period];
  const num = (value: number) => value.toLocaleString("ru-RU");
  if (pay.min !== null && pay.max !== null)
    return `${num(pay.min)}–${num(pay.max)} ${sign} ${period}`;
  if (pay.min !== null) return `от ${num(pay.min)} ${sign} ${period}`;
  if (pay.max !== null) return `до ${num(pay.max)} ${sign} ${period}`;
  return pay.negotiable ? "По договорённости" : null;
}

export function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
  });
}

/** «истекает через 5 дней», «истекает сегодня», «срок вышел». */
export function formatExpiry(expiresAt: string, now = new Date()): string {
  const days = Math.ceil(
    (new Date(expiresAt).getTime() - now.getTime()) / 86_400_000,
  );
  if (days < 0) return "срок вышел";
  if (days === 0) return "истекает сегодня";
  return `истекает через ${days} ${pluralDays(days)}`;
}

function pluralDays(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "день";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "дня";
  return "дней";
}

/**
 * Строка условий под заголовком: у работы — оплата, у служения — срок и что
 * дают, у задачи — дедлайн. Одна строка, потому что карточка в ленте узкая.
 */
export function offerTerms(offer: VacancyOfferDto): string | null {
  if (offer.kind === "work") return formatPay(offer.pay);
  if (offer.kind === "seva") {
    const parts: string[] = [];
    if (offer.sevaTerm === "ongoing") parts.push("постоянно");
    else if (offer.sevaUntil) parts.push(`до ${formatDate(offer.sevaUntil)}`);
    if (offer.perks.length)
      parts.push(
        offer.perks.map((perk) => VACANCY_PERK_LABELS[perk].toLowerCase()).join(", "),
      );
    return parts.length ? parts.join(" · ") : null;
  }
  return offer.dueAt ? `к ${formatDate(offer.dueAt)}` : null;
}
