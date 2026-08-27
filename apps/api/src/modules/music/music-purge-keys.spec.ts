import { collectMusicPurgeKeys } from './music-purge-keys';

const empty = { tracks: [], uploads: [], playlists: [] };

describe('collectMusicPurgeKeys', () => {
  it('на пустом входе не отдаёт ничего', () => {
    expect(collectMusicPurgeKeys(empty)).toEqual({
      storageKeys: [],
      counts: { musicTracks: 0, musicTracksKept: 0 },
    });
  });

  it('файл опубликованной записи не отдаёт — каталог принадлежит порталу', () => {
    const result = collectMusicPurgeKeys({
      ...empty,
      tracks: [{ storageKey: 'music/a.mp3', publishedAt: new Date() }],
    });

    expect(result.storageKeys).toEqual([]);
    expect(result.counts).toEqual({ musicTracks: 0, musicTracksKept: 1 });
  });

  it('снятая с витрины запись тоже остаётся: она была в каталоге', () => {
    const result = collectMusicPurgeKeys({
      ...empty,
      // Статуса здесь нет намеренно — решает факт публикации.
      tracks: [
        { storageKey: 'music/hidden.mp3', publishedAt: new Date('2026-01-01') },
      ],
    });

    expect(result.storageKeys).toEqual([]);
    expect(result.counts.musicTracksKept).toBe(1);
  });

  it('неопубликованную забирает вместе с файлом', () => {
    const result = collectMusicPurgeKeys({
      ...empty,
      tracks: [{ storageKey: 'music/pending.mp3', publishedAt: null }],
    });

    expect(result.storageKeys).toEqual(['music/pending.mp3']);
    expect(result.counts).toEqual({ musicTracks: 1, musicTracksKept: 0 });
  });

  it('забирает брошенные загрузки и обложки плейлистов', () => {
    const result = collectMusicPurgeKeys({
      tracks: [],
      uploads: [{ storageKey: 'music/uploads/abandoned.mp3' }],
      playlists: [{ coverKey: 'music/covers/p1.jpg' }, { coverKey: null }],
    });

    expect(result.storageKeys).toEqual([
      'music/uploads/abandoned.mp3',
      'music/covers/p1.jpg',
    ]);
  });

  it('общий ключ записи и её загрузки не отдаёт дважды', () => {
    const result = collectMusicPurgeKeys({
      ...empty,
      tracks: [{ storageKey: 'music/same.mp3', publishedAt: null }],
      uploads: [{ storageKey: 'music/same.mp3' }],
    });

    expect(result.storageKeys).toEqual(['music/same.mp3']);
  });

  it('ключ оставшейся записи не утекает через строку загрузки', () => {
    // Запись успели опубликовать, а строка загрузки при ней осталась —
    // без этой проверки её ключ ушёл бы на удаление и снёс файл из каталога.
    const result = collectMusicPurgeKeys({
      ...empty,
      tracks: [{ storageKey: 'music/published.mp3', publishedAt: new Date() }],
      uploads: [{ storageKey: 'music/published.mp3' }],
    });

    expect(result.storageKeys).toEqual([]);
    expect(result.counts.musicTracksKept).toBe(1);
  });

  it('разделяет оставшееся и уходящее в одном аккаунте', () => {
    const result = collectMusicPurgeKeys({
      ...empty,
      tracks: [
        { storageKey: 'music/kept.mp3', publishedAt: new Date() },
        { storageKey: 'music/draft.mp3', publishedAt: null },
        { storageKey: 'music/rejected.mp3', publishedAt: null },
      ],
    });

    expect(result.storageKeys).toEqual([
      'music/draft.mp3',
      'music/rejected.mp3',
    ]);
    expect(result.counts).toEqual({ musicTracks: 2, musicTracksKept: 1 });
  });

  it('пустые ключи в план не попадают', () => {
    const result = collectMusicPurgeKeys({
      ...empty,
      tracks: [{ storageKey: '', publishedAt: null }],
      playlists: [{ coverKey: '' }],
    });

    expect(result.storageKeys).toEqual([]);
  });
});
