import type {
  CreateVacancyOfferRequest,
  ProfileLocation,
  VacancyAudience,
  VacancyEmployment,
  VacancyKind,
  VacancyOfferDto,
  VacancyPayPeriod,
  VacancyPerk,
  VacancySevaTerm,
  VacancyWorkFormat,
} from "@vedamatch/shared";

/**
 * Состояние формы и правила по виду. Чистый модуль без React: форма на
 * вебе подсвечивает поля до отправки, и правила должны проверяться тестом
 * напрямую, а не кликами. Сервер проверяет то же самое ещё раз
 * (vacancy-validate.ts в API) — здесь копия для мгновенной подсказки.
 */
export interface VacancyFormState {
  kind: VacancyKind;
  title: string;
  description: string;
  audience: VacancyAudience;
  communityId: string;
  location: ProfileLocation | null;
  isRemote: boolean;

  workFormat: VacancyWorkFormat;
  employment: VacancyEmployment | "";
  schedule: string;
  payMin: string;
  payMax: string;
  payPeriod: VacancyPayPeriod;
  payCurrency: string;
  payNegotiable: boolean;

  sevaTerm: VacancySevaTerm;
  sevaUntil: string;
  perks: VacancyPerk[];

  dueAt: string;
}

export const EMPTY_VACANCY_FORM: VacancyFormState = {
  kind: "work",
  title: "",
  description: "",
  audience: "everyone",
  communityId: "",
  location: null,
  isRemote: false,
  workFormat: "onsite",
  employment: "",
  schedule: "",
  payMin: "",
  payMax: "",
  payPeriod: "month",
  payCurrency: "RUB",
  payNegotiable: false,
  sevaTerm: "ongoing",
  sevaUntil: "",
  perks: [],
  dueAt: "",
};

/** Ключ черновика в localStorage: у правки свой, чтобы не смешивать с новым. */
export function draftKey(offerId: string | null): string {
  return offerId ? `vacancies:draft:${offerId}` : "vacancies:draft:new";
}

/**
 * Первое нарушенное правило, как на сервере. Возвращается текст для
 * человека: форма показывает его под кнопкой и не даёт отправить.
 */
export function validateVacancyForm(
  form: VacancyFormState,
  now = new Date(),
): string | null {
  if (!form.title.trim()) return "Напишите заголовок";
  if (form.title.trim().length > 140) return "Заголовок длиннее 140 символов";
  if (form.audience === "my_community" && !form.communityId)
    return "Чтобы показать только общине, публикуйте от её имени";

  if (form.kind === "seva" && !form.communityId)
    return "Служение публикуется от имени общины";

  if (form.kind === "work") {
    if (form.workFormat !== "remote" && !form.location)
      return "Укажите город или выберите удалённый формат";
    const min = parseMoney(form.payMin);
    const max = parseMoney(form.payMax);
    if (min === "invalid" || max === "invalid") return "Оплата — целое число";
    if (!form.payNegotiable && min === null && max === null)
      return "Укажите оплату или отметьте «по договорённости»";
    if (min !== null && max !== null && min > max)
      return "Нижняя граница оплаты больше верхней";
  }

  if (form.kind === "seva" && form.sevaTerm !== "ongoing") {
    if (!form.sevaUntil) return "Укажите, до какой даты нужно служение";
    if (new Date(form.sevaUntil).getTime() < now.getTime())
      return "Дата служения уже прошла";
  }

  if (form.kind === "task" && form.dueAt) {
    if (new Date(form.dueAt).getTime() < now.getTime())
      return "Срок задачи уже прошёл";
  }

  return null;
}

/** Пусто — null, целое — число, остальное — ошибка. */
export function parseMoney(value: string): number | null | "invalid" {
  const trimmed = value.replace(/\s/g, "");
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) return "invalid";
  return Number(trimmed);
}

/** Запрос к API. Поля чужого вида не уходят: сервер их всё равно не пишет. */
export function toCreateRequest(
  form: VacancyFormState,
): CreateVacancyOfferRequest {
  const base: CreateVacancyOfferRequest = {
    kind: form.kind,
    title: form.title.trim(),
    description: form.description.trim() || null,
    audience: form.audience,
    communityId: form.communityId || null,
    location: form.location,
    isRemote: form.kind === "work" ? undefined : form.isRemote,
  };
  if (form.kind === "work") {
    const min = parseMoney(form.payMin);
    const max = parseMoney(form.payMax);
    return {
      ...base,
      workFormat: form.workFormat,
      employment: form.employment || null,
      schedule: form.schedule.trim() || null,
      pay: {
        min: typeof min === "number" ? min : null,
        max: typeof max === "number" ? max : null,
        period: form.payPeriod,
        currency: form.payCurrency,
        negotiable: form.payNegotiable,
      },
    };
  }
  if (form.kind === "seva")
    return {
      ...base,
      sevaTerm: form.sevaTerm,
      sevaUntil:
        form.sevaTerm !== "ongoing" && form.sevaUntil
          ? new Date(form.sevaUntil).toISOString()
          : null,
      perks: form.perks,
    };
  return {
    ...base,
    dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null,
  };
}

/** Заполнить форму из карточки — для правки. */
export function fromOffer(offer: VacancyOfferDto): VacancyFormState {
  return {
    ...EMPTY_VACANCY_FORM,
    kind: offer.kind,
    title: offer.title,
    description: offer.description ?? "",
    audience: offer.audience,
    communityId: offer.postedAs?.id ?? "",
    location: offer.city
      ? {
          city: offer.city,
          country: offer.country ?? undefined,
          lat: offer.lat ?? 0,
          lon: offer.lon ?? 0,
        }
      : null,
    isRemote: offer.isRemote,
    workFormat: offer.workFormat ?? "onsite",
    employment: offer.employment ?? "",
    schedule: offer.schedule ?? "",
    payMin: offer.pay?.min?.toString() ?? "",
    payMax: offer.pay?.max?.toString() ?? "",
    payPeriod: offer.pay?.period ?? "month",
    payCurrency: offer.pay?.currency ?? "RUB",
    payNegotiable: offer.pay?.negotiable ?? false,
    sevaTerm: offer.sevaTerm ?? "ongoing",
    sevaUntil: offer.sevaUntil ? toLocalInput(offer.sevaUntil) : "",
    perks: offer.perks,
    dueAt: offer.dueAt ? toLocalInput(offer.dueAt) : "",
  };
}

/** ISO → значение для `datetime-local` в поясе браузера. */
export function toLocalInput(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
