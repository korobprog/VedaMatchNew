import { mapYandexProfile } from './yandex.provider';

const raw = {
  id: '1234567',
  default_email: 'ivan@yandex.ru',
  display_name: 'Иван',
  real_name: 'Иван Петров',
  sex: 'male',
  default_avatar_id: 'abc',
  is_avatar_empty: false,
};

describe('mapYandexProfile', () => {
  it('собирает профиль с адресом аватара', () => {
    expect(mapYandexProfile(raw)).toEqual({
      provider: 'yandex',
      externalId: '1234567',
      email: 'ivan@yandex.ru',
      name: 'Иван Петров',
      avatarUrl: 'https://avatars.yandex.net/get-yapic/abc/islands-200',
      gender: 'male',
    });
  });

  it('обходится без аватара, когда его нет', () => {
    const profile = mapYandexProfile({ ...raw, is_avatar_empty: true });
    expect(profile.avatarUrl).toBeUndefined();
  });

  it('падает, когда Яндекс не отдал почту', () => {
    expect(() => mapYandexProfile({ ...raw, default_email: undefined })).toThrow(
      /почт/i,
    );
  });

  it('обходится без пола, когда он не указан', () => {
    // Яндекс отдаёт sex: null у тех, кто пол не заполнял.
    expect(mapYandexProfile({ ...raw, sex: null }).gender).toBeUndefined();
  });

  it('берёт отображаемое имя, когда настоящего нет', () => {
    expect(mapYandexProfile({ ...raw, real_name: undefined }).name).toBe('Иван');
  });
});
