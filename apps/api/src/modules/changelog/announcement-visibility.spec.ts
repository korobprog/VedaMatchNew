import {
  announcementSortDate,
  isAnnouncementVisible,
  visibleAnnouncementWhere,
} from './announcement-visibility';

const now = new Date('2026-08-20T12:00:00.000Z');
const at = (iso: string) => new Date(iso);

function announcement(overrides: Partial<Parameters<typeof isAnnouncementVisible>[0]> = {}) {
  return {
    status: 'published',
    publishedAt: at('2026-08-20T10:00:00.000Z'),
    publishAt: null,
    expiresAt: null,
    ...overrides,
  };
}

describe('isAnnouncementVisible', () => {
  it('показывает опубликованное без расписания', () => {
    expect(isAnnouncementVisible(announcement(), now)).toBe(true);
  });

  it('черновик не показывает никогда', () => {
    expect(isAnnouncementVisible(announcement({ status: 'draft' }), now)).toBe(
      false,
    );
  });

  it('держит отложенную новость до назначенного времени', () => {
    const item = announcement({ publishAt: at('2026-08-20T18:00:00.000Z') });
    expect(isAnnouncementVisible(item, now)).toBe(false);
    expect(isAnnouncementVisible(item, at('2026-08-20T18:00:00.000Z'))).toBe(
      true,
    );
  });

  it('снимает новость, когда срок вышел', () => {
    const item = announcement({ expiresAt: at('2026-08-20T11:59:00.000Z') });
    expect(isAnnouncementVisible(item, now)).toBe(false);
  });

  it('в последнюю минуту срока новость ещё видна', () => {
    // Граница включительная с одной стороны и исключительная с другой:
    // «показать с 18:00 до 20:00» не должно давать дырку в 20:00:00.
    expect(
      isAnnouncementVisible(
        announcement({ expiresAt: at('2026-08-20T12:00:01.000Z') }),
        now,
      ),
    ).toBe(true);
    expect(
      isAnnouncementVisible(
        announcement({ expiresAt: at('2026-08-20T12:00:00.000Z') }),
        now,
      ),
    ).toBe(false);
  });
});

describe('visibleAnnouncementWhere', () => {
  it('собирает условие из статуса и обеих границ', () => {
    expect(visibleAnnouncementWhere(now)).toEqual({
      status: 'published',
      AND: [
        { OR: [{ publishAt: null }, { publishAt: { lte: now } }] },
        { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      ],
    });
  });
});

describe('announcementSortDate', () => {
  const createdAt = at('2026-08-01T00:00:00.000Z');

  it('у отложенной берёт назначенное время', () => {
    expect(
      announcementSortDate({
        publishAt: at('2026-08-20T18:00:00.000Z'),
        publishedAt: at('2026-08-19T00:00:00.000Z'),
        createdAt,
      }),
    ).toEqual(at('2026-08-20T18:00:00.000Z'));
  });

  it('иначе — фактическую публикацию', () => {
    expect(
      announcementSortDate({
        publishAt: null,
        publishedAt: at('2026-08-19T00:00:00.000Z'),
        createdAt,
      }),
    ).toEqual(at('2026-08-19T00:00:00.000Z'));
  });

  it('у старых записей без даты публикации — создание', () => {
    expect(
      announcementSortDate({ publishAt: null, publishedAt: null, createdAt }),
    ).toEqual(createdAt);
  });
});
