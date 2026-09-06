import {
  cleanComposedText,
  historyForModel,
  MAX_QUESTION_LENGTH,
  normalizeQuestion,
  titleFrom,
  type StoredMessage,
} from './assistant-conversation';

describe('historyForModel', () => {
  it('пропускает неудавшиеся ответы и пустые реплики, порядок сохраняет', () => {
    expect(
      historyForModel([
        { role: 'user', text: 'Привет', failed: false },
        { role: 'assistant', text: 'Провайдер не ответил', failed: true },
        { role: 'user', text: '   ', failed: false },
        { role: 'assistant', text: 'Здравствуйте', failed: false },
      ]),
    ).toEqual([
      { role: 'user', content: 'Привет' },
      { role: 'assistant', content: 'Здравствуйте' },
    ]);
  });

  it('берёт последние реплики в пределах лимита', () => {
    const messages: StoredMessage[] = Array.from({ length: 30 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      text: `реплика ${i}`,
      failed: false,
    }));
    const history = historyForModel(messages, 4);
    expect(history.map((m) => m.content)).toEqual([
      'реплика 26',
      'реплика 27',
      'реплика 28',
      'реплика 29',
    ]);
  });

  it('длинная старая реплика не влезает в бюджет и обрезает историю', () => {
    const history = historyForModel([
      { role: 'user', text: 'x'.repeat(20_000), failed: false },
      { role: 'assistant', text: 'ок', failed: false },
      { role: 'user', text: 'а теперь?', failed: false },
    ]);
    expect(history.map((m) => m.content)).toEqual(['ок', 'а теперь?']);
  });
});

describe('titleFrom', () => {
  it('короткий вопрос — заголовок целиком', () => {
    expect(titleFrom('  Где купить   сари?  ')).toBe('Где купить сари?');
  });

  it('длинный режется по слову с многоточием', () => {
    const title = titleFrom(
      'Подскажи пожалуйста какие есть книги Шрилы Прабхупады на русском языке в продаже сейчас',
    );
    expect(title.length).toBeLessThanOrEqual(61);
    expect(title.endsWith('…')).toBe(true);
    expect(title).not.toMatch(/\s…$/);
  });
});

describe('normalizeQuestion', () => {
  it('пустое — null, длинное — обрезается', () => {
    expect(normalizeQuestion('   ')).toBeNull();
    expect(normalizeQuestion(42)).toBeNull();
    expect(
      normalizeQuestion('x'.repeat(MAX_QUESTION_LENGTH + 10)),
    ).toHaveLength(MAX_QUESTION_LENGTH);
  });
});

describe('cleanComposedText', () => {
  it('снимает обрамляющие кавычки, но не внутренние', () => {
    expect(cleanComposedText('«Привет, Кешава!»')).toBe('Привет, Кешава!');
    expect(cleanComposedText('"Привет"')).toBe('Привет');
    expect(cleanComposedText('Он сказал «да» и ушёл')).toBe(
      'Он сказал «да» и ушёл',
    );
    expect(cleanComposedText('"')).toBe('"');
  });
});
