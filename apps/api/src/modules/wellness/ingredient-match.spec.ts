import { parseComposition } from './ingredient-parse';
import {
  matchIngredients,
  type WellnessIngredientEntry,
} from './ingredient-match';

const entries: WellnessIngredientEntry[] = [
  {
    key: 'onion',
    aliases: ['лук', 'лук репчатый', 'луковый порошок', 'onion'],
    class: 'onion',
    severity: 'contains',
  },
  {
    key: 'gelatin',
    aliases: ['желатин', 'gelatin', 'e441'],
    class: 'gelatin',
    severity: 'contains',
  },
  {
    key: 'e120',
    aliases: ['кармин', 'кошениль', 'e120'],
    class: 'additive',
    severity: 'contains',
  },
  {
    key: 'natural-flavor',
    aliases: ['ароматизатор натуральный', 'натуральный ароматизатор'],
    class: 'other',
    severity: 'hidden',
  },
];

const match = (raw: string) => matchIngredients(parseComposition(raw), entries);

describe('matchIngredients', () => {
  it('находит ингредиент по алиасу с этикетки', () => {
    const { matches } = match('Состав: сахар, желатин');
    expect(matches).toHaveLength(1);
    expect(matches[0].entry.key).toBe('gelatin');
    expect(matches[0].matchedText).toBe('желатин');
  });

  it('находит по E-номеру', () => {
    const { matches } = match('краситель (E120)');
    expect(matches[0].entry.key).toBe('e120');
  });

  it('не срабатывает на слове внутри другого слова', () => {
    const { matches, unrecognized } = match('клубника, лукум');
    expect(matches).toEqual([]);
    expect(unrecognized).toEqual(['клубника', 'лукум']);
  });

  it('видит лук в составном названии', () => {
    const { matches } = match('лук репчатый сушёный');
    expect(matches[0].entry.key).toBe('onion');
  });

  it('смягчает тяжесть для позиций из «может содержать»', () => {
    const { matches } = match('сахар. Может содержать желатин');
    const gelatin = matches.find((m) => m.entry.key === 'gelatin');
    expect(gelatin?.severity).toBe('mayContain');
  });

  it('копит непонятое — из него берётся вердикт «неизвестно»', () => {
    const { unrecognized } = match(
      'сахар, загуститель камедь рожкового дерева',
    );
    expect(unrecognized).toContain('загуститель камедь рожкового дерева');
  });

  it('не дублирует одну запись справочника', () => {
    const { matches } = match('желатин, желатин пищевой');
    expect(matches).toHaveLength(1);
  });

  it('предпочитает длинный алиас короткому', () => {
    const { matches } = match('ароматизатор натуральный');
    expect(matches[0].entry.key).toBe('natural-flavor');
  });

  it('словоформу без алиаса не угадывает, а честно кладёт в непонятое', () => {
    const { matches, unrecognized } = match('сахар, желатина');
    expect(matches).toEqual([]);
    expect(unrecognized).toEqual(['сахар', 'желатина']);
  });
});

describe('E-номера с кириллической «Е»', () => {
  it('находит добавку, записанную русской буквой внутри позиции', () => {
    const { matches } = match('краситель Е120, вода');
    expect(matches[0].entry.key).toBe('e120');
    expect(matches[0].matchedText).toBe('краситель Е120');
  });
});
