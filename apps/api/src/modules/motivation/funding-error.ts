/**
 * Распознавание сбоя «кончились деньги».
 *
 * Такой сбой отличается от прочих тем, что чинить его автору нечем: повтор
 * упрётся в то же самое. Единственное осмысленное, что мы можем показать, —
 * объяснить причину и предложить поддержать портал, поэтому код ошибки
 * приходится разбирать, а не просто писать «не получилось».
 *
 * Источников два. Свой дневной потолок расхода даёт `daily_budget_exceeded_*`
 * — это не отказ, задача остаётся в очереди и уйдёт после полуночи. Провайдер
 * отвечает по-разному («Exhausted balance», 402, `insufficient_quota`), и
 * текст ответа кладётся в код ошибки как есть, поэтому ищем по подстрокам.
 */

/** Наш дневной потолок: задача не потеряна, она ждёт следующего дня. */
export const BUDGET_CODE_PREFIX = 'daily_budget_exceeded';

/**
 * Куски ответов провайдеров про деньги. Список закрытый и проверяется на
 * приведённой к нижнему регистру строке.
 */
const PROVIDER_MARKERS = [
  'exhausted balance',
  'insufficient',
  'balance_exhausted',
  'out of credit',
  'payment required',
  'quota exceeded',
  'billing',
  ' 402',
  'error 402',
];

/** Наш ли это потолок: у такого сбоя задача остаётся в очереди. */
export function isDailyBudgetCode(code: string | null | undefined): boolean {
  return Boolean(code?.startsWith(BUDGET_CODE_PREFIX));
}

/** Сбой из-за денег — нашего потолка или пустого счёта у провайдера. */
export function isOutOfFundsCode(code: string | null | undefined): boolean {
  if (!code) return false;
  if (isDailyBudgetCode(code)) return true;
  const normalized = code.toLowerCase();
  return PROVIDER_MARKERS.some((marker) => normalized.includes(marker));
}

/**
 * Что сказать автору. Формулировки разные: наш потолок — это «сегодня уже
 * всё», пустой счёт — «пока не пополним». Обещать в первом случае «завтра
 * продолжим» можно, во втором — нельзя.
 */
export function fundingMessage(code: string | null | undefined): string | null {
  if (!isOutOfFundsCode(code)) return null;
  return isDailyBudgetCode(code)
    ? 'На сегодня дневной запас на генерацию исчерпан. Ролик остался в очереди и соберётся, когда запас обновится. Если хотите ускорить — поддержите портал: генерация оплачивается из пожертвований.'
    : 'Закончились средства на генерацию, и собрать ролик сейчас нечем. Мы пополним счёт, как только сможем. Генерация оплачивается из пожертвований — любая поддержка приближает этот момент.';
}
