import { resolveVerdict, type WellnessDietRestrictions } from './diet-verdict';
import type { WellnessIngredientMatch } from './ingredient-match';

const match = (
  key: string,
  cls: WellnessIngredientMatch['entry']['class'],
  severity: WellnessIngredientMatch['severity'],
  text = key,
): WellnessIngredientMatch => ({
  entry: { key, aliases: [], class: cls, severity },
  matchedText: text,
  severity,
  position: 0,
});

const vegetarian: WellnessDietRestrictions = {
  excluded: ['meat', 'fish', 'gelatin'],
  excludedKeys: [],
};

describe('resolveVerdict', () => {
  it('без ограничений не судит', () => {
    const result = resolveVerdict(
      [match('gelatin', 'gelatin', 'contains')],
      ['загуститель'],
      { excluded: [], excludedKeys: [] },
    );
    expect(result.verdict).toBe('clean');
    expect(result.reasons).toEqual([]);
  });

  it('запрещает при прямом указании запретного', () => {
    const result = resolveVerdict(
      [match('gelatin', 'gelatin', 'contains', 'Желатин')],
      [],
      vegetarian,
    );
    expect(result.verdict).toBe('forbidden');
    expect(result.reasons[0].matchedText).toBe('Желатин');
  });

  it('предупреждает, когда запретное лишь «может содержаться»', () => {
    const result = resolveVerdict(
      [match('fish', 'fish', 'mayContain')],
      [],
      vegetarian,
    );
    expect(result.verdict).toBe('warning');
  });

  it('запрет сильнее предупреждения и непонятого', () => {
    const result = resolveVerdict(
      [match('fish', 'fish', 'mayContain'), match('meat', 'meat', 'contains')],
      ['загуститель'],
      vegetarian,
    );
    expect(result.verdict).toBe('forbidden');
  });

  it('не разобрали состав — говорим «неизвестно», а не «подходит»', () => {
    const result = resolveVerdict([], ['камедь рожкового дерева'], vegetarian);
    expect(result.verdict).toBe('unknown');
    expect(result.unrecognized).toEqual(['камедь рожкового дерева']);
  });

  it('чистый состав при разобранной строке', () => {
    const result = resolveVerdict(
      [match('dairy', 'dairy', 'contains')],
      [],
      vegetarian,
    );
    expect(result.verdict).toBe('clean');
    expect(result.reasons).toEqual([]);
  });

  it('скрытая формулировка не запрещает продукт, но лишает его «чистого»', () => {
    const result = resolveVerdict(
      [match('natural-flavor', 'other', 'hidden', 'ароматизатор натуральный')],
      [],
      vegetarian,
    );
    expect(result.verdict).toBe('unknown');
    expect(result.unrecognized).toEqual(['ароматизатор натуральный']);
  });

  it('запрет по отдельному ключу поверх классов', () => {
    const result = resolveVerdict(
      [match('e120', 'additive', 'contains', 'E120')],
      [],
      { excluded: [], excludedKeys: ['e120'] },
    );
    expect(result.verdict).toBe('forbidden');
  });

  it('чужой класс не мешает: молоко вегетарианцу разрешено', () => {
    const result = resolveVerdict(
      [match('dairy', 'dairy', 'contains')],
      ['сахар'],
      vegetarian,
    );
    expect(result.verdict).toBe('unknown');
  });
});
