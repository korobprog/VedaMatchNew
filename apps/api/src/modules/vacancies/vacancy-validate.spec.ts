import {
  validateVacancy,
  type VacancyValidationInput,
} from './vacancy-validate';

const now = new Date('2026-09-08T12:00:00.000Z');
const location = { city: 'Москва', lat: 55.75, lon: 37.62 };

const create = (input: VacancyValidationInput) =>
  validateVacancy(input, { isCreate: true, now });
const update = (input: VacancyValidationInput) =>
  validateVacancy(input, { isCreate: false, now });

const work: VacancyValidationInput = {
  kind: 'work',
  title: 'Повар в кафе',
  workFormat: 'onsite',
  location,
  pay: { min: 60_000, max: 80_000, period: 'month' },
};

describe('validateVacancy: общее', () => {
  it('валидная работа проходит', () => {
    expect(create(work)).toBeNull();
  });

  it('вид и заголовок обязательны при создании', () => {
    expect(create({ ...work, kind: undefined })).toBe('kind_invalid');
    expect(create({ ...work, title: '  ' })).toBe('title_required');
  });

  it('при правке отсутствующие поля не считаются стёртыми', () => {
    expect(update({ description: 'коротко' })).toBeNull();
  });

  it('«только моей общине» требует общину', () => {
    expect(create({ ...work, audience: 'my_community' })).toBe(
      'community_audience_requires_community',
    );
  });
});

describe('validateVacancy: работа', () => {
  it('офис без города не публикуется, удалёнка — публикуется', () => {
    expect(create({ ...work, location: null })).toBe('city_required');
    expect(
      create({ ...work, workFormat: 'remote', location: null }),
    ).toBeNull();
  });

  it('оплата: либо вилка, либо «по договорённости»', () => {
    expect(create({ ...work, pay: null })).toBe('pay_required');
    expect(create({ ...work, pay: { negotiable: true } })).toBeNull();
    expect(create({ ...work, pay: { min: 100, max: 50 } })).toBe(
      'pay_min_above_max',
    );
    expect(create({ ...work, pay: { min: -1 } })).toBe('pay_negative');
    expect(create({ ...work, pay: { min: 1, currency: 'BTC' } })).toBe(
      'pay_currency_invalid',
    );
  });
});

describe('validateVacancy: служение', () => {
  const seva: VacancyValidationInput = {
    kind: 'seva',
    title: 'Помощь на кухне',
    communityId: 'c1',
    sevaTerm: 'ongoing',
  };

  it('служение только от общины', () => {
    // «Нужны руки в храме» от частного лица — способ выдать себя за храм.
    expect(create({ ...seva, communityId: null })).toBe(
      'seva_requires_community',
    );
    expect(create(seva)).toBeNull();
  });

  it('срок «до даты» требует будущую дату', () => {
    expect(create({ ...seva, sevaTerm: 'until' })).toBe('seva_until_required');
    expect(
      create({ ...seva, sevaTerm: 'until', sevaUntil: '2026-01-01' }),
    ).toBe('seva_until_in_past');
    expect(
      create({ ...seva, sevaTerm: 'event', sevaUntil: '2026-10-01' }),
    ).toBeNull();
  });

  it('незнакомая льгота отклоняется', () => {
    expect(create({ ...seva, perks: ['car' as never] })).toBe('perk_invalid');
  });
});

describe('validateVacancy: разовая задача', () => {
  it('дедлайн необязателен, но не в прошлом', () => {
    expect(create({ kind: 'task', title: 'Перевезти книги' })).toBeNull();
    expect(
      create({ kind: 'task', title: 'Перевезти книги', dueAt: '2026-09-01' }),
    ).toBe('due_at_in_past');
    expect(
      create({ kind: 'task', title: 'Перевезти книги', dueAt: 'вчера' }),
    ).toBe('due_at_invalid');
  });
});
