import {
  bookingRecipients,
  notifiesGuest,
  TRAVEL_EVENTS,
} from './travel-events';

describe('bookingRecipients', () => {
  it('оповещает всех управляющих, когда заявку завёл посторонний', () => {
    expect(bookingRecipients(['a', 'b'], 'guest')).toEqual(['a', 'b']);
  });

  it('не шлёт управляющему новость о его собственной заявке', () => {
    expect(bookingRecipients(['a', 'b'], 'a')).toEqual(['b']);
  });

  it('убирает дубли: один человек — одно уведомление', () => {
    expect(bookingRecipients(['a', 'a', 'b'], null)).toEqual(['a', 'b']);
  });

  it('заявка с публичной страницы никого не исключает', () => {
    expect(bookingRecipients(['a'], null)).toEqual(['a']);
  });
});

describe('notifiesGuest', () => {
  it('о решении хозяина гостю сообщаем', () => {
    expect(notifiesGuest('accepted')).toBe(true);
    expect(notifiesGuest('declined')).toBe(true);
  });

  it('о собственной отмене гостю не сообщаем', () => {
    expect(notifiesGuest('cancelled')).toBe(false);
  });

  it('новая заявка решением не является', () => {
    expect(notifiesGuest('new_request')).toBe(false);
  });
});

describe('TRAVEL_EVENTS', () => {
  it('имена событий начинаются со слага сервиса', () => {
    for (const name of Object.values(TRAVEL_EVENTS)) {
      expect(name.startsWith('travel.')).toBe(true);
    }
  });
});
