import { nextRefreshBackoffMs, REFRESH_BACKOFF_BASE_MS, REFRESH_BACKOFF_MAX_MS } from './refresh-backoff';

describe('nextRefreshBackoffMs', () => {
  it('первая попытка (attempt=0) — базовая пауза', () => {
    expect(nextRefreshBackoffMs(0)).toBe(REFRESH_BACKOFF_BASE_MS);
  });

  it('растёт геометрически с каждой следующей неудачей', () => {
    const first = nextRefreshBackoffMs(0);
    const second = nextRefreshBackoffMs(1);
    const third = nextRefreshBackoffMs(2);
    expect(second).toBeGreaterThan(first);
    expect(third).toBeGreaterThan(second);
  });

  it('не превышает потолок даже при очень большом числе попыток', () => {
    expect(nextRefreshBackoffMs(20)).toBe(REFRESH_BACKOFF_MAX_MS);
    expect(nextRefreshBackoffMs(1000)).toBe(REFRESH_BACKOFF_MAX_MS);
  });

  it('отрицательные и дробные значения трактуются как первая попытка', () => {
    expect(nextRefreshBackoffMs(-1)).toBe(REFRESH_BACKOFF_BASE_MS);
    expect(nextRefreshBackoffMs(NaN)).toBe(REFRESH_BACKOFF_BASE_MS);
  });
});
