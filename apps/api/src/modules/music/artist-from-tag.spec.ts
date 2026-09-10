import {
  artistNameKey,
  groupTracksByArtist,
  normalizeArtistName,
} from './artist-from-tag';

describe('normalizeArtistName', () => {
  it('схлопывает пробелы и обрезает края', () => {
    expect(normalizeArtistName('  Aindra   Prabhu  ')).toBe('Aindra Prabhu');
  });

  it('снимает кавычки и тире, которыми обрамляют имя в раздачах', () => {
    expect(normalizeArtistName('- Aindra -')).toBe('Aindra');
    expect(normalizeArtistName('«Бхактивинода»')).toBe('Бхактивинода');
  });

  it('чистит невидимый мусор старых кодировщиков', () => {
    expect(normalizeArtistName(' Aindra﻿')).toBe('Aindra');
  });

  it('заглушки исполнителем не считаются', () => {
    // «Unknown Artist» в каталоге хуже пустоты: под ним собирается всё
    // подряд, и кружок ведёт в свалку.
    for (const noise of [
      'Unknown',
      'unknown artist',
      'Various Artists',
      'VA',
      'n/a',
      'None',
      '',
      '   ',
    ]) {
      expect(normalizeArtistName(noise)).toBeNull();
    }
  });

  it('номер дорожки и одиночная буква — не имя', () => {
    expect(normalizeArtistName('07')).toBeNull();
    expect(normalizeArtistName('A')).toBeNull();
  });

  it('не строка — нечего разбирать', () => {
    expect(normalizeArtistName(null)).toBeNull();
    expect(normalizeArtistName(undefined)).toBeNull();
  });

  it('длинное имя обрезается: это имя, а не описание', () => {
    expect(normalizeArtistName('и'.repeat(300))).toHaveLength(120);
  });
});

describe('artistNameKey', () => {
  it('регистр и «ё» одного человека не раздваивают', () => {
    expect(artistNameKey('Аиндра Прабху')).toBe(artistNameKey('аиндра прабху'));
    expect(artistNameKey('Тёма')).toBe(artistNameKey('Тема'));
  });
});

describe('groupTracksByArtist', () => {
  it('собирает записи одного исполнителя, как бы его ни написали', () => {
    const groups = groupTracksByArtist([
      { trackId: 't1', artistTag: 'Aindra Prabhu' },
      { trackId: 't2', artistTag: 'aindra  prabhu' },
      { trackId: 't3', artistTag: 'AINDRA PRABHU' },
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].trackIds).toEqual(['t1', 't2', 't3']);
    // В справочник идёт человеческое написание, а не крик.
    expect(groups[0].name).toBe('Aindra Prabhu');
  });

  it('записи без внятного тега в группы не попадают', () => {
    const groups = groupTracksByArtist([
      { trackId: 't1', artistTag: null },
      { trackId: 't2', artistTag: 'Unknown Artist' },
      { trackId: 't3', artistTag: 'Bhaktivinoda' },
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].trackIds).toEqual(['t3']);
  });

  it('первым идёт тот, у кого записей больше', () => {
    const groups = groupTracksByArtist([
      { trackId: 't1', artistTag: 'Один' },
      { trackId: 't2', artistTag: 'Много' },
      { trackId: 't3', artistTag: 'Много' },
    ]);

    expect(groups.map((group) => group.name)).toEqual(['Много', 'Один']);
  });

  it('пустой коллекции — пустой разбор', () => {
    expect(groupTracksByArtist([])).toEqual([]);
  });
});
