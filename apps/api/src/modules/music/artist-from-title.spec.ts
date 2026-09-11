import {
  resolveTrackArtist,
  splitArtistFromTitle,
  titleWithoutArtist,
} from './artist-from-title';

describe('splitArtistFromTitle', () => {
  it('делит «исполнитель - название»', () => {
    expect(splitArtistFromTitle('Jahnavi dasi - Maha Mantra')).toEqual({
      artist: 'Jahnavi dasi',
      title: 'Maha Mantra',
    });
  });

  it('понимает длинное и короткое тире', () => {
    expect(splitArtistFromTitle('Aindra — Hare Krishna')?.artist).toBe(
      'Aindra',
    );
    expect(splitArtistFromTitle('Aindra – Hare Krishna')?.artist).toBe(
      'Aindra',
    );
  });

  // Дальше первого тире — часть названия: «Maha Mantra - Live».
  it('оставляет в названии всё после первого тире', () => {
    expect(splitArtistFromTitle('Jahnavi dasi - Maha Mantra - Live')).toEqual({
      artist: 'Jahnavi dasi',
      title: 'Maha Mantra - Live',
    });
  });

  it('пропускает номер дорожки в начале', () => {
    expect(
      splitArtistFromTitle('01 - Jahnavi dasi - Maha Mantra')?.artist,
    ).toBe('Jahnavi dasi');
    expect(splitArtistFromTitle('07. Jahnavi dasi - Maha Mantra')?.artist).toBe(
      'Jahnavi dasi',
    );
    expect(splitArtistFromTitle('03 - Maha Mantra')).toBeNull();
  });

  // «Hare-Krishna» — одно слово, а не «кто - что».
  it('не режет по дефису внутри слова', () => {
    expect(splitArtistFromTitle('Hare-Krishna Kirtan')).toBeNull();
  });

  it('не принимает за имя заглушку, цифры и слишком длинную фразу', () => {
    expect(splitArtistFromTitle('Unknown Artist - Maha Mantra')).toBeNull();
    expect(splitArtistFromTitle('2019 - Maha Mantra')).toBeNull();
    expect(
      splitArtistFromTitle(
        'Шри Шри Шикшаштака с комментарием на санскрите и русском - часть 2',
      ),
    ).toBeNull();
  });

  it('без названия после тире — не делит', () => {
    expect(splitArtistFromTitle('Jahnavi dasi - ')).toBeNull();
    expect(splitArtistFromTitle('Maha Mantra')).toBeNull();
    expect(splitArtistFromTitle(null)).toBeNull();
  });
});

describe('titleWithoutArtist', () => {
  it('убирает имя исполнителя, если впереди стоит именно оно', () => {
    expect(titleWithoutArtist('aindra - Hare Krishna', 'Aindra')).toBe(
      'Hare Krishna',
    );
  });

  // Чужое имя впереди — часть названия: «Bhaktivinoda - Gitavali» у Aindra.
  it('чужое имя впереди не трогает', () => {
    expect(titleWithoutArtist('Bhaktivinoda - Gitavali', 'Aindra')).toBe(
      'Bhaktivinoda - Gitavali',
    );
  });
});

describe('resolveTrackArtist', () => {
  it('тег сильнее названия', () => {
    expect(
      resolveTrackArtist({
        artistTag: 'Aindra',
        title: 'Jahnavi dasi - Maha Mantra',
      }),
    ).toEqual({ name: 'Aindra', from: 'tag', title: null });
  });

  it('с тегом чистит из названия повтор того же имени', () => {
    expect(
      resolveTrackArtist({
        artistTag: 'Aindra',
        title: 'Aindra - Hare Krishna',
      }),
    ).toEqual({ name: 'Aindra', from: 'tag', title: 'Hare Krishna' });
  });

  it('без тега берёт имя из названия', () => {
    expect(
      resolveTrackArtist({
        artistTag: 'Unknown Artist',
        title: 'Jahnavi dasi - Maha Mantra',
      }),
    ).toEqual({ name: 'Jahnavi dasi', from: 'title', title: 'Maha Mantra' });
  });

  it('ни тега, ни имени в названии — исполнителя нет', () => {
    expect(
      resolveTrackArtist({ artistTag: null, title: 'Maha Mantra' }),
    ).toBeNull();
  });
});
