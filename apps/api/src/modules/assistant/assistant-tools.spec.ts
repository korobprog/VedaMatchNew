import {
  ASSISTANT_TOOLS,
  parseToolArgs,
  toolByName,
  toolEventName,
  toProviderTools,
  ToolArgsError,
} from './assistant-tools';

describe('реестр инструментов ассистента', () => {
  it('имена пригодны для function calling: только буквы, цифры и подчёркивание', () => {
    for (const tool of ASSISTANT_TOOLS)
      expect(tool.name).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
  });

  it('у каждого инструмента есть сервис-владелец и описание', () => {
    for (const tool of ASSISTANT_TOOLS) {
      expect(tool.service).toBeTruthy();
      expect(tool.description.length).toBeGreaterThan(20);
    }
  });

  it('действия отличаются от поисков подписью кнопки', () => {
    const actions = ASSISTANT_TOOLS.filter((tool) => tool.requiresConfirmation);
    expect(actions.map((tool) => tool.name)).toEqual([
      'motivation_create_reel',
    ]);
    for (const tool of actions) expect(tool.confirmLabel).toBeTruthy();
  });

  it('событие шины строится из имени инструмента', () => {
    expect(toolEventName('market_search')).toBe('assistant.tool.market_search');
  });

  it('при выключенных действиях провайдер не узнаёт о них', () => {
    const names = toProviderTools(undefined, { actionsEnabled: false }).map(
      (tool) => tool.function.name,
    );
    expect(names).not.toContain('motivation_create_reel');
    expect(names).toContain('market_search');
    expect(toProviderTools()[0].type).toBe('function');
  });
});

describe('parseToolArgs', () => {
  const market = toolByName('market_search')!;

  it('чистит запрос и ограничивает число результатов', () => {
    expect(
      parseToolArgs(market, { query: '  книги   Прабхупады ', limit: 99 }),
    ).toEqual({ query: 'книги Прабхупады', limit: 8 });
  });

  it('без лимита берётся значение по умолчанию', () => {
    expect(parseToolArgs(market, { query: 'сари' })).toEqual({
      query: 'сари',
      limit: 5,
    });
  });

  it('пустой запрос — ошибка, которую прочтёт модель', () => {
    expect(() => parseToolArgs(market, { query: '   ' })).toThrow(
      ToolArgsError,
    );
    expect(() => parseToolArgs(market, 'мусор')).toThrow('query');
  });

  it('незнакомые значения перечислений отбрасываются, знакомые остаются', () => {
    expect(
      parseToolArgs(market, { query: 'x', kind: 'service', city: 'Минск' }),
    ).toEqual({ query: 'x', limit: 5, city: 'Минск', kind: 'service' });
    expect(parseToolArgs(market, { query: 'x', kind: 'weird' })).toEqual({
      query: 'x',
      limit: 5,
    });
  });

  it('город принимают только Рынок и Объявления', () => {
    const library = toolByName('library_search')!;
    expect(
      parseToolArgs(library, { query: 'гита', city: 'Минск', type: 'video' }),
    ).toEqual({ query: 'гита', limit: 5, type: 'video' });
  });

  it('у astro_status аргументов нет, что бы ни прислала модель', () => {
    expect(parseToolArgs(toolByName('astro_status')!, { query: 'x' })).toEqual(
      {},
    );
  });

  describe('motivation_create_reel', () => {
    const reel = toolByName('motivation_create_reel')!;

    it('требует текст разумной длины', () => {
      expect(() => parseToolArgs(reel, { text: 'коротко' })).toThrow('короче');
      expect(() => parseToolArgs(reel, { text: 'а'.repeat(601) })).toThrow(
        'длиннее',
      );
    });

    it('поток по умолчанию — общий, пустые поля не попадают в аргументы', () => {
      expect(
        parseToolArgs(reel, {
          text: 'Служение без ожидания награды освобождает сердце.',
          explanation: '  ',
          author: '',
        }),
      ).toEqual({
        text: 'Служение без ожидания награды освобождает сердце.',
        audienceTrack: 'universal',
      });
    });

    it('сохраняет автора, пояснение и вайшнавский поток', () => {
      expect(
        parseToolArgs(reel, {
          text: 'Служение без ожидания награды освобождает сердце.',
          explanation: 'Мысль на утро',
          author: 'Участник',
          audienceTrack: 'vaishnava',
        }),
      ).toMatchObject({
        explanation: 'Мысль на утро',
        author: 'Участник',
        audienceTrack: 'vaishnava',
      });
    });
  });
});
