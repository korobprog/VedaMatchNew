import type { ChatConversationContext } from "@vedamatch/shared";

/**
 * Что показать в шапке диалога, открытого по отклику в «Вакансиях», и что
 * в ней можно сделать. Чистая логика без React: правила «кто решает» и
 * «когда решение уже принято» проверяются тестом, а не кликами.
 */
export interface ContextBarState {
  /** «Отклик · Работа» и т.п. */
  kicker: string;
  title: string;
  /** Подпись статуса для человека. */
  statusLabel: string;
  /** Смотрящий — автор предложения, и решение ещё не принято. */
  canDecide: boolean;
  /** Ссылка «Открыть предложение», если известен его id. */
  offerHref: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  new: "ждёт ответа",
  in_dialog: "в диалоге",
  accepted: "отклик принят",
  declined: "по отклику отказ",
  withdrawn: "отклик отозван",
  closed: "предложение закрыто",
};

const KIND_LABELS: Record<string, string> = {
  work: "Работа",
  seva: "Служение",
  task: "Задача",
};

const DECIDABLE = new Set(["new", "in_dialog"]);

export function contextBarState(
  context: ChatConversationContext,
  viewerId: string,
): ContextBarState {
  const kind = context.meta?.offerKind
    ? (KIND_LABELS[context.meta.offerKind] ?? "Вакансии")
    : "Вакансии";
  const isAuthor = context.meta?.authorId === viewerId;
  return {
    kicker: `Отклик · ${kind}`,
    title: context.title,
    // Незнакомый статус показываем как есть: событие могло прийти из более
    // новой версии сервиса, и молчать хуже, чем показать код.
    statusLabel: STATUS_LABELS[context.status] ?? context.status,
    canDecide: isAuthor && DECIDABLE.has(context.status),
    offerHref: context.meta?.offerId
      ? `/vacancies/${encodeURIComponent(context.meta.offerId)}`
      : null,
  };
}
