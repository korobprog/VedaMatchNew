import { TRAVEL_CASH_KINDS, type TravelCashKind } from '@vedamatch/shared';
import {
  CashInputError,
  MAX_CASH_AMOUNT_MINOR,
  MAX_CASH_NOTE,
  normalizeTags,
} from './cash-input';

export const MAX_TEMPLATE_NAME = 40;
/** Шаблонов у объекта — столько, сколько помещается кнопками в форме. */
export const MAX_TEMPLATES_PER_STAY = 50;

export interface CashTemplateInput {
  name: string;
  kind: TravelCashKind;
  /** null — сумма разная каждый раз, шаблон задаёт только статью и заметку. */
  amountMinor: number | null;
  categoryId: string | null;
  note: string;
  tags: string[];
}

/**
 * Шаблон записи кассы: «Проживание 850», «Стирка», «Интернет 700». Сумма
 * необязательна — у закупки продуктов она каждый раз своя, а статья та же.
 */
export function parseCashTemplateInput(
  body: Record<string, unknown>,
): CashTemplateInput {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) throw new CashInputError('У шаблона должно быть название');
  if (name.length > MAX_TEMPLATE_NAME) {
    throw new CashInputError(
      `Название шаблона длиннее ${MAX_TEMPLATE_NAME} знаков`,
    );
  }

  const kind = body.kind;
  if (
    typeof kind !== 'string' ||
    !(TRAVEL_CASH_KINDS as readonly string[]).includes(kind)
  ) {
    throw new CashInputError('Укажите, доход это или расход');
  }

  let amountMinor: number | null = null;
  if (body.amountMinor !== undefined && body.amountMinor !== null) {
    const value = body.amountMinor;
    if (
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      value <= 0 ||
      value > MAX_CASH_AMOUNT_MINOR
    ) {
      throw new CashInputError('Сумма шаблона — больше нуля или пусто');
    }
    amountMinor = value;
  }

  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (note.length > MAX_CASH_NOTE) {
    throw new CashInputError(`Заметка длиннее ${MAX_CASH_NOTE} знаков`);
  }

  return {
    name,
    kind: kind as TravelCashKind,
    amountMinor,
    categoryId:
      typeof body.categoryId === 'string' && body.categoryId.trim()
        ? body.categoryId.trim()
        : null,
    note,
    tags: normalizeTags(body.tags),
  };
}
