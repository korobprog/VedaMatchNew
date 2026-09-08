import { toOfferDto, type OfferRow } from './vacancy-dto';

const now = new Date('2026-09-08T12:00:00.000Z');

function row(overrides: Partial<OfferRow> = {}): OfferRow {
  return {
    id: 'o1',
    kind: 'work',
    authorId: 'author',
    communityId: null,
    title: 'Повар',
    description: null,
    audience: 'everyone',
    location: null,
    city: 'Москва',
    cityKey: 'москва',
    country: null,
    latitude: 55.75,
    longitude: 37.62,
    placePrecision: 'city',
    isRemote: false,
    workFormat: 'onsite',
    employment: null,
    schedule: null,
    payMin: 50_000,
    payMax: null,
    payCurrency: 'RUB',
    payPeriod: 'month',
    payNegotiable: false,
    sevaTerm: null,
    sevaUntil: null,
    perks: [],
    dueAt: null,
    status: 'published',
    moderatorNote: 'спам',
    publishedAt: now,
    expiresAt: new Date(now.getTime() + 86_400_000),
    renewedAt: null,
    renewCount: 0,
    closedAt: null,
    viewsCount: 0,
    responsesCount: 0,
    openReportsCount: 0,
    createdAt: now,
    updatedAt: now,
    author: {
      id: 'author',
      name: 'Иван',
      spiritualName: 'Ишвара дас',
      avatarUrl: null,
    },
    community: null,
    ...overrides,
  };
}

describe('toOfferDto', () => {
  it('координаты человека наружу не уезжают, у общины — уезжают', () => {
    expect(toOfferDto(row(), 'viewer', now).lat).toBeNull();
    expect(
      toOfferDto(row({ placePrecision: 'exact' }), 'viewer', now).lat,
    ).toBe(55.75);
  });

  it('имя автора — духовное, если оно есть', () => {
    expect(toOfferDto(row(), 'viewer', now).author.name).toBe('Ишвара дас');
  });

  it('причину скрытия видит только автор', () => {
    expect(toOfferDto(row(), 'viewer', now).moderatorNote).toBeNull();
    expect(toOfferDto(row(), 'author', now).moderatorNote).toBe('спам');
  });

  it('оплата есть только у работы', () => {
    expect(toOfferDto(row(), 'viewer', now).pay).toEqual({
      min: 50_000,
      max: null,
      currency: 'RUB',
      period: 'month',
      negotiable: false,
    });
    expect(toOfferDto(row({ kind: 'seva' }), 'viewer', now).pay).toBeNull();
  });

  it('продлить может автор внутри окна, чужой — никогда', () => {
    expect(toOfferDto(row(), 'author', now).canRenew).toBe(true);
    expect(toOfferDto(row(), 'viewer', now).canRenew).toBe(false);
  });
});
