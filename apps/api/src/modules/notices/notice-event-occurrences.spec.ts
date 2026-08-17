import {
  MAX_OCCURRENCES,
  expandOccurrences,
  type RecurringEvent,
} from './notice-event-occurrences';

const iso = (value: string) => new Date(value);
const starts = (list: { startsAt: Date }[]) =>
  list.map((o) => o.startsAt.toISOString().slice(0, 16));

const base: RecurringEvent = {
  startsAt: iso('2026-09-06T14:00:00.000Z'),
  endsAt: iso('2026-09-06T17:00:00.000Z'),
  repeat: 'none',
  repeatUntil: null,
  timeZone: null,
};

const window = {
  from: iso('2026-09-01T00:00:00.000Z'),
  to: iso('2026-10-31T23:59:59.000Z'),
};

describe('разовое событие', () => {
  it('попадает в окно один раз', () => {
    expect(starts(expandOccurrences(base, window.from, window.to))).toEqual([
      '2026-09-06T14:00',
    ]);
  });

  it('вне окна не возвращается вовсе', () => {
    expect(
      expandOccurrences(base, iso('2026-10-01'), iso('2026-10-31')),
    ).toEqual([]);
  });
});

describe('еженедельный повтор', () => {
  const weekly: RecurringEvent = { ...base, repeat: 'weekly' };

  it('раскладывается по неделям', () => {
    expect(starts(expandOccurrences(weekly, window.from, window.to))).toEqual([
      '2026-09-06T14:00',
      '2026-09-13T14:00',
      '2026-09-20T14:00',
      '2026-09-27T14:00',
      '2026-10-04T14:00',
      '2026-10-11T14:00',
      '2026-10-18T14:00',
      '2026-10-25T14:00',
    ]);
  });

  it('окно позже начала догоняется шагами правила', () => {
    const found = expandOccurrences(
      weekly,
      iso('2026-10-05T00:00:00.000Z'),
      iso('2026-10-20T00:00:00.000Z'),
    );
    expect(starts(found)).toEqual(['2026-10-11T14:00', '2026-10-18T14:00']);
  });

  it('не переживает свою дату окончания', () => {
    const found = expandOccurrences(
      { ...weekly, repeatUntil: iso('2026-09-20T23:59:00.000Z') },
      window.from,
      window.to,
    );
    expect(starts(found)).toEqual([
      '2026-09-06T14:00',
      '2026-09-13T14:00',
      '2026-09-20T14:00',
    ]);
  });

  it('длительность переносится на каждое вхождение', () => {
    const [first] = expandOccurrences(weekly, window.from, window.to);
    expect(first.endsAt?.toISOString()).toBe('2026-09-06T17:00:00.000Z');
  });

  it('событие без конца оставляет вхождения без конца', () => {
    const [first] = expandOccurrences(
      { ...weekly, endsAt: null },
      window.from,
      window.to,
    );
    expect(first.endsAt).toBeNull();
  });
});

describe('раз в две недели', () => {
  it('шагает через неделю', () => {
    const found = expandOccurrences(
      { ...base, repeat: 'biweekly' },
      window.from,
      window.to,
    );
    expect(starts(found)).toEqual([
      '2026-09-06T14:00',
      '2026-09-20T14:00',
      '2026-10-04T14:00',
      '2026-10-18T14:00',
    ]);
  });
});

describe('ежемесячный повтор', () => {
  it('держит число месяца', () => {
    const found = expandOccurrences(
      {
        ...base,
        startsAt: iso('2026-09-15T10:00:00.000Z'),
        endsAt: null,
        repeat: 'monthly',
      },
      iso('2026-09-01'),
      iso('2026-12-31'),
    );
    expect(starts(found)).toEqual([
      '2026-09-15T10:00',
      '2026-10-15T10:00',
      '2026-11-15T10:00',
      '2026-12-15T10:00',
    ]);
  });

  it('31-е в коротком месяце поджимается, но в следующем возвращается', () => {
    // Каждое вхождение считается от исходной даты, а не от предыдущего:
    // иначе после февраля программа навсегда съехала бы на 28-е.
    const found = expandOccurrences(
      {
        ...base,
        startsAt: iso('2027-01-31T10:00:00.000Z'),
        endsAt: null,
        repeat: 'monthly',
      },
      iso('2027-01-01'),
      iso('2027-04-01'),
    );
    expect(starts(found)).toEqual([
      '2027-01-31T10:00',
      '2027-02-28T10:00',
      '2027-03-31T10:00',
    ]);
  });
});

describe('перевод часов', () => {
  it('время события остаётся местным по обе стороны перехода', () => {
    // Берлин переходит на летнее время в последнее воскресенье марта —
    // 28 марта 2027. Программа в 18:00 обязана остаться 18:00, а не уехать
    // на час.
    const found = expandOccurrences(
      {
        ...base,
        // 18:00 в Берлине = 17:00 UTC зимой.
        startsAt: iso('2027-03-21T17:00:00.000Z'),
        endsAt: null,
        repeat: 'weekly',
        timeZone: 'Europe/Berlin',
      },
      iso('2027-03-01'),
      iso('2027-04-15'),
    );
    const local = found.map((o) =>
      o.startsAt.toLocaleString('ru-RU', {
        timeZone: 'Europe/Berlin',
        hour: '2-digit',
        minute: '2-digit',
      }),
    );
    expect(new Set(local)).toEqual(new Set(['18:00']));
    // А в UTC время как раз сдвигается — это и значит, что местное сохранено.
    expect(starts(found)).toEqual([
      '2027-03-21T17:00',
      '2027-03-28T16:00',
      '2027-04-04T16:00',
      '2027-04-11T16:00',
    ]);
  });

  it('незнакомая зона не роняет разворачивание', () => {
    const found = expandOccurrences(
      { ...base, repeat: 'weekly', timeZone: 'Middle/Earth' },
      window.from,
      window.to,
    );
    expect(found.length).toBeGreaterThan(0);
  });
});

describe('экадаши', () => {
  it('без загруженного календаря вхождений нет', () => {
    // Таблица дат намеренно пуста: выдумывать лунный календарь нельзя.
    // Форма отказывает на создании, а разворачивание молчит.
    expect(
      expandOccurrences(
        { ...base, repeat: 'ekadashi' },
        window.from,
        window.to,
      ),
    ).toEqual([]);
  });
});

describe('предохранители', () => {
  it('окно до начала события пусто', () => {
    expect(
      expandOccurrences(
        { ...base, repeat: 'weekly' },
        iso('2026-01-01'),
        iso('2026-02-01'),
      ),
    ).toEqual([]);
  });

  it('абсурдное окно обрезается потолком', () => {
    const found = expandOccurrences(
      { ...base, repeat: 'weekly', endsAt: null },
      iso('2026-09-01'),
      iso('2126-09-01'),
    );
    expect(found).toHaveLength(MAX_OCCURRENCES);
  });

  it('повтор, закончившийся до окна, ничего не даёт', () => {
    expect(
      expandOccurrences(
        { ...base, repeat: 'weekly', repeatUntil: iso('2026-08-01') },
        window.from,
        window.to,
      ),
    ).toEqual([]);
  });
});
