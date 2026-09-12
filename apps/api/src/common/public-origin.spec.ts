import { publicOrigin } from './public-origin';

describe('publicOrigin', () => {
  it('берёт единственный адрес', () => {
    expect(publicOrigin('https://vedamatch.ru')).toBe('https://vedamatch.ru');
  });

  it('из списка доменов берёт первый', () => {
    // WEB_ORIGIN у портала — список для CORS: там и зеркала, и поддомены.
    // В ссылку годится только первый.
    expect(
      publicOrigin(
        'https://vedamatch.ru, https://www.vedamatch.ru, https://vaishnava.vedamatch.ru',
      ),
    ).toBe('https://vedamatch.ru');
  });

  it('список глобального и российского контуров не склеивается', () => {
    // Ровно то значение, на котором 12 сентября 2026 лёг вход через Google:
    // редирект уходил на адрес с запятыми.
    expect(
      publicOrigin(
        'https://vedamatch.ru,https://vedamatch.com,https://www.vedamatch.com',
      ),
    ).toBe('https://vedamatch.ru');
  });

  it('снимает хвостовой слэш', () => {
    // Иначе ссылка выходит с двойным: https://сайт//work/join/...
    expect(publicOrigin('https://vedamatch.ru/')).toBe('https://vedamatch.ru');
    expect(publicOrigin('https://vedamatch.ru///')).toBe(
      'https://vedamatch.ru',
    );
  });

  it('пустая настройка — это отсутствие настройки', () => {
    expect(publicOrigin('')).toBeNull();
    expect(publicOrigin('   ')).toBeNull();
    expect(publicOrigin(',,')).toBeNull();
    expect(publicOrigin(undefined)).toBeNull();
    expect(publicOrigin(null)).toBeNull();
  });
});
