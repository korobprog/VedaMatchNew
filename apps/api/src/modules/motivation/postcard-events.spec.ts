import {
  attributionLine,
  upcomingEvent,
  type EventRow,
} from './postcard-events';

const event = (overrides: Partial<EventRow> = {}): EventRow => ({
  id: 'e1',
  date: new Date('2026-08-20T00:00:00Z'),
  title: 'Джанмаштами',
  greeting: 'С Джанмаштами',
  leadDays: 3,
  enabled: true,
  ...overrides,
});

const now = new Date('2026-08-20T12:00:00Z');

describe('upcomingEvent', () => {
  it("picks today's event", () => {
    expect(upcomingEvent([event()], now)?.id).toBe('e1');
  });

  it('picks an event inside its lead window but not before it', () => {
    const soon = event({ id: 'soon', date: new Date('2026-08-22T00:00:00Z') });
    const far = event({ id: 'far', date: new Date('2026-09-30T00:00:00Z') });

    expect(upcomingEvent([soon], now)?.id).toBe('soon');
    expect(upcomingEvent([far], now)).toBeNull();
  });

  it("still offers yesterday's event but forgets older ones", () => {
    const yesterday = event({
      id: 'y',
      date: new Date('2026-08-19T00:00:00Z'),
    });
    const older = event({ id: 'o', date: new Date('2026-08-15T00:00:00Z') });

    expect(upcomingEvent([yesterday], now)?.id).toBe('y');
    expect(upcomingEvent([older], now)).toBeNull();
  });

  it('skips disabled events', () => {
    expect(upcomingEvent([event({ enabled: false })], now)).toBeNull();
  });

  it('prefers the nearest date when several fit', () => {
    const today = event({ id: 'today' });
    const tomorrow = event({
      id: 'tomorrow',
      date: new Date('2026-08-21T00:00:00Z'),
    });

    expect(upcomingEvent([tomorrow, today], now)?.id).toBe('today');
  });

  it('honours a wider lead window', () => {
    const far = event({
      id: 'far',
      date: new Date('2026-09-10T00:00:00Z'),
      leadDays: 30,
    });

    expect(upcomingEvent([far], now)?.id).toBe('far');
  });
});

describe('attributionLine', () => {
  it('joins the parts that are actually there', () => {
    expect(
      attributionLine({
        attributionSpeaker: 'Кришна',
        attributionWork: 'Бхагавад-гита',
        attributionLocator: '2.47',
      }),
    ).toBe('Кришна · Бхагавад-гита · 2.47');
    expect(
      attributionLine({
        attributionSpeaker: null,
        attributionWork: '  ',
        attributionLocator: 'БГ 2.47',
      }),
    ).toBe('БГ 2.47');
  });

  it('не повторяет название произведения, если оно уже есть в начале главы', () => {
    expect(
      attributionLine({
        attributionSpeaker: 'А. Ч. Бхактиведанта Свами Прабхупада',
        attributionWork: 'Бхагавад-гита как она есть',
        attributionLocator: 'Бхагавад-гита как она есть 6.1',
      }),
    ).toBe(
      'А. Ч. Бхактиведанта Свами Прабхупада · Бхагавад-гита как она есть · 6.1',
    );
  });
});
