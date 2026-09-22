import type {
  WellnessScanResult,
  WellnessVerdict,
  WellnessVerdictReason,
} from '@vedamatch/shared';
import {
  describeReason,
  describeVerdict,
  isMissingProduct,
  verdictAccessibilityLabel,
  verdictSections,
  verdictTone,
  verdictWord,
} from './verdict-copy';

const VERDICTS: WellnessVerdict[] = ['clean', 'warning', 'forbidden', 'unknown'];

function reason(
  overrides: Partial<WellnessVerdictReason> = {},
): WellnessVerdictReason {
  return {
    ingredient: {
      key: 'gelatin',
      name: 'Желатин',
      class: 'gelatin',
      eNumber: null,
      note: null,
    },
    matchedText: 'желатин пищевой',
    severity: 'contains',
    ...overrides,
  };
}

function scan(overrides: Partial<WellnessScanResult> = {}): WellnessScanResult {
  return {
    kind: 'barcode',
    barcode: '4600680000596',
    product: {
      id: 'p1',
      barcode: '4600680000596',
      name: 'Мармелад «Ягодка»',
      brand: null,
      ingredientsRaw: 'сахар, желатин',
      imageUrl: null,
      source: 'openfoodfacts',
      status: 'published',
      createdAt: '2026-09-01T00:00:00.000Z',
    },
    ingredientsRaw: 'сахар, желатин',
    result: { verdict: 'forbidden', reasons: [reason()], hidden: [], unrecognized: [] },
    ...overrides,
  };
}

describe('describeVerdict', () => {
  it.each(VERDICTS)('«%s» назван словом и объяснён', (verdict) => {
    const copy = describeVerdict(verdict);
    expect(copy.title.length).toBeGreaterThan(0);
    expect(copy.summary.length).toBeGreaterThan(10);
  });

  it('три ответа различимы по тону, «не знаем» — отдельный', () => {
    expect(verdictTone('clean')).toBe('success');
    expect(verdictTone('warning')).toBe('warning');
    expect(verdictTone('forbidden')).toBe('danger');
    expect(verdictTone('unknown')).toBe('neutral');
  });

  it('«не знаем» не притворяется разрешением', () => {
    const copy = describeVerdict('unknown');
    expect(copy.title).not.toBe(describeVerdict('clean').title);
    expect(copy.tone).not.toBe('success');
    expect(copy.summary).toContain('не до конца');
  });

  it('слова ответов не повторяются', () => {
    const words = VERDICTS.map(verdictWord);
    expect(new Set(words).size).toBe(VERDICTS.length);
  });
});

describe('describeReason', () => {
  it('называет кусок этикетки — по нему человек нас проверяет', () => {
    expect(describeReason(reason())).toContain('«желатин пищевой»');
    expect(describeReason(reason())).toContain('Желатин');
  });

  it('«может содержать следы» звучит мягче прямого указания', () => {
    const traces = describeReason(reason({ severity: 'mayContain' }));
    expect(traces).toContain('следами');
    expect(traces).not.toContain('назван в составе');
  });

  it('скрытая формулировка так и называется', () => {
    expect(describeReason(reason({ severity: 'hidden' }))).toContain('прятаться');
  });

  it('пояснение справочника дописывается, когда оно есть', () => {
    const withNote = describeReason(
      reason({
        ingredient: {
          key: 'e120',
          name: 'Кармин (E120)',
          class: 'additive',
          eNumber: 'E120',
          note: 'Краситель из насекомых кошенили.',
        },
      }),
    );
    expect(withNote).toContain('кошенили');
  });
});

describe('verdictSections', () => {
  it('пустые разделы не показываются', () => {
    const sections = verdictSections(
      scan({
        result: { verdict: 'clean', reasons: [], hidden: [], unrecognized: [] },
      }),
    );
    expect(sections).toEqual([]);
  });

  it('«что смутило» идёт первым', () => {
    const sections = verdictSections(scan());
    expect(sections[0].title).toBe('Что смутило');
    expect(sections[0].lines).toHaveLength(1);
  });

  it('непонятое и скрытое — разные разделы, а не один', () => {
    const sections = verdictSections(
      scan({
        result: {
          verdict: 'unknown',
          reasons: [],
          hidden: [reason({ severity: 'hidden' })],
          unrecognized: ['дигидрокверцетин'],
        },
      }),
    );
    expect(sections).toHaveLength(2);
    expect(sections.map((section) => section.title)).toEqual([
      'Ничего не говорящие строки',
      'Не разобрали',
    ]);
    expect(sections[1].lines).toEqual(['дигидрокверцетин']);
  });

  it('у каждого раздела есть объяснение, зачем он показан', () => {
    for (const section of verdictSections(scan())) {
      expect(section.hint.length).toBeGreaterThan(10);
    }
  });
});

describe('verdictAccessibilityLabel', () => {
  it('сначала товар, потом ответ — иначе непонятно, о чём речь', () => {
    const label = verdictAccessibilityLabel(scan());
    expect(label.indexOf('Мармелад')).toBeLessThan(label.indexOf('Не подходит'));
    expect(label).toContain('Желатин');
  });

  it('без товара честно говорит, что его нет', () => {
    const label = verdictAccessibilityLabel(
      scan({ product: null, ingredientsRaw: null, result: { verdict: 'unknown', reasons: [], hidden: [], unrecognized: [] } }),
    );
    expect(label).toContain('не найден');
  });
});

describe('isMissingProduct', () => {
  it('нет ни товара, ни состава — отдельный исход, а не вердикт', () => {
    expect(
      isMissingProduct(
        scan({
          product: null,
          ingredientsRaw: null,
          result: { verdict: 'unknown', reasons: [], hidden: [], unrecognized: [] },
        }),
      ),
    ).toBe(true);
  });

  it('товар есть — исход обычный', () => {
    expect(isMissingProduct(scan())).toBe(false);
  });

  it('товара нет, но состав прочитан со снимка — это уже вердикт', () => {
    expect(
      isMissingProduct(scan({ product: null, ingredientsRaw: 'сахар, желатин' })),
    ).toBe(false);
  });
});
