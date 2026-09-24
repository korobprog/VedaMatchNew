import { toPublicStorageUrl } from './storage-public-url';

const BUCKET = '05859cbd-bucket';
const SIGNED = `https://firsts3.ru/${BUCKET}/users/u1/avatar.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=abc`;

describe('toPublicStorageUrl', () => {
  it('меняет origin хранилища на публичный, путь и подпись не трогает', () => {
    expect(
      toPublicStorageUrl(
        SIGNED,
        'https://firsts3.ru',
        `https://media.vedamatch.ru/${BUCKET}`,
      ),
    ).toBe(
      `https://media.vedamatch.ru/${BUCKET}/users/u1/avatar.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=abc`,
    );
  });

  it('без публичного адреса или с тем же origin — ссылка как есть', () => {
    expect(toPublicStorageUrl(SIGNED, 'https://firsts3.ru', undefined)).toBe(
      SIGNED,
    );
    expect(toPublicStorageUrl(SIGNED, 'https://firsts3.ru', '  ')).toBe(SIGNED);
    expect(
      toPublicStorageUrl(
        SIGNED,
        'https://firsts3.ru',
        `https://firsts3.ru/${BUCKET}`,
      ),
    ).toBe(SIGNED);
  });

  it('битые адреса не ломают выдачу', () => {
    expect(
      toPublicStorageUrl(SIGNED, 'firsts3', 'https://media.vedamatch.ru'),
    ).toBe(SIGNED);
    expect(toPublicStorageUrl(SIGNED, 'https://firsts3.ru', 'not a url')).toBe(
      SIGNED,
    );
    expect(
      toPublicStorageUrl(
        SIGNED,
        'https://firsts3.ru',
        'ftp://media.vedamatch.ru',
      ),
    ).toBe(SIGNED);
  });

  it('чужой хост и хост-префикс не подменяет', () => {
    const other = 'https://cdn.example.com/x.jpg?sig=1';
    expect(
      toPublicStorageUrl(
        other,
        'https://firsts3.ru',
        'https://media.vedamatch.ru',
      ),
    ).toBe(other);
    // firsts3.ru.evil.com начинается с «https://firsts3.ru», но это другой хост.
    const lookalike = 'https://firsts3.ru.evil.com/x.jpg';
    expect(
      toPublicStorageUrl(
        lookalike,
        'https://firsts3.ru',
        'https://media.vedamatch.ru',
      ),
    ).toBe(lookalike);
  });

  it('endpoint со слэшем в конце и с путём сравнивается по origin', () => {
    expect(
      toPublicStorageUrl(
        SIGNED,
        'https://firsts3.ru/',
        `https://media.vedamatch.ru/${BUCKET}/`,
      ),
    ).toBe(SIGNED.replace('https://firsts3.ru', 'https://media.vedamatch.ru'));
  });
});
