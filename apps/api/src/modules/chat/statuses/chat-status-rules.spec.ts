import type { ChatUserSummary } from '@vedamatch/shared';
import {
  buildStatusFeed,
  statusExpiresAt,
  statusMediaKindFor,
  statusRings,
  statusText,
  statusUploadDenial,
  statusVideoDurationDenial,
  type StatusRow,
} from './chat-status-rules';

const at = (hour: number) => new Date(Date.UTC(2026, 8, 24, hour));

function row(over: Partial<StatusRow>): StatusRow {
  return {
    id: 's',
    authorId: 'a',
    text: 'Харе Кришна',
    mediaKind: null,
    mediaUrl: null,
    posterUrl: null,
    width: null,
    height: null,
    durationSec: null,
    createdAt: at(10),
    expiresAt: at(34),
    viewedByViewer: false,
    viewCount: 0,
    ...over,
  };
}

const users = new Map<string, ChatUserSummary>([
  ['me', { id: 'me', name: 'Я' }],
  ['a', { id: 'a', name: 'Анна' }],
  ['b', { id: 'b', name: 'Борис' }],
]);

describe('статусы: что принимается (VED-129)', () => {
  it('фото и видео — да, остальное — нет', () => {
    expect(statusMediaKindFor('image/jpeg')).toBe('photo');
    expect(statusMediaKindFor('video/mp4')).toBe('video');
    expect(statusMediaKindFor('image/gif')).toBeNull();
    expect(statusMediaKindFor('application/pdf')).toBeNull();
  });

  it('пределы размера', () => {
    expect(
      statusUploadDenial({ mimetype: 'image/png', size: 1000 }),
    ).toBeNull();
    expect(
      statusUploadDenial({ mimetype: 'image/png', size: 11 * 1024 * 1024 }),
    ).toMatch(/10 МБ/);
    expect(
      statusUploadDenial({ mimetype: 'video/mp4', size: 51 * 1024 * 1024 }),
    ).toMatch(/50 МБ/);
    expect(statusUploadDenial({ mimetype: 'text/plain', size: 1 })).toMatch(
      /фото/,
    );
  });

  it('видео не длиннее минуты и должно читаться', () => {
    expect(statusVideoDurationDenial(60)).toBeNull();
    expect(statusVideoDurationDenial(61)).toMatch(/60 секунд/);
    expect(statusVideoDurationDenial(null)).toMatch(/прочитать/);
  });

  it('текст: обрезается, пустой статус без файла не публикуется', () => {
    expect(statusText('  привет  ', false)).toEqual({ text: 'привет' });
    expect(statusText('', true)).toEqual({ text: null });
    expect(statusText('   ', false)).toHaveProperty('denial');
    expect(statusText('а'.repeat(701), true)).toHaveProperty('denial');
  });

  it('живёт сутки', () => {
    expect(statusExpiresAt(at(10)).getTime() - at(10).getTime()).toBe(
      24 * 3_600_000,
    );
  });
});

describe('лента и кружки', () => {
  it('свои — отдельно, у своих все просмотрены и видно число просмотров', () => {
    const feed = buildStatusFeed(
      [row({ id: 'm1', authorId: 'me', viewCount: 3 })],
      users,
      'me',
    );
    expect(feed.mine?.statuses[0]).toMatchObject({
      viewed: true,
      viewCount: 3,
    });
    expect(feed.mine?.unseen).toBe(0);
    expect(feed.others).toEqual([]);
  });

  it('у чужих число просмотров скрыто, статусы — по порядку публикации', () => {
    const feed = buildStatusFeed(
      [
        row({ id: 'a2', authorId: 'a', createdAt: at(12) }),
        row({
          id: 'a1',
          authorId: 'a',
          createdAt: at(11),
          viewedByViewer: true,
        }),
      ],
      users,
      'me',
    );
    const anna = feed.others[0];
    expect(anna.statuses.map((status) => status.id)).toEqual(['a1', 'a2']);
    expect(anna.statuses[0].viewCount).toBeNull();
    expect(anna.unseen).toBe(1);
  });

  it('сначала с непросмотренным, среди равных — свежее выше', () => {
    const feed = buildStatusFeed(
      [
        row({
          id: 'a1',
          authorId: 'a',
          createdAt: at(15),
          viewedByViewer: true,
        }),
        row({ id: 'b1', authorId: 'b', createdAt: at(9) }),
      ],
      users,
      'me',
    );
    expect(feed.others.map((entry) => entry.user.id)).toEqual(['b', 'a']);
  });

  it('авторы, которых нет в списке пользователей (заблокированы), пропадают', () => {
    const feed = buildStatusFeed([row({ authorId: 'blocked' })], users, 'me');
    expect(feed.others).toEqual([]);
  });

  it('кружок: секции по числу статусов, зелёные — непросмотренные', () => {
    expect(
      statusRings(
        [
          { authorId: 'a', viewedByViewer: false },
          { authorId: 'a', viewedByViewer: true },
          { authorId: 'me', viewedByViewer: false },
        ],
        'me',
      ),
    ).toEqual({ a: { total: 2, unseen: 1 }, me: { total: 1, unseen: 0 } });
  });
});
