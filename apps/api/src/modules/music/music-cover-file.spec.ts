import {
  MUSIC_COVER_CACHE_CONTROL,
  musicCoverContentType,
  musicCoverKeyFrom,
} from './music-cover-file';

const owner = '33e14d6e-ebd9-46e9-99b9-fa206816895b';
const file = '72fb3738-4d1e-4ded-81b6-e5e38f79c3f7.jpg';

describe('musicCoverKeyFrom', () => {
  it('собирает ключ обложки из частей адреса', () => {
    expect(musicCoverKeyFrom({ scope: 'track', owner, file })).toBe(
      `music/covers/track/${owner}/${file}`,
    );
  });

  it('знает все виды обложек', () => {
    for (const scope of ['track', 'artist', 'album', 'playlist']) {
      expect(musicCoverKeyFrom({ scope, owner, file })).not.toBeNull();
    }
  });

  // Маршрут открыт гостю и читает файлы нашими ключами: свободная строка
  // здесь означала бы выдачу любого объекта бакета.
  it('не выпускает за пределы обложек', () => {
    expect(musicCoverKeyFrom({ scope: 'work', owner, file })).toBeNull();
    expect(
      musicCoverKeyFrom({ scope: 'track', owner: '../../work', file }),
    ).toBeNull();
    expect(
      musicCoverKeyFrom({ scope: 'track', owner, file: '../secret.mp3' }),
    ).toBeNull();
    expect(
      musicCoverKeyFrom({ scope: 'track', owner, file: 'cover.jpg' }),
    ).toBeNull();
  });

  it('чужие расширения не отдаёт', () => {
    expect(
      musicCoverKeyFrom({
        scope: 'track',
        owner,
        file: '72fb3738-4d1e-4ded-81b6-e5e38f79c3f7.mp3',
      }),
    ).toBeNull();
  });
});

describe('musicCoverContentType', () => {
  it('отдаёт тип по расширению', () => {
    expect(musicCoverContentType('a.jpg')).toBe('image/jpeg');
    expect(musicCoverContentType('a.JPEG')).toBe('image/jpeg');
    expect(musicCoverContentType('a.png')).toBe('image/png');
    expect(musicCoverContentType('a.webp')).toBe('image/webp');
    expect(musicCoverContentType('a.gif')).toBeNull();
  });
});

describe('MUSIC_COVER_CACHE_CONTROL', () => {
  // Имя файла содержит uuid: содержимое по адресу не меняется никогда.
  it('разрешает кешировать надолго', () => {
    expect(MUSIC_COVER_CACHE_CONTROL).toContain('immutable');
    expect(MUSIC_COVER_CACHE_CONTROL).toContain('max-age=31536000');
  });
});
