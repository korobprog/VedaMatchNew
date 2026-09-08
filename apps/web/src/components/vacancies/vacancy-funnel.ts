import type { VacancyResponseDto, VacancyResponseStatus } from "@vedamatch/shared";

/**
 * Воронка откликов автора: чистая логика без React, чтобы правила
 * проверялись тестом, а не кликами. Колонки — статусы; отозванные в воронку
 * не попадают: соискатель передумал, и разбирать нечего.
 */
export type FunnelColumn = Exclude<VacancyResponseStatus, "withdrawn">;

export const FUNNEL_COLUMNS: Array<{
  key: FunnelColumn;
  title: string;
  note: string;
}> = [
  { key: "new", title: "Новые", note: "Ждут вашего ответа" },
  { key: "in_dialog", title: "В диалоге", note: "Переписка открыта" },
  { key: "accepted", title: "Приняты", note: "Договорились" },
  { key: "declined", title: "Отклонены", note: "Без причины, так честнее" },
];

export type Funnel = Record<FunnelColumn, VacancyResponseDto[]>;

export function buildFunnel(items: VacancyResponseDto[]): Funnel {
  const funnel: Funnel = { new: [], in_dialog: [], accepted: [], declined: [] };
  for (const item of items) {
    if (item.status === "withdrawn") continue;
    funnel[item.status].push(item);
  }
  return funnel;
}

/** Какие действия доступны по отклику в его текущем статусе. */
export function funnelActions(status: VacancyResponseStatus): {
  dialog: boolean;
  accept: boolean;
  decline: boolean;
} {
  switch (status) {
    case "new":
      return { dialog: true, accept: true, decline: true };
    case "in_dialog":
      return { dialog: true, accept: true, decline: true };
    case "accepted":
      // Принятого можно только позвать в диалог: решение назад не ходит.
      return { dialog: true, accept: false, decline: false };
    default:
      return { dialog: false, accept: false, decline: false };
  }
}

/** Оптимистичный перенос: отклик уезжает в новую колонку до ответа сервера. */
export function moveInFunnel(
  items: VacancyResponseDto[],
  responseId: string,
  status: FunnelColumn,
): VacancyResponseDto[] {
  return items.map((item) =>
    item.id === responseId ? { ...item, status } : item,
  );
}
