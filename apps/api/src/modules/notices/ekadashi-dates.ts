/**
 * Даты экадаши.
 *
 * ЭТОТ ФАЙЛ НАМЕРЕННО ПУСТ. Экадаши — лунный календарь, он не выражается
 * правилом повторения и зависит от места наблюдения: в Москве и в Маяпуре
 * даты расходятся на сутки. Выдумать их «примерно» нельзя — по ним постятся,
 * и ошибка в дате это не косметический баг.
 *
 * Заполняется выгрузкой из вайшнавского календаря вашей ятры или с
 * `vaisnavacalendar` / GCal-календаря ИСККОН. Формат — `YYYY-MM-DD` в
 * порядке возрастания, по местному времени той зоны, для которой календарь
 * составлен.
 *
 * Пока список пуст, повтор `ekadashi` при создании события отклоняется с
 * внятным сообщением — молча отдавать пустой календарь хуже, чем отказать.
 *
 * @example
 * export const EKADASHI_DATES = ['2026-09-02', '2026-09-17', '2026-10-01'];
 */
export const EKADASHI_DATES: string[] = [];

/** Зона, в которой составлен календарь выше. Нужна для честной подписи. */
export const EKADASHI_TIME_ZONE = 'Europe/Moscow';

export function hasEkadashiCalendar(): boolean {
  return EKADASHI_DATES.length > 0;
}

/**
 * Даты экадаши в окне. Возвращает только те, что реально есть в таблице:
 * достраивать «по формуле» за её пределами нельзя.
 */
export function ekadashiBetween(from: Date, to: Date): Date[] {
  const result: Date[] = [];
  for (const raw of EKADASHI_DATES) {
    const date = new Date(`${raw}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) continue;
    if (date >= from && date <= to) result.push(date);
  }
  return result;
}
