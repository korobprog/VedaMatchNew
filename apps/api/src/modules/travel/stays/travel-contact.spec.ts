import {
  contactCardBody,
  contactMessage,
  DEFAULT_CONTACT_MESSAGE,
  MAX_CONTACT_MESSAGE,
  pickStayRecipient,
} from './travel-contact';

describe('pickStayRecipient', () => {
  it('пишем владельцу, даже если управляющий стоит первым', () => {
    expect(
      pickStayRecipient(
        [
          { userId: 'm1', role: 'manager' },
          { userId: 'o1', role: 'owner' },
        ],
        'guest',
      ),
    ).toBe('o1');
  });

  it('без владельца — первому управляющему', () => {
    expect(
      pickStayRecipient([{ userId: 'm1', role: 'manager' }], 'guest'),
    ).toBe('m1');
  });

  it('управляющему самому себе — никому', () => {
    expect(
      pickStayRecipient(
        [
          { userId: 'o1', role: 'owner' },
          { userId: 'm1', role: 'manager' },
        ],
        'm1',
      ),
    ).toBeNull();
  });

  it('у объекта без управляющих — никому', () => {
    expect(pickStayRecipient([], 'guest')).toBeNull();
  });
});

describe('contactCardBody', () => {
  it('заявка — с номером, датами и ночами', () => {
    expect(
      contactCardBody({
        number: 42,
        checkIn: new Date('2026-10-01T00:00:00Z'),
        checkOut: new Date('2026-10-03T00:00:00Z'),
      }),
    ).toBe('Заявка №42 · 1 октября — 3 октября, ночей: 2');
  });

  it('без заявки — вопрос о размещении', () => {
    expect(contactCardBody(null)).toBe('Вопрос о размещении');
  });
});

describe('contactMessage', () => {
  it('пусто — заготовка', () => {
    expect(contactMessage('  ')).toBe(DEFAULT_CONTACT_MESSAGE);
    expect(contactMessage(undefined)).toBe(DEFAULT_CONTACT_MESSAGE);
  });

  it('обрезает пробелы и длину', () => {
    expect(contactMessage('  Есть ли кухня? ')).toBe('Есть ли кухня?');
    expect(contactMessage('а'.repeat(MAX_CONTACT_MESSAGE + 5))).toHaveLength(
      MAX_CONTACT_MESSAGE,
    );
  });
});
