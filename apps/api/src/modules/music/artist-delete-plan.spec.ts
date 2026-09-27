import { parseWithTracks, planArtistDelete } from './artist-delete-plan';

describe('planArtistDelete (VED-576)', () => {
  it('собирает записи, альбомы, файлы и обложки', () => {
    const plan = planArtistDelete({
      artistCoverKey: 'covers/artist/a1.jpg',
      tracks: [
        { id: 't1', storageKey: 'music/t1.mp3', coverKey: 'covers/t1.jpg' },
        { id: 't2', storageKey: 'music/t2.mp3', coverKey: null },
      ],
      albums: [{ id: 'al1', coverKey: 'covers/album/al1.jpg' }],
    });

    expect(plan).toEqual({
      trackIds: ['t1', 't2'],
      albumIds: ['al1'],
      storageKeys: ['music/t1.mp3', 'music/t2.mp3'],
      coverKeys: [
        'covers/t1.jpg',
        'covers/album/al1.jpg',
        'covers/artist/a1.jpg',
      ],
    });
  });

  it('не удаляет один объект дважды', () => {
    const plan = planArtistDelete({
      artistCoverKey: 'covers/same.jpg',
      tracks: [
        { id: 't1', storageKey: 'music/same.mp3', coverKey: 'covers/same.jpg' },
        { id: 't2', storageKey: 'music/same.mp3', coverKey: null },
      ],
      albums: [],
    });

    expect(plan.storageKeys).toEqual(['music/same.mp3']);
    expect(plan.coverKeys).toEqual(['covers/same.jpg']);
  });

  it('пустой исполнитель — пустой план, кроме его обложки', () => {
    expect(
      planArtistDelete({ artistCoverKey: null, tracks: [], albums: [] }),
    ).toEqual({ trackIds: [], albumIds: [], storageKeys: [], coverKeys: [] });
  });
});

describe('parseWithTracks', () => {
  it.each([
    ['1', true],
    ['true', true],
    ['0', false],
    ['false', false],
    ['', false],
    [undefined, false],
  ])('%s → %s', (value, expected) => {
    expect(parseWithTracks(value)).toBe(expected);
  });
});
