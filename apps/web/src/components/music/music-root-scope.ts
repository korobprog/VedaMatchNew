import type { MusicArtistDto, MusicCategoryDto } from "@vedamatch/shared";

/**
 * Срез витрины по корневой категории — «Традиционное»/«Современное» (VED-165).
 *
 * Отдельным модулем, а не внутри страницы: сама витрина только раскладывает
 * готовые списки по секциям, а решать, кто в срез попадает, приходится в трёх
 * местах сразу (кружки исполнителей, ряд «Исполнитель» в фильтрах, набор
 * стилей), и разъехаться этим трём нельзя.
 */

/** Корневая категория по слагу из адреса. `null` — вкладка «Всё». */
export function findRootCategory(
  categories: MusicCategoryDto[],
  rootSlug: string | null,
): MusicCategoryDto | null {
  if (!rootSlug) return null;
  return (
    categories.find(
      (category) => category.kind === "root" && category.slug === rootSlug,
    ) ?? null
  );
}

/**
 * Исполнители выбранной корневой категории (VED-165, третий пункт заказчика).
 *
 * До этой правки вкладка сужала только записи, а секция «Исполнители» стояла
 * нетронутой: человек выбирал «Традиционное» и видел под ней кружки
 * современных исполнителей, ведущие на страницы, которых в этом срезе нет.
 *
 * Корневая живёт у исполнителя (`rootCategoryId`, VED-165-2), поэтому срез
 * считается тем же полем, что и у записей на сервере
 * (`artist.rootCategory.slug`), а не пересчётом по трекам — иначе два места
 * отвечали бы на один вопрос по-разному.
 *
 * Неразмеченный исполнитель (`rootCategoryId === null`) выпадает из обеих
 * вкладок, и это правильно: его записи сервер тоже не отдаёт — условие по
 * связи `artist.rootCategory` не совпадает с пустой связью. Кружок без единой
 * доступной записи хуже отсутствующего: он обещает список, который откроется
 * пустым. На вкладке «Всё» виден весь список.
 */
export function artistsInRoot(
  artists: MusicArtistDto[],
  rootCategoryId: string | null,
): MusicArtistDto[] {
  if (rootCategoryId === null) return artists;
  return artists.filter((artist) => artist.rootCategoryId === rootCategoryId);
}

/** Сравнение названий категорий: регистр и лишние пробелы значения не имеют. */
function sameTitle(left: string, right: string): boolean {
  return (
    left.trim().toLocaleLowerCase("ru") === right.trim().toLocaleLowerCase("ru")
  );
}

/**
 * Стили для панели «Фильтры» (VED-165, второй пункт заказчика).
 *
 * Корневым категориям в панели фильтров не место: «это главные, корневые
 * папки» — их выбирают вкладками над каталогом, и вторая пара тех же названий
 * ниже читается как отдельный, независимый фильтр.
 *
 * Мало отбросить `kind === 'root'`. На проде «Традиционное» и «Современное»
 * успели завести вручную обычными категориями ещё до появления корневых, и в
 * базе остались их тёзки с `kind: 'style'` и нулём записей: они-то и попадали
 * в «Стиль». Поэтому стиль, повторяющий название корневой, отбрасывается тоже
 * — правка данных не нужна, а новый дубль (заведут ещё раз) не всплывёт в
 * панели снова.
 */
export function styleFilterCategories(
  categories: MusicCategoryDto[],
): MusicCategoryDto[] {
  const rootTitles = categories
    .filter((category) => category.kind === "root")
    .map((category) => category.title);

  return categories.filter(
    (category) =>
      category.kind === "style" &&
      !rootTitles.some((title) => sameTitle(title, category.title)),
  );
}
