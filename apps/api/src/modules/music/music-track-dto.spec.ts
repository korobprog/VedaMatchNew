import {
  buildCoverUrl,
  resolveTrackCoverKey,
  toMusicAlbumDto,
  toMusicArtistDto,
  toMusicCategoryDto,
  toMusicTrackDetailDto,
  toMusicTrackDto,
} from './music-track-dto';
import type {
  MusicAlbumRow,
  MusicArtistRow,
  MusicTrackDetailRow,
  MusicTrackRow,
} from './music-track-dto';

const BASE = 'https://cdn.example.org/bucket';

const artist: MusicArtistRow = {
  id: 'a1',
  slug: 'audarya-dhama-das',
  name: 'Аударья Дхама дас',
  kind: 'kirtaneer',
  bio: null,
  isVerified: true,
  coverKey: 'music/artists/a1.jpg',
};

const album: MusicAlbumRow = {
  id: 'al1',
  slug: 'gaura-arati-2026',
  title: 'Гаура-арати, Минск 2026',
  kind: 'live',
  year: 2026,
  artist,
  coverKey: 'music/albums/al1.jpg',
};

const track: MusicTrackRow = {
  id: 't1',
  title: 'Джая Радха-Мадхава',
  durationSeconds: 198,
  language: 'sa',
  isLiveRecording: true,
  lineage: 'iskcon',
  playCount: 12,
  publishedAt: new Date('2026-08-27T10:00:00.000Z'),
  artist,
  album,
  categories: [
    {
      category: {
        id: 'c1',
        slug: 'kirtan',
        title: 'Киртан',
        position: 0,
        kind: 'style',
      },
    },
  ],
  coverKey: 'music/tracks/t1.jpg',
};

describe('buildCoverUrl', () => {
  it('склеивает базу и ключ', () => {
    expect(buildCoverUrl(BASE, 'music/x.jpg')).toBe(
      'https://cdn.example.org/bucket/music/x.jpg',
    );
  });

  it('не удваивает косую черту', () => {
    expect(buildCoverUrl(`${BASE}/`, 'music/x.jpg')).toBe(
      'https://cdn.example.org/bucket/music/x.jpg',
    );
  });

  it('без ключа и без настроенного бакета отдаёт null, а не битую ссылку', () => {
    expect(buildCoverUrl(BASE, null)).toBeNull();
    expect(buildCoverUrl(undefined, 'music/x.jpg')).toBeNull();
  });
});

describe('resolveTrackCoverKey', () => {
  it('берёт свою обложку, когда она есть', () => {
    expect(resolveTrackCoverKey(track)).toBe('music/tracks/t1.jpg');
  });

  it('без своей падает на альбомную', () => {
    expect(resolveTrackCoverKey({ ...track, coverKey: null })).toBe(
      'music/albums/al1.jpg',
    );
  });

  it('без альбомной падает на обложку исполнителя', () => {
    expect(
      resolveTrackCoverKey({
        ...track,
        coverKey: null,
        album: { ...album, coverKey: null },
      }),
    ).toBe('music/artists/a1.jpg');
  });

  it('когда взять неоткуда — null', () => {
    expect(
      resolveTrackCoverKey({
        ...track,
        coverKey: null,
        album: null,
        artist: null,
      }),
    ).toBeNull();
  });
});

describe('toMusicTrackDto', () => {
  it('собирает карточку каталога', () => {
    expect(toMusicTrackDto(track, BASE)).toEqual({
      id: 't1',
      title: 'Джая Радха-Мадхава',
      artist: {
        id: 'a1',
        slug: 'audarya-dhama-das',
        name: 'Аударья Дхама дас',
      },
      album: {
        id: 'al1',
        slug: 'gaura-arati-2026',
        title: 'Гаура-арати, Минск 2026',
      },
      categories: [{ id: 'c1', slug: 'kirtan', title: 'Киртан' }],
      durationSeconds: 198,
      coverUrl: 'https://cdn.example.org/bucket/music/tracks/t1.jpg',
      language: 'sa',
      isLiveRecording: true,
      lineage: 'iskcon',
      playCount: 12,
      publishedAt: '2026-08-27T10:00:00.000Z',
    });
  });

  it('не выносит наружу ключ объекта в бакете', () => {
    expect(toMusicTrackDto(track, BASE)).not.toHaveProperty('storageKey');
    expect(toMusicTrackDto(track, BASE)).not.toHaveProperty('coverKey');
  });

  it('переживает запись без исполнителя, альбома и категорий', () => {
    const bare: MusicTrackRow = {
      ...track,
      artist: null,
      album: null,
      categories: [],
      coverKey: null,
      publishedAt: null,
    };

    expect(toMusicTrackDto(bare, BASE)).toMatchObject({
      artist: null,
      album: null,
      categories: [],
      coverUrl: null,
      publishedAt: null,
    });
  });
});

describe('toMusicTrackDetailDto', () => {
  it('добавляет тексты и служебные поля к карточке', () => {
    const detail: MusicTrackDetailRow = {
      ...track,
      status: 'published',
      sizeBytes: 4_812_000,
      bitrateKbps: 192,
      lyrics: 'jaya radha-madhava',
      transliteration: null,
      translation: 'Слава Радхе и Мадхаве',
      moderationNote: null,
    };

    expect(toMusicTrackDetailDto(detail, BASE)).toMatchObject({
      id: 't1',
      status: 'published',
      sizeBytes: 4_812_000,
      bitrateKbps: 192,
      lyrics: {
        lyrics: 'jaya radha-madhava',
        transliteration: null,
        translation: 'Слава Радхе и Мадхаве',
      },
    });
  });
});

describe('toMusicArtistDto', () => {
  it('кладёт счётчик записей рядом с исполнителем', () => {
    expect(toMusicArtistDto(artist, 7, BASE)).toEqual({
      id: 'a1',
      slug: 'audarya-dhama-das',
      name: 'Аударья Дхама дас',
      kind: 'kirtaneer',
      bio: null,
      coverUrl: 'https://cdn.example.org/bucket/music/artists/a1.jpg',
      isVerified: true,
      trackCount: 7,
      rootCategoryId: null,
    });
  });

  // VED-165-2: корневая категория переехала с записи на исполнителя —
  // молчаливая потеря поля на полпути к DTO значила бы, что вкладки
  // «Традиционное»/«Современное» на его странице не видят разметку.
  it('прокидывает rootCategoryId, когда он проставлен', () => {
    expect(
      toMusicArtistDto({ ...artist, rootCategoryId: 'root-1' }, 0, BASE),
    ).toMatchObject({ rootCategoryId: 'root-1' });
  });
});

describe('toMusicAlbumDto', () => {
  it('без своей обложки берёт обложку исполнителя', () => {
    const dto = toMusicAlbumDto({ ...album, coverKey: null }, 3, BASE);

    expect(dto.coverUrl).toBe(
      'https://cdn.example.org/bucket/music/artists/a1.jpg',
    );
  });
});

// VED-165: `kind` — единственное новое поле категории, и его молчаливая
// потеря на полпути к DTO значила бы, что фильтр «Стиль» вдруг не отличает
// корневые категории от стилевых.
describe('toMusicCategoryDto', () => {
  it('прокидывает kind как есть — и root, и style', () => {
    expect(
      toMusicCategoryDto(
        {
          id: 'c1',
          slug: 'traditional',
          title: 'Традиционное',
          position: 0,
          kind: 'root',
        },
        5,
      ),
    ).toEqual({
      id: 'c1',
      slug: 'traditional',
      title: 'Традиционное',
      position: 0,
      kind: 'root',
      trackCount: 5,
    });

    expect(
      toMusicCategoryDto(
        {
          id: 'c2',
          slug: 'mantra',
          title: 'Мантра',
          position: 2,
          kind: 'style',
        },
        0,
      ).kind,
    ).toBe('style');
  });
});
