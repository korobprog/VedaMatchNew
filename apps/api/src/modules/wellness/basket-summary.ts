import type { WellnessBasketSummary, WellnessVerdict } from '@vedamatch/shared';

/**
 * Свод по корзине: сколько продуктов подходит, сколько нет и сколько под
 * вопросом.
 *
 * Вынесено отдельно и покрыто тестом, потому что человек принимает решение
 * именно по этой строке, не разворачивая список. Ошибка на единицу здесь
 * стоит дороже, чем в любом другом месте раздела.
 */
export function summarizeBasket(
  verdicts: WellnessVerdict[],
): WellnessBasketSummary {
  const summary: WellnessBasketSummary = {
    total: verdicts.length,
    clean: 0,
    warning: 0,
    forbidden: 0,
    unknown: 0,
  };
  for (const verdict of verdicts) summary[verdict] += 1;
  return summary;
}
