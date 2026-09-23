/**
 * Геометрия просмотра картинки материала (VED-138): «увеличить нажатием».
 *
 * Открытая картинка вписывается в экран целиком — и крупнее своего размера
 * тоже, иначе баннер 640px на широком мониторе остался бы полосой посередине.
 * Нажатие на неё приближает в `ZOOM` раз вокруг точки нажатия; дальше её
 * водят пальцем, как любую прокрутку. Повторное нажатие возвращает целиком.
 */

/** Во сколько раз приближает нажатие. */
export const ZOOM = 2.5;

export interface Size {
  width: number;
  height: number;
}

/** Размер картинки, вписанной в область целиком, с сохранением пропорций. */
export function fitSize(natural: Size, area: Size): Size {
  if (
    natural.width <= 0 ||
    natural.height <= 0 ||
    area.width <= 0 ||
    area.height <= 0
  ) {
    return { width: 0, height: 0 };
  }
  const scale = Math.min(
    area.width / natural.width,
    area.height / natural.height,
  );
  return {
    width: Math.round(natural.width * scale),
    height: Math.round(natural.height * scale),
  };
}

/**
 * Прокрутка по одной оси после приближения: точка картинки под пальцем
 * остаётся под пальцем.
 *
 * `fraction` — где на картинке нажали (0…1 по этой оси), `zoomed` — длина
 * картинки после приближения, `area` — длина видимой области, `pointer` —
 * где в ней был палец. Картинка короче области стоит по центру, прокрутки
 * у неё нет — ответ 0. Выход за края браузер обрезал бы сам, но считаем
 * честно, чтобы ответ был проверяемым.
 */
export function zoomScrollOffset(
  fraction: number,
  zoomed: number,
  area: number,
  pointer: number,
): number {
  if (zoomed <= area) return 0;
  const clamped = Math.min(1, Math.max(0, fraction));
  const offset = clamped * zoomed - pointer;
  return Math.round(Math.min(zoomed - area, Math.max(0, offset)));
}
