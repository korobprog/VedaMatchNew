import type { Community, CommunityMember } from '@prisma/client';
import {
  toBadgeDto,
  toCommunityDto,
  toMapPoint,
  toMemberDto,
  toMembershipDto,
} from './community-dto';

const community = {
  id: 'c1',
  slug: 'moskovskaya-yatra',
  kind: 'yatra',
  name: 'Московская ятра',
  descriptionRu: 'Программы по воскресеньям',
  descriptionEn: null,
  logoKey: 'communities/c1/logo.jpg',
  logoUrl: 'https://cdn/logo.jpg',
  coverKey: null,
  coverUrl: null,
  location: { city: 'Москва', lat: 55.75, lon: 37.62 },
  city: 'Москва',
  country: 'Россия',
  latitude: 55.75,
  longitude: 37.62,
  address: 'Хорошёвское шоссе, 8',
  timezone: 'Europe/Moscow',
  messengers: { telegram: '@yatra' },
  links: { website: 'https://example.org' },
  joinPolicy: 'request_approval',
  status: 'active',
  verifiedAt: new Date('2026-01-01T00:00:00.000Z'),
  verifiedById: 'admin-1',
  createdById: 'u1',
  membersCount: 42,
  noticesCount: 0,
  openReportsCount: 0,
  createdAt: new Date('2025-12-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
} as unknown as Community;

const member = {
  id: 'm1',
  communityId: 'c1',
  userId: 'u1',
  role: 'admin',
  status: 'active',
  title: 'координатор кухни',
  isPrimary: true,
  isPublic: true,
  joinedAt: new Date('2025-12-02T00:00:00.000Z'),
  decidedById: null,
  decidedAt: null,
  createdAt: new Date('2025-12-01T00:00:00.000Z'),
  updatedAt: new Date('2025-12-02T00:00:00.000Z'),
} as unknown as CommunityMember;

describe('toCommunityDto', () => {
  it('не отдаёт наружу ключи хранилища и служебные поля', () => {
    const dto = toCommunityDto(community, null) as unknown as Record<string, unknown>;
    // logoKey/coverKey — внутренние ключи S3; verifiedById и счётчик жалоб
    // наружу тоже не нужны.
    for (const leaked of [
      'logoKey',
      'coverKey',
      'verifiedById',
      'verifiedAt',
      'createdById',
      'openReportsCount',
      'location',
      'latitude',
      'longitude',
    ]) {
      expect(dto).not.toHaveProperty(leaked);
    }
  });

  it('координаты общины отдаются как есть — адрес храма публичный', () => {
    const dto = toCommunityDto(community, null);
    expect(dto.lat).toBe(55.75);
    expect(dto.lon).toBe(37.62);
    expect(dto.address).toBe('Хорошёвское шоссе, 8');
  });

  it('сводит verifiedAt к булеву признаку', () => {
    expect(toCommunityDto(community, null).isVerified).toBe(true);
    expect(
      toCommunityDto({ ...community, verifiedAt: null }, null).isVerified,
    ).toBe(false);
  });

  it('пустые messengers и links приходят объектами, а не null', () => {
    const dto = toCommunityDto(
      { ...community, messengers: null, links: null },
      null,
    );
    expect(dto.messengers).toEqual({});
    expect(dto.links).toEqual({});
  });

  it('членство прикладывается, когда оно есть', () => {
    expect(toCommunityDto(community, null).membership).toBeNull();
    expect(toCommunityDto(community, member).membership?.role).toBe('admin');
  });
});

describe('toBadgeDto', () => {
  it('несёт isPrimary: значок в профиле выбирается по нему, а не по порядку', () => {
    const badge = toBadgeDto(community, member);
    expect(badge.isPrimary).toBe(true);
    expect(badge.isVerified).toBe(true);
    expect(badge.title).toBe('координатор кухни');
  });
});

describe('toMemberDto', () => {
  it('имя собирается духовным, если оно есть', () => {
    const dto = toMemberDto({
      ...member,
      user: {
        name: 'Максим',
        spiritualName: 'Мадхава дас',
        avatarUrl: null,
        homeLocation: { city: 'Москва' },
      },
    });
    expect(dto.name).toBe('Мадхава дас');
    expect(dto.city).toBe('Москва');
  });

  it('без духовного имени показывается мирское, без города — null', () => {
    const dto = toMemberDto({
      ...member,
      user: {
        name: 'Максим',
        spiritualName: null,
        avatarUrl: null,
        homeLocation: null,
      },
    });
    expect(dto.name).toBe('Максим');
    expect(dto.city).toBeNull();
  });
});

describe('toMapPoint', () => {
  it('община без координат на карту не попадает', () => {
    expect(toMapPoint({ ...community, latitude: null })).toBeNull();
    expect(toMapPoint({ ...community, longitude: null })).toBeNull();
  });

  it('община с координатами становится точкой', () => {
    expect(toMapPoint(community)).toMatchObject({
      id: 'c1',
      lat: 55.75,
      lon: 37.62,
      membersCount: 42,
    });
  });
});

describe('toMembershipDto', () => {
  it('даты уезжают строками ISO', () => {
    const dto = toMembershipDto(member);
    expect(dto.joinedAt).toBe('2025-12-02T00:00:00.000Z');
    expect(dto.isPublic).toBe(true);
  });
});
