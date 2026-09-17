import {
  isTelegramPlaceholderEmail,
  mapTelegramProfile,
  telegramPlaceholderEmail,
} from './telegram.provider';

describe('mapTelegramProfile', () => {
  it('служебная почта, полное имя и фото', () => {
    expect(
      mapTelegramProfile({
        id: 777000111,
        firstName: 'Радха',
        lastName: 'Деви',
        username: 'radha_devi',
        photoUrl: 'https://t.me/i/userpic/320/radha.jpg',
      }),
    ).toEqual({
      provider: 'telegram',
      externalId: '777000111',
      email: 'tg-777000111@users.vedamatch.invalid',
      name: 'Радха Деви',
      avatarUrl: 'https://t.me/i/userpic/320/radha.jpg',
    });
  });

  it('без фамилии и фото — только имя', () => {
    expect(mapTelegramProfile({ id: 5, firstName: '  Говинда ' })).toEqual({
      provider: 'telegram',
      externalId: '5',
      email: 'tg-5@users.vedamatch.invalid',
      name: 'Говинда',
      avatarUrl: undefined,
    });
  });
});

describe('служебная почта', () => {
  it('узнаётся и не путается с настоящей', () => {
    expect(isTelegramPlaceholderEmail(telegramPlaceholderEmail(42))).toBe(true);
    expect(isTelegramPlaceholderEmail('tg-42@users.vedamatch.INVALID')).toBe(
      true,
    );
    expect(isTelegramPlaceholderEmail('tg-42@gmail.com')).toBe(false);
    expect(isTelegramPlaceholderEmail('radha@vedamatch.com')).toBe(false);
  });
});
