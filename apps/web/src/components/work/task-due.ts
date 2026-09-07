// Срок задачи между полем `datetime-local` и API.
//
// Поле знает только местное время без зоны («2026-09-07T23:59»), API — только
// ISO с зоной. Перевод в обе стороны и значение по умолчанию вынесены сюда:
// в разметке они превращались в три разных способа посчитать одно и то же.

/** Местное время в том виде, в каком его понимает `datetime-local`. */
function toInput(date: Date): string {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

/** Сохранённый срок в поле ввода. Пусто — срока нет. */
export function dueToInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : toInput(date);
}

/**
 * Поле ввода обратно в ISO. Недописанная дата («2026-09-») даёт NaN, а не
 * дату 1970 года: пока человек печатает, поле проходит через невалидные
 * состояния, и отправлять их на сервер нельзя.
 */
export function dueFromInput(value: string): string | null | undefined {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/**
 * Срок по умолчанию у новой задачи — конец сегодняшнего дня.
 *
 * Не «через сутки» и не пусто: задача без срока выпадает из «Моего дня», а
 * ставить её на завтра, когда завели сегодня, значит просить об этом отдельно.
 * 23:59 вместо «сейчас» — иначе карточка просрочена в момент создания.
 */
export function endOfDayInput(now: Date): string {
  const end = new Date(now);
  end.setHours(23, 59, 0, 0);
  return toInput(end);
}
