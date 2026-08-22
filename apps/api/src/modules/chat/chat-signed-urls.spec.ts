import { collectStorageUrls, replaceStorageUrls } from './chat-signed-urls';

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
