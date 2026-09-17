import { shouldDeclineAsBusy } from './call-busy-decision';

describe('shouldDeclineAsBusy', () => {
  it('устройство свободно — не занято', () => {
    expect(shouldDeclineAsBusy({ hasOwnCall: false, systemBusy: false })).toBe(false);
  });

  it('уже идёт свой звонок VedaMatch — занято', () => {
    expect(shouldDeclineAsBusy({ hasOwnCall: true, systemBusy: false })).toBe(true);
  });

  it('Telecom считает устройство занятым (сотовый/чужой self-managed) — занято', () => {
    expect(shouldDeclineAsBusy({ hasOwnCall: false, systemBusy: true })).toBe(true);
  });

  it('оба факта сразу — всё равно занято, а не ошибка', () => {
    expect(shouldDeclineAsBusy({ hasOwnCall: true, systemBusy: true })).toBe(true);
  });
});
