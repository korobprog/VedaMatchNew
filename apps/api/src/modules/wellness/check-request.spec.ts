import {
  buildCheckRequest,
  CHECK_MAX_TOOL_CALLS,
  extractJsonObject,
  isProviderBusy,
  parseCheckResponse,
  parseProposal,
} from './check-request';

const input = {
  barcode: '3017620422003',
  name: 'Нутелла',
  brand: null,
  ingredientsRaw: 'сахар, масло пальмовое, фундук 13%',
  imageDataUrl: 'data:image/jpeg;base64,AAAA',
};

describe('buildCheckRequest', () => {
  it('просит поиск в интернете с ограничением числа вызовов', () => {
    const body = buildCheckRequest('gpt-5.4', input);
    expect(body.model).toBe('gpt-5.4');
    expect(body.tools).toEqual([
      { type: 'web_search', search_context_size: 'low' },
    ]);
    expect(body.max_tool_calls).toBe(CHECK_MAX_TOOL_CALLS);
    expect(CHECK_MAX_TOOL_CALLS).toBeLessThanOrEqual(6);
  });

  it('передаёт штрихкод, название, состав и снимок', () => {
    const body = buildCheckRequest('m', input) as {
      input: { content: Record<string, unknown>[] }[];
    };
    const [text, image] = body.input[0].content;
    expect(text.type).toBe('input_text');
    expect(text.text).toContain('Штрихкод: 3017620422003');
    expect(text.text).toContain('Название со слов человека: Нутелла');
    expect(text.text).toContain('сахар, масло пальмовое');
    expect(image).toEqual({
      type: 'input_image',
      image_url: input.imageDataUrl,
      detail: 'low',
    });
  });

  it('велит брать состав со страниц, а не со снимка', () => {
    const body = buildCheckRequest('m', input) as {
      input: { content: { text?: string }[] }[];
    };
    expect(body.input[0].content[0].text).toMatch(/ТОЛЬКО со страниц/);
  });

  it('без снимка — только текст, без пустой картинки', () => {
    const body = buildCheckRequest('m', {
      ...input,
      imageDataUrl: null,
      brand: 'Ferrero',
    }) as { input: { content: { text?: string }[] }[] };
    expect(body.input[0].content).toHaveLength(1);
    expect(body.input[0].content[0].text).toContain(
      'Производитель со слов человека: Ferrero',
    );
  });
});

describe('extractJsonObject', () => {
  it('достаёт объект из ```json и болтовни вокруг', () => {
    expect(
      extractJsonObject('Вот ответ:\n```json\n{"found": true}\n```\nГотово.'),
    ).toEqual({ found: true });
  });

  it.each(['', 'не нашёл', '{"found": tru', '} наоборот {'])(
    'мусор %p — null',
    (text) => expect(extractJsonObject(text)).toBeNull(),
  );
});

describe('parseProposal', () => {
  it('разбирает полный ответ', () => {
    expect(
      parseProposal({
        found: true,
        notFood: false,
        name: '  Nutella  паста ',
        brand: 'Ferrero',
        ingredients: ' сахар, фундук ',
        sources: [
          {
            url: 'https://shop.ru/p/1',
            title: 'Nutella',
            confirmsProduct: true,
            confirmsIngredients: true,
          },
        ],
        conflicts: ['вес другой'],
      }),
    ).toEqual({
      found: true,
      notFood: false,
      name: 'Nutella паста',
      brand: 'Ferrero',
      ingredientsRaw: 'сахар, фундук',
      sources: [
        {
          url: 'https://shop.ru/p/1',
          title: 'Nutella',
          confirmsProduct: true,
          confirmsIngredients: true,
        },
      ],
      conflicts: ['вес другой'],
    });
  });

  it.each([null, undefined, 'строка', 42, [], {}, { found: 'yes' }])(
    'без булевого found (%p) — ответа нет, а не «найдено»',
    (value) => expect(parseProposal(value)).toBeNull(),
  );

  it('чужие типы полей считаются отсутствующими, а не угадываются', () => {
    expect(
      parseProposal({
        found: true,
        notFood: 'true',
        name: 7,
        brand: '',
        ingredients: ['сахар'],
        sources: 'https://shop.ru',
        conflicts: 'всё плохо',
      }),
    ).toEqual({
      found: true,
      notFood: false,
      name: null,
      brand: null,
      ingredientsRaw: null,
      sources: [],
      conflicts: [],
    });
  });

  it('источники: только http(s), без повторов, не больше восьми', () => {
    const sources = [
      { url: 'javascript:alert(1)', confirmsProduct: true },
      { url: 'ftp://shop.ru/x' },
      { url: 'не адрес' },
      { url: 'https://a.ru/p#top', confirmsProduct: 'yes' },
      { url: 'https://a.ru/p' },
      null,
      ...Array.from({ length: 12 }, (_, i) => ({ url: `https://s${i}.ru/p` })),
    ];
    const parsed = parseProposal({ found: true, sources });
    expect(parsed?.sources[0]).toEqual({
      url: 'https://a.ru/p#top',
      title: '',
      confirmsProduct: false,
      confirmsIngredients: false,
    });
    expect(parsed?.sources).toHaveLength(8);
    expect(parsed?.sources.map((s) => s.url)).not.toContain('https://a.ru/p');
  });

  it('обрезает поля до пределов карточки', () => {
    const parsed = parseProposal({
      found: true,
      name: 'н'.repeat(500),
      ingredients: 'с'.repeat(10_000),
    });
    expect(parsed?.name?.length).toBe(160);
    expect(parsed?.ingredientsRaw?.length).toBe(4000);
  });
});

/** Ответ Responses API в том виде, в каком его вернул релей в живой пробе. */
function relayResponse(text: string | null, extra: unknown[] = []) {
  return {
    output: [
      {
        type: 'web_search_call',
        status: 'completed',
        action: { type: 'search', query: '3017620422003 barcode product' },
      },
      {
        type: 'web_search_call',
        status: 'completed',
        action: { type: 'open_page', url: 'https://cotco.ca/products' },
      },
      { type: 'reasoning' },
      {
        type: 'web_search_call',
        status: 'completed',
        action: { type: 'open_page', url: 'https://barcodenest.com/' },
      },
      ...extra,
      ...(text === null
        ? []
        : [
            {
              type: 'message',
              content: [{ type: 'output_text', text, annotations: [] }],
            },
          ]),
    ],
    usage: { input_tokens: 37410, output_tokens: 380 },
  };
}

describe('parseCheckResponse', () => {
  it('журнал поиска: открытые страницы и число поисков — факт от провайдера', () => {
    const parsed = parseCheckResponse(relayResponse('{"found": false}'));
    expect(parsed.seenUrls).toEqual([
      'https://cotco.ca/products',
      'https://barcodenest.com',
    ]);
    expect(parsed.searchCalls).toBe(1);
    expect(parsed.usage).toEqual({ inputTokens: 37410, outputTokens: 380 });
    expect(parsed.proposal).toEqual(
      expect.objectContaining({ found: false }) as unknown,
    );
  });

  it('страницы из выдачи поиска тоже считаются увиденными', () => {
    const parsed = parseCheckResponse(
      relayResponse('{"found": false}', [
        {
          type: 'web_search_call',
          action: {
            type: 'search',
            sources: [{ url: 'https://shop.ru/p?utm_source=x' }, { url: 5 }],
          },
        },
      ]),
    );
    expect(parsed.seenUrls).toContain('https://shop.ru/p');
    expect(parsed.searchCalls).toBe(2);
  });

  it('текст вместо JSON — предложения нет, но расход и журнал сохраняются', () => {
    const parsed = parseCheckResponse(
      relayResponse('Product name: **Nutella**\nBrand: **Ferrero**'),
    );
    expect(parsed.proposal).toBeNull();
    expect(parsed.usage.inputTokens).toBe(37410);
  });

  it('берётся последнее сообщение модели', () => {
    const parsed = parseCheckResponse({
      output: [
        { type: 'message', content: [{ text: '{"found": false}' }] },
        { type: 'message', content: [{ text: '{"found": true}' }] },
      ],
    });
    expect(parsed.proposal?.found).toBe(true);
  });

  it.each([null, undefined, 'ok', [], {}, { output: 'x', usage: 'y' }])(
    'пустота и мусор (%p) — пустой разбор без исключения',
    (payload) => {
      expect(parseCheckResponse(payload)).toEqual({
        proposal: null,
        seenUrls: [],
        searchCalls: 0,
        usage: { inputTokens: 0, outputTokens: 0 },
      });
    },
  );

  it('отрицательные и нечисловые токены — ноль', () => {
    const parsed = parseCheckResponse({
      output: [],
      usage: { input_tokens: -5, output_tokens: '100' },
    });
    expect(parsed.usage).toEqual({ inputTokens: 0, outputTokens: 0 });
  });
});

describe('isProviderBusy', () => {
  it('429 и 503 — занят', () => {
    expect(isProviderBusy(429, '')).toBe(true);
    expect(isProviderBusy(503, '')).toBe(true);
  });

  it('перегрузка словами релея — занят, даже при другом коде', () => {
    expect(
      isProviderBusy(
        200,
        '{"message":"Выбранная модель сейчас перегружена","type":"rate_limit_error"}',
      ),
    ).toBe(true);
  });

  it('400 и 401 — сломан, а не занят', () => {
    expect(isProviderBusy(400, 'bad request')).toBe(false);
    expect(isProviderBusy(401, 'invalid key')).toBe(false);
  });
});
