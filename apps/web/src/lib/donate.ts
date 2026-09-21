/**
 * Чистая логика раздела «Поддержать»: строка назначения платежа (VED-11).
 * Данные — в `donate-content.ts`, разметка — в `components/donate/*`.
 *
 * Разбора банковских реквизитов и раскладки расходов по долям здесь больше
 * нет: по VED-12 заказчик убрал со страницы и каркас счетов, и суммы статей,
 * так что делить стало нечего.
 */

/**
 * Сколько знаков оставляем в назначении платежа. Российские банки режут поле
 * по-разному (у кого 160, у кого 210 символов), и обрезанная на полуслове
 * строка в выписке хуже короткой: по ней уже не понять цель.
 */
export const MAX_TRANSFER_PURPOSE = 140;

/** Что человек выбрал в форме назначения. */
export interface TransferPurposeInput {
  /** Цель перевода из `DONATE_PURPOSES`. */
  purposeLabel: string;
  /** Как подписаться — необязательно. */
  donorName?: string | null;
}

/**
 * Строка для поля «назначение платежа».
 *
 * Собирается из цели и подписи: «Дар на развитие портала. От: Кришна дас».
 * Смысл карточки VED-11 ровно в этом — без подписанной цели перевод в выписке
 * выглядит как безымянное поступление, и мы не знаем ни на что его тратить,
 * ни кого благодарить.
 *
 * Правила: лишние пробелы и переводы строк схлопываются (банк однострочное
 * поле переносами всё равно испортит), кавычки и символы, на которых
 * интернет-банки ругаются, вычищаются, длина ограничена по слову.
 */
export function buildTransferPurpose({
  purposeLabel,
  donorName,
}: TransferPurposeInput): string {
  const purpose = cleanPurposePart(purposeLabel);
  const name = cleanPurposePart(donorName ?? "");
  const head = purpose ? `Дар ${lowerFirst(purpose)}` : "Дар на развитие VedaMatch";
  const full = name ? `${head}. От: ${name}` : head;
  return clampByWord(full, MAX_TRANSFER_PURPOSE);
}

/**
 * Убираем то, на чём спотыкаются платёжки: переводы строк, двойные пробелы,
 * кавычки и служебные знаки. Буквы, цифры, пробел и простая пунктуация —
 * остаются.
 */
function cleanPurposePart(value: string): string {
  return value
    .replace(/[«»"'`<>|\\/*#№;]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** «На развитие портала» → «на развитие портала»: середина фразы, не начало. */
function lowerFirst(value: string): string {
  return value.charAt(0).toLocaleLowerCase("ru-RU") + value.slice(1);
}

/** Обрезка по границе слова: половина слова в выписке читается как опечатка. */
function clampByWord(value: string, limit: number): string {
  if (value.length <= limit) return value;
  const cut = value.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > limit / 2 ? cut.slice(0, lastSpace) : cut).trimEnd();
}
