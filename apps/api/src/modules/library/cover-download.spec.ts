import { coverDisposition, coverFileName } from './cover-download';

const KEY = 'library/previews/entry-1-1a2b3c4d.webp';

describe('coverFileName (VED-138)', () => {
  it('называет файл заголовком материала, расширение — по ключу', () => {
    expect(coverFileName('Нрисимха-чатурдаши', KEY)).toBe(
      'Нрисимха-чатурдаши.webp',
    );
  });

  it('точки внутри заголовка не принимает за расширение', () => {
    expect(coverFileName('БГ. 9.10 Почему мы показываем почтение', KEY)).toBe(
      'БГ. 9.10 Почему мы показываем почтение.webp',
    );
  });

  it('убирает разделители пути, кавычки и управляющие символы', () => {
    expect(coverFileName('a/b\\c: "d"\t<e>|f?*', KEY)).toBe('a b c d e f.webp');
  });

  it('срезает точку в конце заголовка', () => {
    expect(coverFileName('Нрисимха-чатурдаши.', KEY)).toBe(
      'Нрисимха-чатурдаши.webp',
    );
  });

  it('без заголовка — нейтральное имя', () => {
    expect(coverFileName(null, KEY)).toBe('cover.webp');
    expect(coverFileName(' / ', KEY)).toBe('cover.webp');
  });

  it('обрезает слишком длинный заголовок', () => {
    const name = coverFileName('я'.repeat(500), KEY);
    expect(Array.from(name)).toHaveLength(100 + '.webp'.length);
  });

  it('ключ без расширения даёт webp — так лежат все копии обложек', () => {
    expect(coverFileName('Катха', 'library/previews/x')).toBe('Катха.webp');
  });
});

describe('coverDisposition', () => {
  it('всегда файлом, с именем в UTF-8 и ASCII-заменой', () => {
    const header = coverDisposition('Катха', KEY);
    expect(header).toMatch(/^attachment; filename="_____\.webp"; /);
    expect(header).toContain(
      `filename*=UTF-8''${encodeURIComponent('Катха.webp')}`,
    );
  });
});
