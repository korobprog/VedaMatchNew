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

/**
 * Запасная формулировка на случай пустой цели. В форме цель всегда выбрана,
 * но пустое назначение — ровно то безымянное поступление, от которого эта
 * форма и спасает, так что подставляем цель по умолчанию.
 */
const FALLBACK_TRANSFER_PURPOSE =
  "Дар на разработку и поддержку Портала VedaMatch";

/** Что человек выбрал в форме назначения. */
export interface TransferPurposeInput {
  /**
   * Готовая формулировка цели — поле `transfer` выбранного пункта
   * `DONATE_PURPOSES`, целиком и как есть. «Дар» к ней больше не
   * приклеивается: склейка ломалась о падежи, и «Благодарность
   * разработчикам» превращалась в «Дар на благодарность разработчикам».
   */
  purposeText: string;
  /** Полное ФИО — необязательно. */
  donorName?: string | null;
  /**
   * Духовное имя, если есть (VED-12, текст заказчика от 21.09: «полное ФИО,
   * а также духовное имя, если имеется»). Встаёт в скобках после ФИО, а без
   * ФИО — само по себе.
   */
  spiritualName?: string | null;
}

/**
 * Строка для поля «назначение платежа».
 *
 * Собирается из цели и подписи: «Дар на разработку и поддержку Портала
 * VedaMatch. От: Иванов Иван Иванович (Кришна дас)». Смысл карточки VED-11 ровно в этом — без
 * подписанной цели перевод в выписке выглядит как безымянное поступление, и
 * мы не знаем ни на что его тратить, ни кого благодарить.
 *
 * Правила: лишние пробелы и переводы строк схлопываются (банк однострочное
 * поле переносами всё равно испортит), кавычки и символы, на которых
 * интернет-банки ругаются, вычищаются, длина ограничена по слову.
 */
export function buildTransferPurpose({
  purposeText,
  donorName,
  spiritualName,
}: TransferPurposeInput): string {
  const head = cleanPurposePart(purposeText) || FALLBACK_TRANSFER_PURPOSE;
  const name = signature(
    cleanPurposePart(donorName ?? ""),
    cleanPurposePart(spiritualName ?? ""),
  );
  const full = name ? `${head}. От: ${name}` : head;
  return clampByWord(full, MAX_TRANSFER_PURPOSE);
}

/** «ФИО (духовное имя)», либо то из двух, что заполнено. */
function signature(fullName: string, spiritualName: string): string {
  if (fullName && spiritualName) return `${fullName} (${spiritualName})`;
  return fullName || spiritualName;
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

/** Обрезка по границе слова: половина слова в выписке читается как опечатка. */
function clampByWord(value: string, limit: number): string {
  if (value.length <= limit) return value;
  const cut = value.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > limit / 2 ? cut.slice(0, lastSpace) : cut).trimEnd();
}
