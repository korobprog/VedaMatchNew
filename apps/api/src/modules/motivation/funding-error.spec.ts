import {
  fundingMessage,
  isDailyBudgetCode,
  isOutOfFundsCode,
} from './funding-error';

describe('funding-error', () => {
  it('узнаёт наш дневной потолок', () => {
    expect(isDailyBudgetCode('daily_budget_exceeded_4.80_of_5.00')).toBe(true);
    expect(isOutOfFundsCode('daily_budget_exceeded_4.80_of_5.00')).toBe(true);
  });

  it('узнаёт пустой счёт у провайдера в любом написании', () => {
    expect(isOutOfFundsCode('Video provider error 403: Exhausted balance')).toBe(
      true,
    );
    expect(isOutOfFundsCode('Voice provider error 402: Payment Required')).toBe(
      true,
    );
    expect(isOutOfFundsCode('insufficient_quota')).toBe(true);
  });

  it('не принимает за деньги обычные сбои', () => {
    expect(isOutOfFundsCode('provider_timeout')).toBe(false);
    expect(isOutOfFundsCode('lease_expired')).toBe(false);
    expect(isOutOfFundsCode('video_failed')).toBe(false);
    expect(isOutOfFundsCode(null)).toBe(false);
    expect(isOutOfFundsCode(undefined)).toBe(false);
  });

  it('пустой счёт провайдера — не наш потолок', () => {
    expect(isDailyBudgetCode('Video provider error 403: Exhausted balance')).toBe(
      false,
    );
  });

  it('обещает продолжение только там, где задача осталась в очереди', () => {
    expect(fundingMessage('daily_budget_exceeded_5.00_of_5.00')).toContain(
      'остался в очереди',
    );
    expect(fundingMessage('Exhausted balance')).toContain('пополним счёт');
    expect(fundingMessage('provider_timeout')).toBeNull();
  });
});
