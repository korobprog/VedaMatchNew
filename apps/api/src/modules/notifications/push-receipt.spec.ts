import {
  parseShownReceipt,
  showReceiptUrl,
  withShowReceipt,
} from './push-receipt';

const ID = '3f2b8c1e-6a4d-4e0f-9b7a-1c2d3e4f5a6b';
const ENDPOINT = 'https://web.push.apple.com/QGFwcGxlLWlk';

describe('showReceiptUrl', () => {
  it('собирает адрес ручки из публичного адреса API', () => {
    expect(showReceiptUrl('https://api.vedamatch.ru')).toBe(
      'https://api.vedamatch.ru/notifications/shown',
    );
    expect(showReceiptUrl('https://api.vedamatch.ru/')).toBe(
      'https://api.vedamatch.ru/notifications/shown',
    );
    expect(showReceiptUrl('http://localhost:4000')).toBe(
      'http://localhost:4000/notifications/shown',
    );
  });

  it('без адреса API квитанции нет', () => {
    expect(showReceiptUrl(undefined)).toBeNull();
    expect(showReceiptUrl('')).toBeNull();
    expect(showReceiptUrl('не адрес')).toBeNull();
    expect(showReceiptUrl('ftp://api.vedamatch.ru')).toBeNull();
  });
});

describe('withShowReceipt', () => {
  const payload = { title: 'T', body: 'B', url: '/chat/1', tag: 'chat:1' };

  it('кладёт квитанцию рядом с полями пуша', () => {
    expect(
      withShowReceipt(
        payload,
        ID,
        'https://api.vedamatch.ru/notifications/shown',
      ),
    ).toEqual({
      ...payload,
      receipt: { id: ID, url: 'https://api.vedamatch.ru/notifications/shown' },
    });
  });

  it('без адреса пуш не меняется', () => {
    expect(withShowReceipt(payload, ID, null)).toBe(payload);
  });
});

describe('parseShownReceipt', () => {
  it('принимает отметку воркера', () => {
    expect(parseShownReceipt({ endpoint: ENDPOINT, id: ID })).toEqual({
      endpoint: ENDPOINT,
      pushId: ID,
    });
  });

  it('приводит id к нижнему регистру — повтор того же пуша узнаётся', () => {
    expect(
      parseShownReceipt({ endpoint: ENDPOINT, id: ID.toUpperCase() })?.pushId,
    ).toBe(ID);
  });

  it('отбрасывает всё, что не квитанция', () => {
    expect(parseShownReceipt(null)).toBeNull();
    expect(parseShownReceipt('строка')).toBeNull();
    expect(parseShownReceipt({ endpoint: ENDPOINT })).toBeNull();
    expect(parseShownReceipt({ id: ID })).toBeNull();
    expect(parseShownReceipt({ endpoint: ENDPOINT, id: '42' })).toBeNull();
    expect(parseShownReceipt({ endpoint: '', id: ID })).toBeNull();
    expect(
      parseShownReceipt({ endpoint: 'http://push.example/x', id: ID }),
    ).toBeNull();
    expect(
      parseShownReceipt({
        endpoint: `https://push.example/${'x'.repeat(3000)}`,
        id: ID,
      }),
    ).toBeNull();
  });
});
