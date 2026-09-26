import {
  parseWithAvatarKeys,
  stringifyWithAvatarKeys,
} from './chat-avatar-key';
import { toUserSummary } from './chat-dto';
import {
  collectAvatarKeys,
  collectStorageUrls,
  replaceStorageUrls,
} from './chat-signed-urls';

const PREFIX = 'https://s3.example/bucket/';

describe('collectStorageUrls', () => {
  it('находит адреса на любой глубине и без повторов', () => {
    const payload = {
      messages: [
        {
          attachments: [{ url: `${PREFIX}a.webp` }, { url: `${PREFIX}b.ogg` }],
        },
        { attachments: [{ url: `${PREFIX}a.webp`, previewUrl: null }] },
      ],
      conversation: { avatarUrl: `${PREFIX}c.webp` },
    };

    expect(collectStorageUrls(payload, PREFIX)).toEqual([
      `${PREFIX}a.webp`,
      `${PREFIX}b.ogg`,
      `${PREFIX}c.webp`,
    ]);
  });

  it('чужие адреса не трогает: аватар из Google остаётся собой', () => {
    const payload = { avatarUrl: 'https://lh3.googleusercontent.com/a/x' };
    expect(collectStorageUrls(payload, PREFIX)).toEqual([]);
  });

  it('не спотыкается о даты и null', () => {
    expect(
      collectStorageUrls({ createdAt: new Date(0), body: null }, PREFIX),
    ).toEqual([]);
  });
});

describe('replaceStorageUrls', () => {
  const signed = new Map([[`${PREFIX}a.webp`, `${PREFIX}a.webp?sig=1`]]);

  it('меняет известные адреса и оставляет остальные', () => {
    const payload = {
      attachments: [{ url: `${PREFIX}a.webp` }, { url: `${PREFIX}b.ogg` }],
    };

    expect(replaceStorageUrls(payload, signed)).toEqual({
      attachments: [
        { url: `${PREFIX}a.webp?sig=1` },
        { url: `${PREFIX}b.ogg` },
      ],
    });
  });

  it('не правит исходный объект', () => {
    const payload = { url: `${PREFIX}a.webp` };
    replaceStorageUrls(payload, signed);
    expect(payload.url).toBe(`${PREFIX}a.webp`);
  });

  it('даты остаются датами, а не рассыпаются по ключам', () => {
    const at = new Date('2026-08-22T10:00:00.000Z');
    const result = replaceStorageUrls({ at }, signed) as { at: Date };
    expect(result.at).toBe(at);
  });
});

describe('загруженные фото людей (VED-492)', () => {
  const summary = (id: string, avatarKey: string | null) =>
    toUserSummary({
      id,
      name: id,
      spiritualName: null,
      avatarUrl: null,
      avatarKey,
    });

  it('ключ фото едет к перехватчику, но не в JSON', () => {
    const dto = summary('anna', 'users/anna/avatar.webp');
    expect(dto.avatarUrl).toBeNull();
    expect(JSON.stringify(dto)).not.toContain('users/anna');
  });

  it('ключи собираются без повторов, на любой глубине', () => {
    const payload = {
      messages: [
        { author: summary('anna', 'users/anna/avatar.webp') },
        { author: summary('anna', 'users/anna/avatar.webp') },
        { author: summary('boris', null) },
      ],
    };
    expect(collectAvatarKeys(payload)).toEqual(['users/anna/avatar.webp']);
  });

  it('помеченный человек получает подписанную ссылку, остальные — как были', () => {
    const payload = {
      author: summary('anna', 'users/anna/avatar.webp'),
      other: summary('boris', null),
    };
    const result = replaceStorageUrls(
      payload,
      new Map(),
      new Map([['users/anna/avatar.webp', 'https://signed/anna']]),
    ) as typeof payload;
    expect(result.author.avatarUrl).toBe('https://signed/anna');
    expect(result.other.avatarUrl).toBeNull();
    // Исходный DTO не тронут — правится копия.
    expect(payload.author.avatarUrl).toBeNull();
  });

  it('пометка переживает шину между инстансами и не видна в JSON снаружи', () => {
    const event = { message: { author: summary('anna', 'users/anna/a.webp') } };
    const wire = stringifyWithAvatarKeys(event);
    const back = parseWithAvatarKeys(wire) as typeof event;
    expect(collectAvatarKeys(back)).toEqual(['users/anna/a.webp']);
    expect(JSON.stringify(back)).not.toContain('users/anna');
    expect(back.message.author).toEqual({
      id: 'anna',
      name: 'anna',
      avatarUrl: null,
      lastSeenAt: null,
    });
  });
});
