import {
  everyoneAllowed,
  everyoneEnabled,
  momentsPlanOf,
  planNote,
} from './moments-plan';

const NOW = new Date('2026-09-06T12:00:00.000Z');
const LATER = new Date('2026-10-06T12:00:00.000Z');
const EARLIER = new Date('2026-08-06T12:00:00.000Z');

describe('тариф моментов', () => {
  it('в бете тариф один на всех, оплата не смотрится', () => {
    expect(momentsPlanOf('beta', null, NOW)).toBe('beta');
    expect(momentsPlanOf('beta', EARLIER, NOW)).toBe('beta');
  });

  it('в рабочем режиме различает оплаченный аккаунт и просроченный', () => {
    expect(momentsPlanOf('business', LATER, NOW)).toBe('pro');
    expect(momentsPlanOf('business', EARLIER, NOW)).toBe('free');
    expect(momentsPlanOf('business', null, NOW)).toBe('free');
  });

  it('возможность закрыта только без оплаты в рабочем режиме', () => {
    expect(everyoneAllowed('beta')).toBe(true);
    expect(everyoneAllowed('pro')).toBe(true);
    expect(everyoneAllowed('free')).toBe(false);
  });

  it('в бете умолчание закрытое: публичность включают руками', () => {
    expect(everyoneEnabled(null, 'beta')).toBe(false);
    expect(everyoneEnabled(true, 'beta')).toBe(true);
  });

  it('на платном тарифе умолчание открытое — это оплаченная возможность', () => {
    expect(everyoneEnabled(null, 'pro')).toBe(true);
  });

  it('выключенная руками галочка не включается вместе с оплатой', () => {
    expect(everyoneEnabled(false, 'pro')).toBe(false);
  });

  it('без оплаты публичность гаснет, но галочка остаётся', () => {
    expect(everyoneEnabled(true, 'free')).toBe(false);
    // Значение в базе не меняется — вернувшаяся оплата возвращает и публичность.
    expect(everyoneEnabled(true, 'pro')).toBe(true);
  });

  it('объясняет, почему возможность недоступна, только когда она недоступна', () => {
    expect(planNote('free')).toContain('платном тарифе');
    expect(planNote('beta')).toBeNull();
    expect(planNote('pro')).toBeNull();
  });
});
