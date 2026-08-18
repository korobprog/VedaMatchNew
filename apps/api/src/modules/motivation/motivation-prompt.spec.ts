import { DEFAULT_MOTIVATION_VIDEO_PROMPT } from '@vedamatch/shared';
import {
  MAX_PROMPT_LENGTH,
  isPromptTooLong,
  normalizeEditedPrompt,
  resolveVideoPrompt,
  shouldKeepEditedImagePrompt,
} from './motivation-prompt';

describe('normalizeEditedPrompt', () => {
  it('срезает пробелы по краям, но не трогает абзацы внутри', () => {
    // Промпт иллюстрации собирается абзацами; склейка сломала бы читаемость.
    expect(normalizeEditedPrompt('  первая строка\n\nвторая  ')).toBe(
      'первая строка\n\nвторая',
    );
  });

  it('пустое и пробельное считает отсутствием текста', () => {
    expect(normalizeEditedPrompt('   \n ')).toBeNull();
    expect(normalizeEditedPrompt('')).toBeNull();
    expect(normalizeEditedPrompt(null)).toBeNull();
    expect(normalizeEditedPrompt(undefined)).toBeNull();
  });
});

describe('isPromptTooLong', () => {
  it('пропускает промпт по границе и отбивает следующий символ', () => {
    // Модель обрежет длинный вход молча и в непредсказуемом месте — отказ
    // должен случиться там, где человек ещё видит свой текст.
    expect(isPromptTooLong('т'.repeat(MAX_PROMPT_LENGTH))).toBe(false);
    expect(isPromptTooLong('т'.repeat(MAX_PROMPT_LENGTH + 1))).toBe(true);
  });
});

describe('resolveVideoPrompt', () => {
  it('отдаёт сохранённое описание движения', () => {
    expect(resolveVideoPrompt('  Slow drifting mist over the river.  ')).toBe(
      'Slow drifting mist over the river.',
    );
  });

  it('на пустом поле подставляет дефолт, а не пустую строку', () => {
    // Провайдер выставляет счёт и за запрос, который сам же не смог разобрать.
    expect(resolveVideoPrompt(null)).toBe(DEFAULT_MOTIVATION_VIDEO_PROMPT);
    expect(resolveVideoPrompt('   ')).toBe(DEFAULT_MOTIVATION_VIDEO_PROMPT);
  });

  it('дефолт описывает движение при почти неподвижной камере', () => {
    // Смысл поля: видеомодели нужно сказать, что движется, а не как выглядит
    // сцена. Формулировка без движения вернула бы застывший кадр.
    expect(DEFAULT_MOTIVATION_VIDEO_PROMPT).toMatch(/motion/i);
    expect(DEFAULT_MOTIVATION_VIDEO_PROMPT).toMatch(/camera almost still/i);
  });
});

describe('shouldKeepEditedImagePrompt', () => {
  const editedAt = new Date('2026-08-18T10:00:00.000Z');

  it('нетронутый черновик пересобирает', () => {
    expect(
      shouldKeepEditedImagePrompt({
        editedAt: null,
        currentStyle: 'warm_documentary',
        requestedStyle: 'warm_documentary',
      }),
    ).toBe(false);
  });

  it('правку человека при том же стиле сохраняет', () => {
    // Иначе редактирование было бы бессмысленным: следующая же перегенерация
    // вернула бы автосборку.
    expect(
      shouldKeepEditedImagePrompt({
        editedAt,
        currentStyle: 'warm_documentary',
        requestedStyle: 'warm_documentary',
      }),
    ).toBe(true);
  });

  it('стиль «автоматически» правку тоже сохраняет', () => {
    // Пустой селект означает «оставить как есть», а не «пересобрать заново».
    expect(
      shouldKeepEditedImagePrompt({
        editedAt,
        currentStyle: 'warm_documentary',
        requestedStyle: undefined,
      }),
    ).toBe(true);
  });

  it('смена стиля пересобирает черновик даже поверх правки', () => {
    // Стиль вшит в текст: сохранив старый, кнопка вернула бы ту же картинку.
    expect(
      shouldKeepEditedImagePrompt({
        editedAt,
        currentStyle: 'warm_documentary',
        requestedStyle: 'indian_miniature',
      }),
    ).toBe(false);
  });
});
