import {
  InvalidHomeButtonError,
  parseHomeCategorySlug,
  parseHomeSourceWork,
} from './home-buttons';

describe('parseHomeSourceWork', () => {
  it('не присланное поле не меняет настройку', () => {
    expect(parseHomeSourceWork(undefined)).toBeUndefined();
  });

  it('null и пустая строка — снова умолчание', () => {
    expect(parseHomeSourceWork(null)).toBeNull();
    expect(parseHomeSourceWork('   ')).toBeNull();
  });

  it('сжимает пробелы по краям и внутри', () => {
    expect(parseHomeSourceWork('  Шримад-Бхагаватам \n ')).toBe(
      'Шримад-Бхагаватам',
    );
    expect(parseHomeSourceWork('Нектар   преданности')).toBe(
      'Нектар преданности',
    );
  });

  it('отказывает не-строке и слишком длинной строке', () => {
    expect(() => parseHomeSourceWork(42)).toThrow(InvalidHomeButtonError);
    expect(() => parseHomeSourceWork('а'.repeat(201))).toThrow(
      InvalidHomeButtonError,
    );
  });
});

describe('parseHomeCategorySlug', () => {
  it('не присланное поле не меняет настройку', () => {
    expect(parseHomeCategorySlug(undefined)).toBeUndefined();
  });

  it('null и пустая строка — снова умолчание', () => {
    expect(parseHomeCategorySlug(null)).toBeNull();
    expect(parseHomeCategorySlug('')).toBeNull();
  });

  it('принимает слаг, как его выдаёт редакция', () => {
    expect(parseHomeCategorySlug('filosofiya-2')).toBe('filosofiya-2');
    expect(parseHomeCategorySlug(' vedy ')).toBe('vedy');
  });

  it('отказывает названию вместо слага и мусору', () => {
    for (const bad of ['Мудрость мира', 'a b', 'a/b', '../x', {}]) {
      expect(() => parseHomeCategorySlug(bad)).toThrow(InvalidHomeButtonError);
    }
    expect(() => parseHomeCategorySlug('a'.repeat(121))).toThrow(
      InvalidHomeButtonError,
    );
  });
});
