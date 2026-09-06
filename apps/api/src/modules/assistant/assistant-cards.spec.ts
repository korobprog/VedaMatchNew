import {
  actionSummary,
  describeForModel,
  parseStoredCards,
  pendingActionCard,
  pickReply,
  toLinkCards,
} from './assistant-cards';

describe('pickReply', () => {
  it('берёт первый ответ, похожий на ответ сервиса, остальное пропускает', () => {
    expect(
      pickReply([
        undefined,
        null,
        'мусор',
        { ok: true, items: [] },
        { ok: false },
      ]),
    ).toEqual({ ok: true, items: [] });
    expect(pickReply([])).toBeNull();
  });
});

describe('toLinkCards', () => {
  it('отбрасывает карточки без заголовка или с внешней ссылкой', () => {
    const cards = toLinkCards(
      'market',
      [
        {
          title: 'Сари',
          href: '/market/listing/1',
          imageUrl: 'https://cdn/x.jpg',
        },
        { title: '', href: '/market/listing/2' },
        { title: 'Наружу', href: 'https://evil.example' },
        { title: 'Протокол', href: '//evil.example' },
        'мусор',
        {
          title: 'Без картинки',
          href: '/market/listing/3',
          imageUrl: 'javascript:alert(1)',
        },
      ],
      8,
    );
    expect(cards.map((card) => card.title)).toEqual(['Сари', 'Без картинки']);
    expect(cards[0]).toMatchObject({
      kind: 'link',
      service: 'market',
      imageUrl: 'https://cdn/x.jpg',
    });
    expect(cards[1].imageUrl).toBeNull();
  });

  it('режет длинные тексты и соблюдает лимит', () => {
    const cards = toLinkCards(
      'library',
      Array.from({ length: 10 }, (_, i) => ({
        title: `Т${i}`,
        href: `/library/entry/${i}`,
        body: 'слово '.repeat(200),
      })),
      3,
    );
    expect(cards).toHaveLength(3);
    expect(cards[0].body!.length).toBeLessThanOrEqual(400);
    expect(cards[0].body!.endsWith('…')).toBe(true);
  });
});

describe('describeForModel', () => {
  it('без ответа — сервис недоступен', () => {
    expect(JSON.parse(describeForModel(null, []))).toEqual({
      ok: false,
      error: 'service_unavailable',
    });
  });

  it('передаёт модели заголовки, но не ссылки и картинки', () => {
    const cards = toLinkCards(
      'market',
      [
        {
          title: 'Сари',
          subtitle: '1 200 ₽',
          href: '/market/listing/1',
          imageUrl: 'https://cdn/x.jpg',
        },
      ],
      8,
    );
    const described = JSON.parse(
      describeForModel({ ok: true }, cards),
    ) as Record<string, unknown>;
    expect(described).toEqual({
      ok: true,
      found: 1,
      items: [{ title: 'Сари', subtitle: '1 200 ₽' }],
    });
    expect(describeForModel({ ok: true }, cards)).not.toContain('cdn');
  });

  it('ничего не нашлось — так и говорит', () => {
    expect(JSON.parse(describeForModel({ ok: true, items: [] }, []))).toEqual({
      ok: true,
      found: 0,
    });
    expect(
      JSON.parse(describeForModel({ ok: false, text: 'лимит' }, [])),
    ).toEqual({ ok: false, error: 'лимит' });
  });
});

describe('карточки действий', () => {
  it('новая карточка ждёт подтверждения', () => {
    const card = pendingActionCard({
      action: 'motivation_create_reel',
      label: 'Опубликовать',
      summary: 's',
      args: { text: 't' },
    });
    expect(card).toMatchObject({
      kind: 'action',
      status: 'pending',
      resultHref: null,
      resultText: null,
    });
  });

  it('описание рилса упоминает поток и текст', () => {
    expect(
      actionSummary('motivation_create_reel', {
        text: 'Мысль',
        audienceTrack: 'vaishnava',
      }),
    ).toContain('вайшнавский');
    expect(
      actionSummary('motivation_create_reel', { text: 'Мысль' }),
    ).toContain('«Мысль»');
    expect(actionSummary('other', {})).toBe('Действие other');
  });
});

describe('parseStoredCards', () => {
  it('восстанавливает карточки из JSON и отбрасывает битые', () => {
    const cards = parseStoredCards([
      { kind: 'link', title: 'Сари', href: '/m/1' },
      { kind: 'action', action: 'motivation_create_reel', args: { text: 't' } },
      { kind: 'link', title: 42 },
      { kind: 'unknown' },
      null,
    ]);
    expect(cards).toHaveLength(2);
    expect(cards[0]).toMatchObject({
      kind: 'link',
      service: 'portal',
      subtitle: null,
    });
    expect(cards[1]).toMatchObject({
      kind: 'action',
      status: 'pending',
      label: 'Подтвердить',
    });
    expect(parseStoredCards('мусор')).toEqual([]);
  });
});
