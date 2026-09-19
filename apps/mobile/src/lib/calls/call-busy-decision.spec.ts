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

describe('shouldDeclineAsBusy — застрявший свой звонок (прод-баг 2026-09-19)', () => {
  const ringing = (ageMs: number) => ({ callId: 'old', state: 'ringing' as const, ageMs });

  it('входящий, звонящий шесть минут, занятостью не считается', () => {
    expect(shouldDeclineAsBusy({ hasOwnCall: true, systemBusy: false, ownCalls: [ringing(6 * 60_000)] })).toBe(false);
  });

  it('входящий, звонящий 10 секунд, — занято', () => {
    expect(shouldDeclineAsBusy({ hasOwnCall: true, systemBusy: false, ownCalls: [ringing(10_000)] })).toBe(true);
  });

  it('идущий разговор любой длительности — занято', () => {
    expect(
      shouldDeclineAsBusy({ hasOwnCall: true, systemBusy: false, ownCalls: [{ callId: 'x', state: 'active', ageMs: 3 * 3_600_000 }] }),
    ).toBe(true);
  });

  it('застрявший рядом с живым — занято живым', () => {
    expect(
      shouldDeclineAsBusy({
        hasOwnCall: true,
        systemBusy: false,
        ownCalls: [ringing(6 * 60_000), { callId: 'y', state: 'dialing', ageMs: 2_000 }],
      }),
    ).toBe(true);
  });

  it('застрявший не отменяет системную занятость', () => {
    expect(shouldDeclineAsBusy({ hasOwnCall: true, systemBusy: true, ownCalls: [ringing(6 * 60_000)] })).toBe(true);
  });

  it('пустой список своих звонков при сыром hasOwnCall — решает список', () => {
    expect(shouldDeclineAsBusy({ hasOwnCall: true, systemBusy: false, ownCalls: [] })).toBe(false);
  });
});
