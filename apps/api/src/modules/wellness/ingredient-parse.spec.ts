import { normalizeENumbers, parseComposition } from './ingredient-parse';

const texts = (input: string) => parseComposition(input).map((t) => t.text);

describe('parseComposition', () => {
  it('снимает «Состав:» в начале', () => {
    expect(texts('Состав: сахар, соль')).toEqual(['сахар', 'соль']);
  });

  it('раскрывает скобки в отдельные позиции', () => {
    expect(texts('масло растительное (пальмовое), соль')).toEqual([
      'масло растительное',
      'пальмовое',
      'соль',
    ]);
  });

  it('выбрасывает проценты и массу, оставляя название', () => {
    expect(texts('мука пшеничная 62 %, сахар 15,5 г')).toEqual([
      'мука пшеничная',
      'сахар',
    ]);
  });

  it('помечает следами всё после «может содержать»', () => {
    const tokens = parseComposition(
      'сахар, соль. Может содержать следы орехов',
    );
    expect(tokens.map((t) => [t.text, t.mayContain])).toEqual([
      ['сахар', false],
      ['соль', false],
      ['орехов', true],
    ]);
  });

  it('понимает английскую оговорку о следах', () => {
    const tokens = parseComposition('sugar, salt. May contain milk');
    expect(tokens.at(-1)).toMatchObject({ text: 'milk', mayContain: true });
  });

  it('приводит ё к е, чтобы совпадало со справочником', () => {
    expect(texts('свёкла, мёд')).toEqual(['свекла', 'мед']);
  });

  it('делит перечисление через «и»', () => {
    expect(texts('соль и сахар')).toEqual(['соль', 'сахар']);
  });

  it('сохраняет напечатанный кусок для показа человеку', () => {
    const [token] = parseComposition('Состав: Мука Пшеничная Высшего Сорта');
    expect(token.raw).toBe('Мука Пшеничная Высшего Сорта');
    expect(token.text).toBe('мука пшеничная высшего сорта');
  });

  it('не выдаёт мусорных позиций на пустой и числовой строке', () => {
    expect(parseComposition('')).toEqual([]);
    expect(parseComposition('12, 3.5, ---')).toEqual([]);
  });
});

describe('normalizeENumbers', () => {
  it('приводит кириллическую «Е» в номере добавки к латинской', () => {
    // Позиция остаётся одной: номер ищется целым словом уже внутри неё.
    expect(texts('краситель Е120')).toEqual(['краситель e120']);
  });

  it('склеивает номер, записанный через пробел и дефис', () => {
    expect(texts('эмульгатор Е 471, стабилизатор E-472')).toEqual([
      'эмульгатор e471',
      'стабилизатор e472',
    ]);
  });

  it('работает и на голой строке, вне разбора состава', () => {
    expect(normalizeENumbers('Е 621')).toBe('e621');
  });

  it('переводит и буквенный хвост номера', () => {
    expect(texts('Е472е')).toEqual(['e472e']);
  });

  it('не трогает обычные слова, начинающиеся на «е»', () => {
    expect(texts('ежевика, ель')).toEqual(['ежевика', 'ель']);
  });
});
