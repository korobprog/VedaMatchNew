import type {
  WellnessIngredientSeverity,
  WellnessScanResult,
  WellnessVerdict,
  WellnessVerdictReason,
} from '@vedamatch/shared';
import type { AimTone } from './aim-state';

/**
 * Ответ сканера словами (VED-335).
 *
 * Сервер присылает вердикт и причины, формулировку собирает приложение — то
 * же правило, что у шины событий портала: издатель сообщает факт, подписчик
 * говорит человеку. Поэтому тексты живут здесь, а не в API, и проверяются
 * тестом, а не чтением экрана.
 *
 * Четыре исхода, а не три: `unknown` — полноправный ответ. «Не знаем» рядом
 * с «подходит» выглядит слабее, но это единственная честная реплика, когда
 * состав разобран не до конца, и молчать вместо неё нельзя.
 */

export interface VerdictCopy {
  /** Крупное слово ответа. */
  title: string;
  /** Одна строка под ним: что это значит. */
  summary: string;
  tone: VerdictTone;
}

/** `neutral` — «не знаем»: это не предупреждение и не разрешение. */
export type VerdictTone = AimTone | 'neutral';

const COPY: Record<WellnessVerdict, VerdictCopy> = {
  clean: {
    title: 'Подходит',
    summary: 'В составе нет того, что вы исключили.',
    tone: 'success',
  },
  warning: {
    title: 'Сомнительно',
    summary: 'В составе есть спорное — решайте сами, ниже написано что.',
    tone: 'warning',
  },
  forbidden: {
    title: 'Не подходит',
    summary: 'В составе прямо названо то, что вы исключили.',
    tone: 'danger',
  },
  unknown: {
    title: 'Не знаем',
    summary: 'Состав разобран не до конца — назвать продукт чистым нельзя.',
    tone: 'neutral',
  },
};

export function describeVerdict(verdict: WellnessVerdict): VerdictCopy {
  return COPY[verdict];
}

/** Короткое слово для строки истории: там места на целую фразу нет. */
export function verdictWord(verdict: WellnessVerdict): string {
  return COPY[verdict].title;
}

export function verdictTone(verdict: WellnessVerdict): VerdictTone {
  return COPY[verdict].tone;
}

const SEVERITY: Record<WellnessIngredientSeverity, string> = {
  contains: 'назван в составе',
  mayContain: 'может попасть следами',
  hidden: 'может прятаться за этой строкой',
};

/**
 * Строка причины: что нашли, где и почему это важно. Кусок этикетки —
 * обязательно: без него человек не может нас проверить, а проверять он должен.
 */
export function describeReason(reason: WellnessVerdictReason): string {
  const where = SEVERITY[reason.severity];
  const note = reason.ingredient.note ? ` ${reason.ingredient.note}` : '';
  return `${reason.ingredient.name} — ${where}: «${reason.matchedText}».${note}`;
}

export interface VerdictSection {
  title: string;
  /** Зачем этот раздел вообще показан. */
  hint: string;
  lines: string[];
}

/**
 * Разделы под крупным словом. Пустые не возвращаются: раздел с заголовком и
 * без содержимого — это шум, который учит пролистывать ответ не читая.
 *
 * «Не разобрали» отделено от «прячется за формулировкой» намеренно: путать
 * «не нашли слово в справочнике» и «слово ничего не значит» — врать в обе
 * стороны. То же разделение на сервере (`diet-verdict.ts`).
 */
export function verdictSections(result: WellnessScanResult): VerdictSection[] {
  const sections: VerdictSection[] = [];
  const { reasons, hidden, unrecognized } = result.result;

  if (reasons.length) {
    sections.push({
      title: 'Что смутило',
      hint: 'Эти позиции попали под ваши ограничения.',
      lines: reasons.map(describeReason),
    });
  }
  if (hidden.length) {
    sections.push({
      title: 'Ничего не говорящие строки',
      hint: 'За такой формулировкой может стоять что угодно — состав её не раскрывает.',
      lines: hidden.map(describeReason),
    });
  }
  if (unrecognized.length) {
    sections.push({
      title: 'Не разобрали',
      hint: 'Этих слов нет в справочнике. Мы не гадаем, что за ними.',
      lines: unrecognized,
    });
  }
  return sections;
}

/**
 * Ответ целиком одной фразой — для скринридера и для истории.
 *
 * Скринридер читает карточку сверху вниз и без этой строки объявит «Подходит»
 * раньше, чем человек услышит, о каком продукте речь.
 */
export function verdictAccessibilityLabel(result: WellnessScanResult): string {
  const copy = describeVerdict(result.result.verdict);
  const name = result.product?.name ?? 'Продукт не найден в базе';
  const reasons = result.result.reasons.length
    ? ` Смутило: ${result.result.reasons
        .map((reason) => reason.ingredient.name)
        .join(', ')}.`
    : '';
  return `${name}. ${copy.title}. ${copy.summary}${reasons}`;
}

/**
 * Продукта в базе нет — это не ошибка и не вердикт, а отдельный исход, и
 * говорить о нём надо иначе. `ingredientsRaw` пуст ровно в этом случае
 * (сервер на это опирается), поэтому проверяем его, а не только `product`.
 */
export function isMissingProduct(result: WellnessScanResult): boolean {
  return !result.product && !result.ingredientsRaw;
}

export const MISSING_PRODUCT_COPY = {
  title: 'Товара пока нет в базе',
  summary:
    'Штрихкод прочитан, но состав по нему неизвестен — ни у нас, ни в Open Food Facts. Угадывать не будем.',
  hint: 'Состав можно переснять или вписать на сайте — тогда ответ получит и следующий человек у этой полки.',
} as const;
