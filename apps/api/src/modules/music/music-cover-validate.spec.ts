import {
  MUSIC_COVER_MAX_BYTES,
  buildMusicCoverKey,
  coverExtensionFor,
  isMusicCoverMime,
  isMusicCoverScope,
  isOwnMusicCoverKey,
  resolveMusicCoverKey,
  validateMusicCoverRequest,
} from './music-cover-validate';

const request = (over: Record<string, unknown> = {}) => ({
  scope: 'track',
  mime: 'image/jpeg',
  sizeBytes: 120_000,
  ...over,
});

describe('validateMusicCoverRequest', () => {
  it('пропускает обычную обложку', () => {
    expect(validateMusicCoverRequest(request())).toEqual({ ok: true });
  });

  it('принимает все три заявленных формата', () => {
    for (const mime of ['image/jpeg', 'image/png', 'image/webp']) {
      expect(validateMusicCoverRequest(request({ mime })).ok).toBe(true);
    }
  });

  // Гифка в сетке каталога означала бы десяток одновременно дёргающихся плиток.
  it('анимацию не берёт', () => {
    expect(validateMusicCoverRequest(request({ mime: 'image/gif' }))).toEqual({
      ok: false,
      rejection: 'mime',
    });
  });

  it('аудио под видом обложки не проходит', () => {
    expect(
      validateMusicCoverRequest(request({ mime: 'audio/mpeg' })).rejection,
    ).toBe('mime');
  });

  it('неизвестный вид обложки отклоняется', () => {
    expect(validateMusicCoverRequest(request({ scope: 'user' })).rejection).toBe(
      'scope',
    );
  });

  it('пустой файл отклоняется', () => {
    expect(validateMusicCoverRequest(request({ sizeBytes: 0 })).rejection).toBe(
      'empty',
    );
  });

  // Размер приходит от браузера: там может быть что угодно, включая мусор.
  it('размер не числом — это пустой файл, а не пропуск', () => {
    expect(
      validateMusicCoverRequest(request({ sizeBytes: 'много' })).rejection,
    ).toBe('empty');
    expect(
      validateMusicCoverRequest(request({ sizeBytes: -1 })).rejection,
    ).toBe('empty');
  });

  it('ровно на потолке ещё проходит, на байт больше — уже нет', () => {
    expect(
      validateMusicCoverRequest(request({ sizeBytes: MUSIC_COVER_MAX_BYTES }))
        .ok,
    ).toBe(true);
    expect(
      validateMusicCoverRequest({
        ...request(),
        sizeBytes: MUSIC_COVER_MAX_BYTES + 1,
      }).rejection,
    ).toBe('too-large');
  });
});

describe('buildMusicCoverKey', () => {
  it('кладёт вид и владельца в путь', () => {
    expect(buildMusicCoverKey('album', 'u1', 'jpg', 'abc')).toBe(
      'music/covers/album/u1/abc.jpg',
    );
  });

  it('чистит расширение — оно попадает в публичный адрес', () => {
    expect(buildMusicCoverKey('track', 'u1', '../../jpg', 'abc')).toBe(
      'music/covers/track/u1/abc.jpg',
    );
  });

  it('без расширения ставит jpg, а не пустоту', () => {
    expect(buildMusicCoverKey('track', 'u1', '///', 'abc')).toBe(
      'music/covers/track/u1/abc.jpg',
    );
  });
});

describe('isOwnMusicCoverKey', () => {
  const key = 'music/covers/playlist/u1/abc.jpg';

  it('свой ключ пропускает', () => {
    expect(isOwnMusicCoverKey(key, 'playlist', 'u1')).toEqual({ ok: true });
  });

  // Без этой проверки человек присылает чужую строку и подменяет обложку,
  // ни разу ничего не залив.
  it('чужой ключ отклоняет', () => {
    expect(isOwnMusicCoverKey(key, 'playlist', 'u2').rejection).toBe(
      'foreign-key',
    );
  });

  it('выписанной под плейлист ссылкой нельзя тронуть исполнителя', () => {
    expect(isOwnMusicCoverKey(key, 'artist', 'u1').rejection).toBe(
      'foreign-key',
    );
  });

  it('чужой префикс отклоняет — аудио обложкой не станет', () => {
    expect(
      isOwnMusicCoverKey('music/uploads/u1/abc.mp3', 'track', 'u1').rejection,
    ).toBe('malformed-key');
  });

  it('лишние сегменты отклоняет', () => {
    expect(
      isOwnMusicCoverKey('music/covers/track/u1/nested/abc.jpg', 'track', 'u1')
        .rejection,
    ).toBe('malformed-key');
  });

  it('ключ без файла отклоняет', () => {
    expect(
      isOwnMusicCoverKey('music/covers/track/u1/', 'track', 'u1').rejection,
    ).toBe('malformed-key');
  });

  it('пустую строку отклоняет', () => {
    expect(isOwnMusicCoverKey('', 'track', 'u1').rejection).toBe(
      'malformed-key',
    );
  });

  describe('без владельца — так карточки каталога правит администратор', () => {
    it('чужой по владельцу ключ проходит', () => {
      expect(isOwnMusicCoverKey(key, 'playlist')).toEqual({ ok: true });
    });

    // Вид сверяется всегда: обложкой записи не станет картинка из плейлиста.
    it('чужой по виду ключ всё равно отклоняется', () => {
      expect(isOwnMusicCoverKey(key, 'track').rejection).toBe('foreign-key');
    });

    it('ключ с пустым владельцем отклоняется', () => {
      expect(
        isOwnMusicCoverKey('music/covers/track//abc.jpg', 'track').rejection,
      ).toBe('malformed-key');
    });
  });
});

describe('resolveMusicCoverKey', () => {
  const base = {
    current: null as string | null,
    scope: 'playlist' as const,
    ownerId: 'u1',
  };

  it('о поле не говорили — не трогаем', () => {
    expect(resolveMusicCoverKey({ ...base, next: undefined })).toEqual({
      ok: true,
      value: undefined,
    });
  });

  // `null` — это «снять обложку», и он не то же самое, что «не говорили».
  it('снятие обложки проходит без проверки ключа', () => {
    expect(resolveMusicCoverKey({ ...base, next: null })).toEqual({
      ok: true,
      value: null,
    });
  });

  it('новый свой ключ записывается', () => {
    expect(
      resolveMusicCoverKey({
        ...base,
        next: 'music/covers/playlist/u1/abc.jpg',
      }),
    ).toEqual({ ok: true, value: 'music/covers/playlist/u1/abc.jpg' });
  });

  it('новый чужой ключ отклоняется', () => {
    expect(
      resolveMusicCoverKey({
        ...base,
        next: 'music/covers/playlist/u2/abc.jpg',
      }),
    ).toEqual({ ok: false, rejection: 'foreign-key' });
  });

  // Форма возвращает уже записанный ключ при любой правке, а залить обложку
  // мог другой администратор: со строгой проверкой второй не смог бы даже
  // переименовать карточку.
  it('неизменившийся чужой ключ не мешает править остальное', () => {
    const current = 'music/covers/artist/кто-то-другой/abc.jpg';

    expect(
      resolveMusicCoverKey({
        current,
        next: current,
        scope: 'artist',
        ownerId: 'u1',
      }),
    ).toEqual({ ok: true, value: undefined });
  });
});

describe('вспомогательные', () => {
  it('знает свои виды и типы', () => {
    expect(isMusicCoverScope('album')).toBe(true);
    expect(isMusicCoverScope('user')).toBe(false);
    expect(isMusicCoverMime('image/webp')).toBe(true);
    expect(isMusicCoverMime('image/gif')).toBe(false);
  });

  it('расширение по типу', () => {
    expect(coverExtensionFor('image/jpeg')).toBe('jpg');
    expect(coverExtensionFor('image/png')).toBe('png');
    expect(coverExtensionFor('image/webp')).toBe('webp');
  });
});
