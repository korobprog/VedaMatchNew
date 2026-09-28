// Графа «Дата» в окне задачи (VED-598): когда карточку завели.
//
// С годом: доска живёт дольше года, и «9 сентября» без года у старой
// карточки читается как свежая.

/** Дата создания задачи для графы «Дата»: «9 сентября 2026 г.». */
export function formatTaskDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
