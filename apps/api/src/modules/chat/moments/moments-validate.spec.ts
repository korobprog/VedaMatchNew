import { CHAT_MOMENT_MAX_PER_DAY } from '@vedamatch/shared';
import {
  MomentValidationError,
  assertUnderDailyLimit,
  backgroundIndex,
  normalizeCaption,
  normalizePublish,
  remainingToday,
} from './moments-validate';

describe('подпись момента', () => {
  it('схлопывает переводы строк, а не отказывает за них', () => {
    expect(normalizeCaption('Харе\n\nКришна')).toBe('Харе Кришна');
  });

  it('считает длину после схлопывания', () => {
    const spaces = `а${' '.repeat(400)}б`;
    expect(normalizeCaption(spaces)).toBe('а б');
  });

  it('слишком длинную отбивает', () => {
    expect(() => normalizeCaption('я'.repeat(281))).toThrow(
      MomentValidationError,
    );
  });

  it('пустое остаётся пустым, а не превращается в пробел', () => {
    expect(normalizeCaption(undefined)).toBe('');
    expect(normalizeCaption('   ')).toBe('');
  });
});

describe('публикация', () => {
  it('фотография обязана нести ссылку', () => {
    expect(() => normalizePublish({ kind: 'photo' }, true)).toThrow(
      MomentValidationError,
    );
  });

  it('записка обязана нести текст', () => {
    expect(() => normalizePublish({ kind: 'text', caption: '  ' }, true)).toThrow(
      MomentValidationError,
    );
  });

  it('у фотографии подложки не бывает, у записки — не бывает размеров', () => {
    const photo = normalizePublish(
      { kind: 'photo', url: 'https://s3/chat/moments/u1/a.webp', width: 1080, height: 1920, background: 3 },
      true,
    );
    expect(photo.background).toBeNull();
    expect(photo.width).toBe(1080);

    const text = normalizePublish({ kind: 'text', caption: 'Ом', background: 3 }, true);
    expect(text.background).toBe(3);
    expect(text.width).toBeNull();
    expect(text.url).toBeNull();
  });

  it('недоступная аудитория тихо понижается до собеседников, а не роняет публикацию', () => {
    const moment = normalizePublish(
      { kind: 'text', caption: 'Ом', audience: 'everyone' },
      false,
    );
    expect(moment.audience).toBe('contacts');
  });

  it('доступная аудитория сохраняется', () => {
    expect(
      normalizePublish({ kind: 'text', caption: 'Ом', audience: 'everyone' }, true)
        .audience,
    ).toBe('everyone');
  });

  it('умолчание аудитории закрытое', () => {
    expect(normalizePublish({ kind: 'text', caption: 'Ом' }, true).audience).toBe(
      'contacts',
    );
  });
});

describe('подложка', () => {
  it('значение вне списка сводится к первой, а не роняет публикацию', () => {
    expect(backgroundIndex(999)).toBe(0);
    expect(backgroundIndex(-1)).toBe(0);
    expect(backgroundIndex(1.5)).toBe(0);
    expect(backgroundIndex(undefined)).toBe(0);
  });

  it('значение из списка сохраняется', () => {
    expect(backgroundIndex(2)).toBe(2);
  });
});

describe('суточный лимит', () => {
  it('считает остаток и не уходит в минус', () => {
    expect(remainingToday(0)).toBe(CHAT_MOMENT_MAX_PER_DAY);
    expect(remainingToday(CHAT_MOMENT_MAX_PER_DAY + 5)).toBe(0);
  });

  it('выбранный лимит закрывает публикацию', () => {
    expect(() => assertUnderDailyLimit(CHAT_MOMENT_MAX_PER_DAY)).toThrow(
      MomentValidationError,
    );
    expect(() => assertUnderDailyLimit(CHAT_MOMENT_MAX_PER_DAY - 1)).not.toThrow();
  });
});
