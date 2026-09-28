import {
  decodeVideoCursor,
  DEFAULT_VIDEO_PAGE,
  encodeVideoCursor,
  MAX_VIDEO_PAGE,
  videoCategoryMenu,
  videoCursorWhere,
  videoPage,
  videoPageSize,
} from './video-feed';

describe('курсор ленты «Видео»', () => {
  it('туда и обратно без потерь', () => {
    const cursor = {
      createdAt: new Date('2026-09-01T10:00:00.000Z'),
      id: 'v1',
    };
    expect(decodeVideoCursor(encodeVideoCursor(cursor))).toEqual(cursor);
  });

  it('битый курсор — первая страница', () => {
    for (const raw of [
      undefined,
      '',
      'мусор',
      Buffer.from('{"t":"x","id":"a"}').toString('base64url'),
      Buffer.from('[]').toString('base64url'),
    ])
      expect(decodeVideoCursor(raw)).toBeNull();
  });

  it('условие «после» учитывает ролики с тем же временем', () => {
    const createdAt = new Date('2026-09-01T10:00:00.000Z');
    expect(videoCursorWhere({ createdAt, id: 'v5' })).toEqual({
      OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: 'v5' } }],
    });
    expect(videoCursorWhere(null)).toBeNull();
  });
});

describe('videoPageSize', () => {
  it('мусор — по умолчанию, край — потолок', () => {
    expect(videoPageSize(undefined)).toBe(DEFAULT_VIDEO_PAGE);
    expect(videoPageSize('0')).toBe(DEFAULT_VIDEO_PAGE);
    expect(videoPageSize('2.5')).toBe(DEFAULT_VIDEO_PAGE);
    expect(videoPageSize('5')).toBe(5);
    expect(videoPageSize('1000')).toBe(MAX_VIDEO_PAGE);
  });
});

describe('videoPage', () => {
  const rows = [3, 2, 1].map((n) => ({
    id: `v${n}`,
    createdAt: new Date(Date.UTC(2026, 8, n)),
  }));

  it('лишняя запись даёт курсор и сама не показывается', () => {
    const page = videoPage(rows, 2);
    expect(page.items.map((row) => row.id)).toEqual(['v3', 'v2']);
    expect(decodeVideoCursor(page.nextCursor)).toEqual({
      id: 'v2',
      createdAt: rows[1].createdAt,
    });
  });

  it('последняя страница — без курсора', () => {
    expect(videoPage(rows, 3).nextCursor).toBeNull();
    expect(videoPage([], 3)).toEqual({ items: [], nextCursor: null });
  });
});

describe('videoCategoryMenu', () => {
  const tree = [
    { id: 'root', slug: 'obshchaya', title: 'Общая', parentId: null },
    { id: 'a', slug: 'vedy', title: 'Веды', parentId: 'root' },
    { id: 'b', slug: 'praktika', title: 'Практика', parentId: 'root' },
    { id: 'c', slug: 'poslovitsy', title: 'Пословицы', parentId: null },
    { id: 'd', slug: 'sirota', title: 'Сирота', parentId: 'gone' },
  ];

  it('только папки с роликами и родители непустых подпапок', () => {
    const menu = videoCategoryMenu(
      tree,
      new Map([
        ['vedy', 2],
        ['sirota', 1],
      ]),
    );
    expect(menu.map((c) => [c.slug, c.videoCount, c.parentId])).toEqual([
      ['obshchaya', 0, null],
      ['vedy', 2, 'root'],
      // Родителя нет в справочнике — подпапка поднимается наверх.
      ['sirota', 1, null],
    ]);
  });

  it('без роликов меню пустое', () => {
    expect(videoCategoryMenu(tree, new Map())).toEqual([]);
  });
});
