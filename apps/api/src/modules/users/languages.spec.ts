import { normalizeLanguages } from './languages';

describe('normalizeLanguages', () => {
  it('чистит пробелы и выбрасывает пустое', () => {
    expect(normalizeLanguages([' русский ', '', '   ', 'хинди'])).toEqual([
      'русский',
      'хинди',
    ]);
  });

  it('повтор в другом регистре — тот же язык', () => {
    // Переносом из двух анкет пришло и «Русский», и «русский».
    expect(normalizeLanguages(['Русский', 'русский'])).toEqual(['Русский']);
  });

  it('не пускает больше предела', () => {
    const many = Array.from({ length: 15 }, (_, i) => `язык-${i}`);
    expect(normalizeLanguages(many)).toHaveLength(10);
  });

  it('не спотыкается о чужой тип', () => {
    expect(normalizeLanguages(undefined)).toEqual([]);
    expect(normalizeLanguages('русский')).toEqual([]);
    expect(normalizeLanguages([1, null, 'русский'])).toEqual(['русский']);
  });
});
