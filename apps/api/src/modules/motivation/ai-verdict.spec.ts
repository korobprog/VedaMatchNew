import {
  buildModerationPrompt,
  DEFAULT_REJECT_REASON,
  parseAiVerdict,
  reasonForUser,
  resolveDecision,
} from './ai-verdict';

describe('parseAiVerdict', () => {
  it('accepts a well-formed verdict and normalises it', () => {
    expect(
      parseAiVerdict({
        decision: ' Reject ',
        confidence: '0.91',
        flags: ['Politics', 7, '  '],
        reason: '  Текст про выборы.  ',
      }),
    ).toEqual({
      decision: 'reject',
      confidence: 0.91,
      flags: ['politics'],
      reason: 'Текст про выборы.',
    });
  });

  it('clamps confidence into 0..1', () => {
    expect(
      parseAiVerdict({ decision: 'approve', confidence: 7 })?.confidence,
    ).toBe(1);
  });

  it('returns null for anything that is not a verdict', () => {
    expect(parseAiVerdict(null)).toBeNull();
    expect(parseAiVerdict({ decision: 'maybe', confidence: 0.5 })).toBeNull();
    expect(
      parseAiVerdict({ decision: 'approve', confidence: 'high' }),
    ).toBeNull();
  });
});

describe('resolveDecision', () => {
  const thresholds = { approve: 0.75, reject: 0.85 };

  it.each([
    ['approve', 0.8, 'approve'],
    ['approve', 0.7, 'escalate'],
    ['reject', 0.9, 'reject'],
    ['reject', 0.8, 'escalate'],
    ['escalate', 0.99, 'escalate'],
  ] as const)('%s at %d → %s', (decision, confidence, expected) => {
    expect(resolveDecision({ decision, confidence }, thresholds)).toBe(
      expected,
    );
  });
});

describe('reasonForUser', () => {
  it('falls back to the default wording when the model gave none', () => {
    const base = { decision: 'reject' as const, confidence: 0.9, flags: [] };
    expect(reasonForUser({ ...base, reason: '' })).toBe(DEFAULT_REJECT_REASON);
    expect(reasonForUser({ ...base, reason: 'Реклама.' })).toBe('Реклама.');
  });
});

describe('buildModerationPrompt', () => {
  it('includes the text, source state, track and editorial rules', () => {
    const prompt = buildModerationPrompt({
      text: 'Ты имеешь право лишь на действие.',
      explanation: 'Моя мысль.',
      author: 'Кришна',
      work: 'Бхагавад-гита',
      locator: '2.47',
      sourceVerified: true,
      audienceTrack: 'vaishnava',
      language: 'ru',
      editorialRules: 'Не пропускать политику.',
    });

    expect(prompt).toContain('Источник проверен: Кришна, Бхагавад-гита, 2.47');
    expect(prompt).toContain('вайшнавская мудрость');
    expect(prompt).toContain('Правила редакции');
    expect(prompt).toContain('Не пропускать политику.');
    expect(prompt).toContain('Моя мысль.');
    expect(prompt).toContain('"decision":"approve|reject|escalate"');
  });

  it('says the source is unverified for own text', () => {
    const prompt = buildModerationPrompt({
      text: 'x',
      explanation: '',
      author: null,
      work: null,
      locator: null,
      sourceVerified: false,
      audienceTrack: 'universal',
      language: 'ru',
      editorialRules: '',
    });

    expect(prompt).toContain('собственная мысль пользователя');
    expect(prompt).not.toContain('Правила редакции');
  });
});
