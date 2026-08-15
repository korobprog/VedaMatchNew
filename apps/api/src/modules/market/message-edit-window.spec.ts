import {
  MAX_MESSAGE_LENGTH,
  MESSAGE_EDIT_WINDOW_MS,
  isWithinEditWindow,
  validateMessageBody,
} from './message-edit-window';

const sent = new Date('2026-08-15T10:00:00.000Z');
const after = (ms: number) => new Date(sent.getTime() + ms);

describe('isWithinEditWindow', () => {
  it('allows an edit right away', () => {
    expect(isWithinEditWindow(sent, sent)).toBe(true);
  });

  it('allows an edit inside the window', () => {
    expect(isWithinEditWindow(sent, after(60_000))).toBe(true);
    expect(isWithinEditWindow(sent, after(MESSAGE_EDIT_WINDOW_MS - 1))).toBe(true);
  });

  // Граница включительна: ровно пятнадцатая минута ещё считается своей.
  it('allows an edit exactly at the boundary', () => {
    expect(isWithinEditWindow(sent, after(MESSAGE_EDIT_WINDOW_MS))).toBe(true);
  });

  it('refuses one millisecond past the boundary', () => {
    expect(isWithinEditWindow(sent, after(MESSAGE_EDIT_WINDOW_MS + 1))).toBe(false);
  });

  it('refuses long after the fact', () => {
    expect(isWithinEditWindow(sent, after(24 * 60 * 60 * 1000))).toBe(false);
  });

  // createdAt проставляет Postgres, а now берёт приложение: на разных хостах
  // часы расходятся на секунды, и без допуска только что отправленное
  // сообщение было бы нередактируемым.
  it('tolerates a small clock skew', () => {
    expect(isWithinEditWindow(sent, after(-1))).toBe(true);
    expect(isWithinEditWindow(sent, after(-30_000))).toBe(true);
    expect(isWithinEditWindow(sent, after(-60_000))).toBe(true);
  });

  // Заметно вперёд — это уже не дрейф, а подделка: иначе окно растягивается
  // навсегда.
  it('refuses a date far in the future', () => {
    expect(isWithinEditWindow(sent, after(-60_001))).toBe(false);
    expect(isWithinEditWindow(sent, after(-3_600_000))).toBe(false);
  });

  it('keeps the window at fifteen minutes', () => {
    expect(MESSAGE_EDIT_WINDOW_MS).toBe(900_000);
  });
});

describe('validateMessageBody', () => {
  it('accepts ordinary text', () => {
    expect(validateMessageBody('Здравствуйте! Ещё в наличии?')).toBeNull();
  });

  it('rejects empty and whitespace-only bodies', () => {
    expect(validateMessageBody('')).toBe('message_required');
    expect(validateMessageBody('   ')).toBe('message_required');
    expect(validateMessageBody('\n\t ')).toBe('message_required');
  });

  it('rejects non-strings', () => {
    expect(validateMessageBody(undefined)).toBe('message_required');
    expect(validateMessageBody(null)).toBe('message_required');
    expect(validateMessageBody(42)).toBe('message_required');
    expect(validateMessageBody({})).toBe('message_required');
  });

  it('caps the length at the boundary', () => {
    expect(validateMessageBody('a'.repeat(MAX_MESSAGE_LENGTH))).toBeNull();
    expect(validateMessageBody('a'.repeat(MAX_MESSAGE_LENGTH + 1))).toBe(
      'message_too_long',
    );
  });

  // Длину считаем по обрезанному тексту: две тысячи пробелов вокруг «ок»
  // это короткое сообщение, а не превышение.
  it('measures the trimmed body', () => {
    const padded = `  ${'a'.repeat(MAX_MESSAGE_LENGTH)}  `;
    expect(validateMessageBody(padded)).toBeNull();
  });
});
