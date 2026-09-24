import {
  dueAction,
  parsePostImages,
  pickChannelAuthor,
  planPublished,
  planWithdrawn,
} from './official-post-plan';

const now = new Date('2026-09-24T10:00:00Z');
const later = new Date('2026-09-25T10:00:00Z');
const earlier = new Date('2026-09-23T10:00:00Z');
const fresh = { firstPublication: true, publishAt: null, expiresAt: null };

describe('planPublished', () => {
  it('первая публикация без расписания — пост сейчас', () => {
    expect(planPublished(null, fresh, now)).toEqual({
      kind: 'create',
      publishAt: now,
    });
  });

  it('отложенная новость — пост в назначенное время, не раньше', () => {
    expect(planPublished(null, { ...fresh, publishAt: later }, now)).toEqual({
      kind: 'create',
      publishAt: later,
    });
  });

  it('время публикации уже прошло — пост сейчас, а не задним числом', () => {
    expect(planPublished(null, { ...fresh, publishAt: earlier }, now)).toEqual({
      kind: 'create',
      publishAt: now,
    });
  });

  it('срок показа кончился — скрытое от всех в канал не идёт', () => {
    expect(
      planPublished(null, { ...fresh, expiresAt: earlier }, now).kind,
    ).toBe('ignore');
    expect(planPublished(null, { ...fresh, expiresAt: now }, now).kind).toBe(
      'ignore',
    );
  });

  it('правка новости, которой в канале нет, свежей не становится', () => {
    expect(
      planPublished(null, { ...fresh, firstPublication: false }, now).kind,
    ).toBe('ignore');
  });

  it('повтор события о той же новости — не второй пост', () => {
    for (const status of ['pending', 'failed', 'skipped'])
      expect(
        planPublished({ status, messageId: null }, fresh, now).kind,
      ).toBe('reschedule');
    expect(
      planPublished({ status: 'posted', messageId: 'm1' }, fresh, now).kind,
    ).toBe('edit');
    expect(
      planPublished({ status: 'posting', messageId: null }, fresh, now).kind,
    ).toBe('ignore');
  });

  it('вышедший пост правится вместе с новостью', () => {
    expect(
      planPublished(
        { status: 'posted', messageId: 'm1' },
        { ...fresh, firstPublication: false },
        now,
      ),
    ).toEqual({ kind: 'edit' });
  });

  it('правка вышедшего поста — даже когда срок показа уже кончился', () => {
    expect(
      planPublished(
        { status: 'posted', messageId: 'm1' },
        { ...fresh, firstPublication: false, expiresAt: earlier },
        now,
      ),
    ).toEqual({ kind: 'edit' });
  });

  it('пост, чьё сообщение удалили, не воскресает правкой', () => {
    expect(
      planPublished(
        { status: 'posted', messageId: null },
        { ...fresh, firstPublication: false },
        now,
      ).kind,
    ).toBe('ignore');
  });

  it('снятую и опубликованную снова новость пост догоняет заново', () => {
    expect(
      planPublished({ status: 'cancelled', messageId: null }, fresh, now),
    ).toEqual({ kind: 'reschedule', publishAt: now });
    expect(
      planPublished(
        { status: 'cancelled', messageId: null },
        { ...fresh, firstPublication: false },
        now,
      ).kind,
    ).toBe('ignore');
  });

  it('незнакомый статус — ничего не делать', () => {
    expect(
      planPublished({ status: 'weird', messageId: null }, fresh, now).kind,
    ).toBe('ignore');
  });
});

describe('planWithdrawn', () => {
  it('нет поста — нечего снимать', () => {
    expect(planWithdrawn(null)).toEqual({ kind: 'ignore' });
  });

  it('вышедший пост — удалить сообщение', () => {
    expect(planWithdrawn({ status: 'posted', messageId: 'm1' })).toEqual({
      kind: 'delete-message',
      messageId: 'm1',
    });
  });

  it('невышедший — отменить', () => {
    for (const status of ['pending', 'posting', 'failed', 'skipped'])
      expect(planWithdrawn({ status, messageId: null })).toEqual({
        kind: 'cancel',
      });
    expect(planWithdrawn({ status: 'posted', messageId: null })).toEqual({
      kind: 'cancel',
    });
  });

  it('уже снятый — второй раз не трогаем', () => {
    expect(planWithdrawn({ status: 'cancelled', messageId: null })).toEqual({
      kind: 'ignore',
    });
  });
});

describe('dueAction', () => {
  it('срок показа кончился, пока пост ждал, — пропустить', () => {
    expect(dueAction({ expiresAt: earlier }, now)).toBe('skip');
    expect(dueAction({ expiresAt: now }, now)).toBe('skip');
  });

  it('без срока или в сроке — публиковать', () => {
    expect(dueAction({ expiresAt: null }, now)).toBe('post');
    expect(dueAction({ expiresAt: later }, now)).toBe('post');
  });
});

describe('pickChannelAuthor', () => {
  it('опубликовавший админ пишет сам, если он администратор канала', () => {
    expect(pickChannelAuthor(['a1', 'a2'], 'a2')).toBe('a2');
  });

  it('не администратор канала — первый по вступлению', () => {
    expect(pickChannelAuthor(['a1', 'a2'], 'agent')).toBe('a1');
    expect(pickChannelAuthor(['a1'], null)).toBe('a1');
  });

  it('админов нет — писать некому', () => {
    expect(pickChannelAuthor([], 'a1')).toBeNull();
  });
});

describe('parsePostImages', () => {
  it('берёт картинки и отбрасывает мусор', () => {
    expect(
      parsePostImages([
        { url: 'https://s3/a.webp', width: 10, height: 20 },
        { url: '' },
        null,
        'x',
        { url: 'https://s3/b.webp', width: -1 },
      ]),
    ).toEqual([
      { url: 'https://s3/a.webp', width: 10, height: 20 },
      { url: 'https://s3/b.webp', width: 0, height: 0 },
    ]);
    expect(parsePostImages(null)).toEqual([]);
  });
});
