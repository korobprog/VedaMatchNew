import type { WellnessIngredientClass } from '@vedamatch/shared';
import type { WellnessDietRestrictions } from './diet-verdict';

/**
 * Что портал считает неподходящим по умолчанию (VED-335).
 *
 * До этого модуля человек без заполненной анкеты питания получал на колбасу
 * вердикт `clean`: `resolveVerdict` при пустых ограничениях судить отказывается
 * и честно показывает состав. Для общего сервиса это правильно, но VedaMatch —
 * вайшнавский портал, и «подходит» на сосиски у полки — худший из возможных
 * ответов. Умолчание закрывает ровно этот разрыв.
 *
 * Правило различения — «профиля нет» против «профиль есть и в нём пусто»:
 *
 * - строки `WellnessDietProfile` нет вовсе → человек ничего не выбирал, и за
 *   него отвечает умолчание портала;
 * - строка есть, списки пустые → человек ОСОЗНАННО снял все ограничения, и
 *   подставлять ему умолчание значит не слышать его ответ.
 *
 * Поэтому умолчание живёт здесь, а не в `?? []` внутри запроса: разница между
 * `null` и пустым массивом — смысловая, и её надо было назвать словами.
 */

/**
 * Классы целиком. Молочное, мёд и кофеин сюда НЕ входят: молоко для вайшнава
 * не просто разрешено, а желанно, а мёд и кофеин — вопрос личной практики, а
 * не общего правила. Грибы и алкоголь спорны ровно так же и остаются за
 * человеком — умолчание обязано быть тем, под чем подпишется любой преданный,
 * иначе его первым делом отключат целиком.
 */
export const WELLNESS_DEFAULT_EXCLUDED: readonly WellnessIngredientClass[] = [
  'meat',
  'fish',
  'egg',
  'gelatin',
  'rennet',
  'onion',
  'garlic',
];

/**
 * Отдельные записи справочника поверх классов. Кармин и шеллак — животные
 * добавки в классе `additive`, где рядом лежат совершенно безобидные: закрыть
 * класс целиком значило бы ругаться на любую букву E, а это быстро приучает
 * не верить сканеру. Поэтому — по ключу.
 *
 * Список пополняется ключами из `prisma/wellness-ingredients-data.js`, а не
 * ветвлениями: сам справочник — данные, и умолчание поверх него тоже данные.
 */
export const WELLNESS_DEFAULT_EXCLUDED_KEYS: readonly string[] = [
  'e120',
  'e904',
  'e920',
];

export const WELLNESS_DEFAULT_RESTRICTIONS: WellnessDietRestrictions = {
  excluded: [...WELLNESS_DEFAULT_EXCLUDED],
  excludedKeys: [...WELLNESS_DEFAULT_EXCLUDED_KEYS],
};

/** Строка профиля из базы — ровно те два поля, которые нас интересуют. */
export interface StoredDietProfile {
  excluded: WellnessIngredientClass[];
  excludedKeys: string[];
}

/**
 * Ограничения человека: его собственные, если анкета заполнялась, иначе
 * умолчание портала. Копия, а не ссылка на константу: вызывающий код не
 * должен уметь испортить умолчание всем остальным.
 */
export function restrictionsOrDefault(
  profile: StoredDietProfile | null | undefined,
): WellnessDietRestrictions {
  if (!profile) {
    return {
      excluded: [...WELLNESS_DEFAULT_RESTRICTIONS.excluded],
      excludedKeys: [...WELLNESS_DEFAULT_RESTRICTIONS.excludedKeys],
    };
  }
  return {
    excluded: [...profile.excluded],
    excludedKeys: [...profile.excludedKeys],
  };
}
