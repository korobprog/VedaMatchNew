import type {
  ChatSearchState,
  CommunitySearchResponse,
  ContactsSearchResponse,
  PortalSearchResponse,
} from '@vedamatch/shared';
import {
  SEARCH_PER_GROUP,
  buildSearchView,
  portalCardTarget,
  serviceLabel,
  snippet,
  unavailableNote,
  type SearchOutcomes,
} from './search-results';
import { normalizeSearchQuery, searchesChats } from './search-query';

const ok = <T,>(data: T) => ({ status: 'ok' as const, data });
const failed = { status: 'failed' as const };
const skipped = { status: 'skipped' as const };

function people(names: string[]): ContactsSearchResponse {
  return {
    items: names.map((name, i) => ({ userId: `u${i}`, name, headline: null, statusLine: i === 0 ? 'Пуджари' : null, city: 'Минск' })),
    page: 1,
    pageSize: 5,
    hasMore: false,
    total: null,
    facets: [],
  } as unknown as ContactsSearchResponse;
}

function communities(names: string[]): CommunitySearchResponse {
  return {
    items: names.map((name, i) => ({ id: `c${i}`, name, kind: 'yatra', city: i ? null : 'Минск', isVerified: i === 0, membersCount: 12 })),
    page: 1,
    pageSize: 5,
    total: names.length,
    hasMore: false,
  } as unknown as CommunitySearchResponse;
}

function chats(hits: [string, string, string][]): ChatSearchState {
  return {
    hits: hits.map(([conversationId, title, body], i) => ({
      conversation: { id: conversationId, title },
      message: { id: `m${i}`, body, author: { id: 'a', name: 'Радха' } },
    })),
    truncated: false,
  } as unknown as ChatSearchState;
}

function portal(groups: PortalSearchResponse['groups'], unavailable: string[] = []): PortalSearchResponse {
  return { query: 'кришна', groups, unavailable };
}

const card = (service: string, href: string, title = 'Карточка') => ({
  kind: 'link' as const,
  service,
  title,
  subtitle: null,
  body: null,
  imageUrl: null,
  href,
});

const none: SearchOutcomes = {
  people: ok(people([])),
  communities: ok(communities([])),
  chats: ok(chats([])),
  portal: ok(portal([])),
};

describe('запрос', () => {
  it('чистится как на сервере и не короче двух знаков', () => {
    expect(normalizeSearchQuery('  кри   шна ')).toBe('кри шна');
    expect(normalizeSearchQuery(' к ')).toBeNull();
    expect(normalizeSearchQuery(42)).toBeNull();
    expect(normalizeSearchQuery('я'.repeat(200))).toHaveLength(120);
  });

  it('переписка ищется с трёх знаков', () => {
    expect(searchesChats('ом')).toBe(false);
    expect(searchesChats('ома')).toBe(true);
  });
});

describe('portalCardTarget', () => {
  it('товар «Здоровья» открывается экраном ответа сканера', () => {
    expect(portalCardTarget('/wellness/products/4601234567890')).toEqual({
      kind: 'route',
      pathname: '/wellness/result/[barcode]',
      params: { barcode: '4601234567890', kind: 'manual' },
    });
  });

  it('остальное — сайт тем же путём, с запросом', () => {
    expect(portalCardTarget('/market/listing/l-1')).toEqual({ kind: 'site', path: '/market/listing/l-1' });
    expect(portalCardTarget('/vedabase/books/bg/1?x=1')).toEqual({ kind: 'site', path: '/vedabase/books/bg/1?x=1' });
    // Не штрихкод — не экран сканера.
    expect(portalCardTarget('/wellness/products/abc')).toEqual({ kind: 'site', path: '/wellness/products/abc' });
  });

  it('чужой адрес открыть нечем', () => {
    expect(portalCardTarget('https://evil.example/x')).toBeNull();
    expect(portalCardTarget('//evil.example/x')).toBeNull();
  });
});

describe('buildSearchView', () => {
  it('порядок: люди, общины, переписка, потом сервисы в порядке сервера', () => {
    const view = buildSearchView({
      people: ok(people(['Радха'])),
      communities: ok(communities(['Минская ятра'])),
      chats: ok(chats([['c-1', 'Семья', 'Харе Кришна']])),
      portal: ok(portal([
        { service: 'library', items: [card('library', '/library/entry/1')] },
        { service: 'market', items: [card('market', '/market/listing/2')] },
      ])),
    });
    expect(view.kind === 'results' && view.groups.map((g) => g.title)).toEqual([
      'Люди',
      'Общины',
      'Переписка',
      'Образование',
      'Рынок',
    ]);
  });

  it('человек, община и беседа открываются своими экранами', () => {
    const view = buildSearchView({
      ...none,
      people: ok(people(['Радха'])),
      communities: ok(communities(['Минская ятра'])),
      chats: ok(chats([['c-1', 'Семья', 'Харе Кришна']])),
    });
    if (view.kind !== 'results') throw new Error(view.kind);
    const [person, community, chat] = view.groups.map((g) => g.items[0]);
    expect(person.target).toEqual({ kind: 'route', pathname: '/people/[id]', params: { id: 'u0' } });
    expect(person.subtitle).toBe('Пуджари · Минск');
    expect(community.target).toEqual({
      kind: 'route',
      pathname: '/communities/[id]',
      params: { id: 'c0', name: 'Минская ятра', kind: 'yatra', city: 'Минск', isVerified: '1' },
    });
    expect(chat.target).toEqual({ kind: 'route', pathname: '/chat/[id]', params: { id: 'c-1' } });
    expect(chat.subtitle).toBe('Радха: Харе Кришна');
  });

  it('одна беседа — одна строка, даже если совпала пять раз', () => {
    const view = buildSearchView({
      ...none,
      chats: ok(chats([
        ['c-1', 'Семья', 'свежее'],
        ['c-1', 'Семья', 'старое'],
        ['c-2', 'Ятра', 'ещё'],
      ])),
    });
    if (view.kind !== 'results') throw new Error(view.kind);
    expect(view.groups[0].items.map((i) => i.subtitle)).toEqual(['Радха: свежее', 'Радха: ещё']);
  });

  it('не больше пяти строк в группе', () => {
    const view = buildSearchView({ ...none, people: ok(people(['1', '2', '3', '4', '5', '6', '7'])) });
    expect(view.kind === 'results' && view.groups[0].items).toHaveLength(SEARCH_PER_GROUP);
  });

  it('уход на сайт назван для скринридера, свой экран — нет', () => {
    const view = buildSearchView({
      ...none,
      portal: ok(portal([
        { service: 'market', items: [card('market', '/market/listing/2', 'Гхи')] },
        { service: 'wellness', items: [card('wellness', '/wellness/products/4601234567890', 'Гхи')] },
      ])),
    });
    if (view.kind !== 'results') throw new Error(view.kind);
    expect(view.groups[0].items[0].accessibilityLabel).toBe('Гхи. Рынок, откроется на сайте');
    expect(view.groups[1].items[0].accessibilityLabel).toBe('Гхи. Здоровье');
  });

  it('карточку без своего пути не показывает, пустую группу — тоже', () => {
    const view = buildSearchView({
      ...none,
      portal: ok(portal([{ service: 'market', items: [card('market', 'https://x.example')] }])),
    });
    expect(view).toEqual({ kind: 'empty', unavailable: [] });
  });

  it('ничего не нашлось — пусто, и названы не ответившие сервисы', () => {
    const view = buildSearchView({ ...none, portal: ok(portal([], ['market'])), chats: skipped });
    expect(view).toEqual({ kind: 'empty', unavailable: ['Рынок'] });
  });

  it('упавший источник не роняет выдачу, но называется', () => {
    const view = buildSearchView({ ...none, people: ok(people(['Радха'])), communities: failed, portal: failed });
    expect(view.kind).toBe('results');
    expect(view.kind === 'results' && view.unavailable).toEqual(['Общины', 'материалы сервисов']);
  });

  it('упали все спрошенные — это ошибка, а не «ничего нет»', () => {
    expect(buildSearchView({ people: failed, communities: failed, chats: skipped, portal: failed })).toEqual({
      kind: 'error',
    });
  });
});

describe('подписи', () => {
  it('сервисы названы как на сайте: library — Образование, vedabase — Библиотека', () => {
    expect(serviceLabel('library')).toBe('Образование');
    expect(serviceLabel('vedabase')).toBe('Библиотека');
    expect(serviceLabel('new-service')).toBe('new-service');
  });

  it('фрагмент — в одну строку и по слову', () => {
    expect(snippet('  раз\nдва  ')).toBe('раз два');
    expect(snippet('слово '.repeat(40), 20)).toBe('слово слово слово…');
    expect(snippet('')).toBeNull();
  });

  it('заметка о не ответивших — только когда они есть', () => {
    expect(unavailableNote([])).toBeNull();
    expect(unavailableNote(['Рынок', 'Люди'])).toContain('Не успели ответить: Рынок, Люди.');
  });
});
