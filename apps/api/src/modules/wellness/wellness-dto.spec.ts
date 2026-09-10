import {
  parseIngredientInput,
  parseProductInput,
  parseReportComment,
  parseRestrictions,
  parseScanInput,
  WellnessInputError,
} from './wellness-dto';

describe('parseProductInput', () => {
  const valid = {
    barcode: '5901234123457',
    name: 'Печенье овсяное',
    ingredientsRaw: 'мука пшеничная, сахар, желатин',
  };

  it('принимает годную заявку и нормализует штрихкод', () => {
    const parsed = parseProductInput({ ...valid, barcode: '036000291452' });
    expect(parsed.barcode).toBe('0036000291452');
    expect(parsed.brand).toBeNull();
  });

  it('отвергает штрихкод с опечаткой', () => {
    expect(() =>
      parseProductInput({ ...valid, barcode: '5901234123458' }),
    ).toThrow(WellnessInputError);
  });

  it('требует название и состав', () => {
    expect(() => parseProductInput({ ...valid, name: ' ' })).toThrow(
      WellnessInputError,
    );
    expect(() => parseProductInput({ ...valid, ingredientsRaw: '' })).toThrow(
      WellnessInputError,
    );
  });
});

describe('parseRestrictions', () => {
  it('выбрасывает неизвестный класс, а не роняет настройку целиком', () => {
    const parsed = parseRestrictions({
      excluded: ['meat', 'единорог', 'fish'],
      excludedKeys: ['E120', 'e120', ' '],
    });
    expect(parsed.excluded).toEqual(['meat', 'fish']);
    expect(parsed.excludedKeys).toEqual(['e120']);
  });

  it('терпит отсутствие полей', () => {
    expect(parseRestrictions({})).toEqual({ excluded: [], excludedKeys: [] });
  });
});

describe('parseScanInput', () => {
  it('по умолчанию это скан штрихкода', () => {
    const parsed = parseScanInput({ barcode: '5901234123457' });
    expect(parsed.kind).toBe('barcode');
    expect(parsed.barcode).toBe('5901234123457');
  });

  it('без кода это скан по фото и он требует прочитанный состав', () => {
    const parsed = parseScanInput({
      kind: 'photo',
      ingredientsRaw: 'сахар, желатин',
    });
    expect(parsed.kind).toBe('photo');
    expect(parsed.ingredientsRaw).toBe('сахар, желатин');
  });

  it('пустой снимок не превращается в «чисто»', () => {
    expect(() => parseScanInput({ kind: 'photo' })).toThrow(WellnessInputError);
  });

  it('скан штрихкода без кода отвергается', () => {
    expect(() => parseScanInput({ kind: 'barcode' })).toThrow(
      WellnessInputError,
    );
  });
});

describe('parseReportComment', () => {
  it('требует внятную жалобу', () => {
    expect(() => parseReportComment('ой')).toThrow(WellnessInputError);
    expect(parseReportComment('  Нет желатина в  составе ')).toBe(
      'Нет желатина в составе',
    );
  });
});

describe('parseIngredientInput', () => {
  const valid = { key: 'gelatin', nameRu: 'Желатин', class: 'gelatin' };

  it('приводит алиасы к виду, в котором их ищет разбор', () => {
    const parsed = parseIngredientInput({
      ...valid,
      aliases: ['Желатин Пищевой', 'ЖЁЛТЫЙ', 'желатин пищевой'],
    });
    expect(parsed.aliases).toEqual(['желатин пищевой', 'желтый']);
  });

  it('подставляет русское название вместо пустого английского', () => {
    expect(parseIngredientInput(valid).nameEn).toBe('Желатин');
  });

  it('не пропускает выдуманный класс', () => {
    expect(() => parseIngredientInput({ ...valid, class: 'единорог' })).toThrow(
      WellnessInputError,
    );
  });

  it('по умолчанию ингредиент назван прямо', () => {
    expect(parseIngredientInput(valid).severity).toBe('contains');
  });
});
