import type { CommunityBadgeDto } from '@vedamatch/shared';
import { sortMemberships } from './communities-list-state';

function badge(id: string, name: string, extra: Partial<CommunityBadgeDto> = {}): CommunityBadgeDto {
  return {
    id,
    slug: id,
    name,
    kind: 'yatra',
    city: null,
    isVerified: false,
    role: 'member',
    title: null,
    isPrimary: false,
    ...extra,
  };
}

describe('sortMemberships', () => {
  it('основная община (isPrimary) всегда первая', () => {
    const sorted = sortMemberships([badge('a', 'Ашрам Вриндавана'), badge('b', 'Ятра Гокулы', { isPrimary: true })]);
    expect(sorted.map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('остальные — по алфавиту, без учёта регистра русских букв', () => {
    const sorted = sortMemberships([badge('a', 'Ятра'), badge('b', 'Ашрам'), badge('c', 'Клуб')]);
    expect(sorted.map((c) => c.id)).toEqual(['b', 'c', 'a']);
  });

  it('пустой список не падает', () => {
    expect(sortMemberships([])).toEqual([]);
  });
});
