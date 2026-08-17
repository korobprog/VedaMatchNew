import {
  buildCommunitySlug,
  duplicateKey,
  isReservedCommunitySlug,
  withSlugSuffix,
} from './community-slug';

describe('buildCommunitySlug', () => {
  it('транслитерирует кириллицу', () => {
    expect(buildCommunitySlug('Московская ятра')).toBe('moskovskaya-yatra');
    expect(buildCommunitySlug('Нама-хатта Щёлково')).toBe(
      'nama-hatta-schelkovo',
    );
  });

  it('схлопывает пробелы и дефисы, обрезает края', () => {
    expect(buildCommunitySlug('  Храм   —  Хорошёвка  ')).toBe(
      'hram-horoshevka',
    );
  });

  it('не отдаёт пустой слаг', () => {
    // Название из одних эмодзи даёт пустую латиницу; адрес всё равно нужен.
    expect(buildCommunitySlug('🙏🌸')).toBe('community');
  });
});

describe('isReservedCommunitySlug', () => {
  it('бережёт маршруты справочника', () => {
    // Община со слагом `new` перехватила бы /communities/new.
    expect(isReservedCommunitySlug('new')).toBe(true);
    expect(isReservedCommunitySlug('map')).toBe(true);
    expect(isReservedCommunitySlug('moskovskaya-yatra')).toBe(false);
  });
});

describe('withSlugSuffix', () => {
  it('первая попытка идёт без суффикса', () => {
    expect(withSlugSuffix('yatra', 0)).toBe('yatra');
    expect(withSlugSuffix('yatra', 1)).toBe('yatra-2');
    expect(withSlugSuffix('yatra', 2)).toBe('yatra-3');
  });
});

describe('duplicateKey', () => {
  it('склеивает варианты названия одной общины', () => {
    const expected = duplicateKey('Москва', 'Москва');
    expect(duplicateKey('Московская ятра', 'Москва')).not.toBe(expected);
    // Ключ ловит именно шумовые слова и регистр, а не словоформы.
    expect(duplicateKey('ятра г. Москва', 'Москва')).toBe(
      duplicateKey('Ятра   МОСКВА', 'москва'),
    );
    expect(duplicateKey('Община Москва', 'Москва')).toBe(
      duplicateKey('москва', 'Москва'),
    );
  });

  it('разводит одноимённые общины в разных городах', () => {
    expect(duplicateKey('Нама-хатта', 'Минск')).not.toBe(
      duplicateKey('Нама-хатта', 'Москва'),
    );
  });

  it('не путает ё и е', () => {
    expect(duplicateKey('Щёлково', 'Щёлково')).toBe(
      duplicateKey('Щелково', 'Щелково'),
    );
  });

  it('переживает пустой город', () => {
    expect(duplicateKey('Онлайн-клуб', null)).toBe(
      duplicateKey('онлайн клуб', ''),
    );
  });
});
