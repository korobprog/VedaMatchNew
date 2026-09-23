import { BLOG_PREVIEW_MAX_CHARS, blogEditedLabel, blogPostDate, buildBlogTextPreview } from './blog-format';

/**
 * Подписи карточки и свёрнутый текст (VED-334). Входы и ожидания — те же,
 * что у сайта (`apps/web/src/components/blog/blog-format.spec.ts`,
 * `blog-text-preview.spec.ts`): одна и та же карточка обязана говорить
 * одно и то же в браузере и в приложении.
 */

const now = new Date(2026, 8, 23, 12, 0);

describe('blogPostDate', () => {
  it('в этом году — день, месяц и время', () => {
    expect(blogPostDate(new Date(2026, 8, 21, 9, 5).toISOString(), now)).toBe('21 сентября, 09:05');
  });

  it('прошлогодний пост — с годом и без времени', () => {
    expect(blogPostDate(new Date(2025, 0, 3, 18, 40).toISOString(), now)).toBe('3 января 2025');
  });

  it('битая дата — пустая строка, а не «NaN undefined»', () => {
    expect(blogPostDate('не дата', now)).toBe('');
  });
});

describe('blogEditedLabel', () => {
  it('не правили — подписи нет', () => {
    expect(blogEditedLabel(null, now.toISOString())).toBeNull();
  });

  it('правили в день публикации — хватает часов', () => {
    const created = new Date(2026, 8, 21, 9, 0).toISOString();
    const edited = new Date(2026, 8, 21, 14, 3).toISOString();
    expect(blogEditedLabel(edited, created)).toBe('изменено в 14:03');
  });

  it('правили в другой день — день и месяц, иначе «14:03» читается как «сегодня»', () => {
    const created = new Date(2026, 8, 20, 9, 0).toISOString();
    const edited = new Date(2026, 8, 22, 14, 3).toISOString();
    expect(blogEditedLabel(edited, created)).toBe('изменено 22 сентября');
  });

  it('битая отметка — подписи нет', () => {
    expect(blogEditedLabel('мусор', now.toISOString())).toBeNull();
  });
});

describe('buildBlogTextPreview', () => {
  it('короткий текст — как есть, и «Далее» не нужна', () => {
    expect(buildBlogTextPreview('Харе Кришна!')).toEqual({ text: 'Харе Кришна!', truncated: false });
  });

  it('пустой текст — пусто', () => {
    expect(buildBlogTextPreview('')).toEqual({ text: '', truncated: false });
  });

  it('три строки остаются целиком', () => {
    const text = ['Первая', 'Вторая', 'Третья'].join('\n');
    expect(buildBlogTextPreview(text)).toEqual({ text, truncated: false });
  });

  it('четвёртая строка уходит под «Далее»', () => {
    expect(buildBlogTextPreview(['Первая', 'Вторая', 'Третья', 'Четвёртая'].join('\n'))).toEqual({
      text: 'Первая\nВторая\nТретья…',
      truncated: true,
    });
  });

  it('хвост из одних пустых строк — не продолжение: кнопка была бы обманом', () => {
    expect(buildBlogTextPreview('Первая\nВторая\nТретья\n\n  \n').truncated).toBe(false);
  });

  it('длинный абзац режется по границе слова и не длиннее предела', () => {
    const preview = buildBlogTextPreview(`${'слово '.repeat(80)}конец`);
    expect(preview.truncated).toBe(true);
    expect(preview.text.length).toBeLessThanOrEqual(BLOG_PREVIEW_MAX_CHARS + 1);
    expect(preview.text.replace(/…$/, '').endsWith('слово')).toBe(true);
  });

  it('одно бесконечное слово режется жёстко, а не до двух слогов', () => {
    const preview = buildBlogTextPreview('а'.repeat(300));
    expect(preview.text).toBe(`${'а'.repeat(BLOG_PREVIEW_MAX_CHARS)}…`);
  });

  it('обрыв на точке — без многоточия, на запятой — запятая убрана', () => {
    expect(buildBlogTextPreview('Одно.\nДва.\nТри.\nЧетыре.').text).toBe('Одно.\nДва.\nТри.');
    expect(buildBlogTextPreview('Одно\nДва\nТри,\nЧетыре').text).toBe('Одно\nДва\nТри…');
  });

  it('переводы строк Windows считаются как обычные', () => {
    expect(buildBlogTextPreview('А\r\nБ\r\nВ\r\nГ')).toEqual({ text: 'А\nБ\nВ…', truncated: true });
  });
});
