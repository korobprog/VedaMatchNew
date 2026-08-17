import { toNoticeDto, type NoticeRow } from './notice-dto';

const now = new Date('2026-08-17T12:00:00.000Z');

const row = {
  id: 'n1',
  kind: 'offer',
  rubricId: 'r1',
  rubric: {
    id: 'r1',
    slug: 'giveaway',
    kinds: ['offer'],
    nameRu: 'Отдам даром',
    nameEn: 'Free to a good home',
    iconKey: null,
    isSystem: true,
    position: 0,
    noticesCount: 3,
    createdAt: now,
    updatedAt: now,
  },
  authorId: 'u1',
  author: {
    id: 'u1',
    name: 'Максим',
    spiritualName: 'Мадхава дас',
    avatarUrl: null,
  },
  communityId: null,
  community: null,
  titleRu: 'Отдам холодильник',
  titleEn: null,
  descriptionRu: 'Работает',
  descriptionEn: null,
  audience: 'everyone',
  location: { city: 'Москва', lat: 55.75, lon: 37.62 },
  city: 'Москва',
  country: 'Россия',
  latitude: 55.75,
  longitude: 37.62,
  placePrecision: 'city',
  startsAt: null,
  endsAt: null,
  timeZone: null,
  venueName: null,
  isOnline: false,
  onlineUrl: null,
  status: 'published',
  needsReview: false,
  marketMoveSuggestedAt: null,
  moderatorNote: null,
  fingerprint: 'abc',
  primaryImageUrl: null,
  publishedAt: now,
  expiresAt: new Date('2026-09-16T12:00:00.000Z'),
  renewedAt: null,
  renewCount: 0,
  resolvedAt: null,
  viewsCount: 7,
  responsesCount: 0,
  thanksCount: 0,
  openReportsCount: 0,
  createdAt: now,
  updatedAt: now,
  images: [
    {
      id: 'i2',
      noticeId: 'n1',
      storageKey: 'k2',
      url: 'u2',
      width: 1,
      height: 1,
      sizeBytes: 1,
      sortOrder: 2,
      createdAt: now,
    },
    {
      id: 'i1',
      noticeId: 'n1',
      storageKey: 'k1',
      url: 'u1',
      width: 1,
      height: 1,
      sizeBytes: 1,
      sortOrder: 1,
      createdAt: now,
    },
  ],
} as unknown as NoticeRow;

describe('toNoticeDto: приватность места', () => {
  it('у объявления человека координат наружу нет', () => {
    // Город есть, точки нет: доска не должна показывать, где человек живёт.
    const dto = toNoticeDto(row, 'u1', now);
    expect(dto.city).toBe('Москва');
    expect(dto.lat).toBeNull();
    expect(dto.lon).toBeNull();
  });

  it('у общественного места координаты отдаются', () => {
    const dto = toNoticeDto({ ...row, placePrecision: 'exact' }, 'u1', now);
    expect(dto.lat).toBe(55.75);
    expect(dto.lon).toBe(37.62);
  });

  it('сырой JSON локации наружу не уезжает', () => {
    const dto = toNoticeDto(row, null, now) as Record<string, unknown>;
    for (const leaked of [
      'location',
      'latitude',
      'longitude',
      'fingerprint',
      'openReportsCount',
      'moderatorNote',
      'authorId',
    ]) {
      expect(dto).not.toHaveProperty(leaked);
    }
  });
});

describe('toNoticeDto: автор и общность', () => {
  it('имя собирается духовным, если оно есть', () => {
    expect(toNoticeDto(row, null, now).author.name).toBe('Мадхава дас');
  });

  it('без духовного имени показывается мирское', () => {
    const dto = toNoticeDto(
      { ...row, author: { ...row.author, spiritualName: null } },
      null,
      now,
    );
    expect(dto.author.name).toBe('Максим');
  });

  it('от себя лично postedAs пуст', () => {
    expect(toNoticeDto(row, null, now).postedAs).toBeNull();
  });

  it('от имени общины отдаётся её значок', () => {
    const dto = toNoticeDto(
      {
        ...row,
        communityId: 'c1',
        community: {
          id: 'c1',
          slug: 'moskovskaya-yatra',
          name: 'Московская ятра',
          kind: 'yatra',
          city: 'Москва',
          verifiedAt: now,
        },
      },
      null,
      now,
    );
    expect(dto.postedAs?.name).toBe('Московская ятра');
    expect(dto.postedAs?.isVerified).toBe(true);
  });
});

describe('toNoticeDto: смотрящий', () => {
  it('isMine и canRenew только у автора', () => {
    const soon = {
      ...row,
      expiresAt: new Date('2026-08-18T12:00:00.000Z'),
    } as NoticeRow;
    expect(toNoticeDto(soon, 'u1', now).isMine).toBe(true);
    expect(toNoticeDto(soon, 'u1', now).canRenew).toBe(true);
    expect(toNoticeDto(soon, 'u2', now).isMine).toBe(false);
    // Чужое объявление продлевать нельзя, даже если срок близко.
    expect(toNoticeDto(soon, 'u2', now).canRenew).toBe(false);
  });

  it('картинки идут по sortOrder, а не по порядку из БД', () => {
    expect(toNoticeDto(row, null, now).images.map((i) => i.id)).toEqual([
      'i1',
      'i2',
    ]);
  });
});
