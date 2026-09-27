/**
 * Ширина окна ряда «Каталог, Избранное, Плейлисты…» на телефоне (VED-535,
 * круг 3). Окно кончается сразу за последним пунктом, который влез целиком:
 * «кругляшок следующей кнопки всё равно заметен — сократи графу, а не
 * размывай». Затухание по краю прятало хвост следующего пункта, но не до
 * конца; обрезать окно по целой кнопке — прятать нечего.
 *
 * `widths` — ширины пунктов по порядку, `gap` — зазор между ними,
 * `available` — сколько места у ряда внутри рамки. Результат — ширина окна в
 * целых пикселях (вверх: доли пикселя меньше зазора и следующий пункт не
 * покажут), но не шире места: иначе рамка вылезет за строку над ней.
 */
export function fitRailWidth(
  widths: readonly number[],
  gap: number,
  available: number,
): number {
  if (widths.length === 0 || available <= 0) return Math.max(0, available);
  let used = 0;
  for (let index = 0; index < widths.length; index += 1) {
    const next = used + (index > 0 ? gap : 0) + widths[index];
    // Полпикселя допуска: округление вёрстки не должно выкидывать пункт,
    // который на деле влезает.
    if (next > available + 0.5) {
      // Даже первый не влез — отдаём всё место: пусть листается, но пустой
      // рамки не будет.
      return index === 0 ? Math.floor(available) : fit(used, available);
    }
    used = next;
  }
  return fit(used, available);
}

function fit(used: number, available: number): number {
  return Math.min(Math.ceil(used), Math.floor(available));
}
