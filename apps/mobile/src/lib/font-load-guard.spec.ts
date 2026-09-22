import { shouldWaitForFonts } from './font-load-guard';

describe('shouldWaitForFonts', () => {
  it('ничего ещё не решилось — ждём', () => {
    expect(shouldWaitForFonts(false, false, false)).toBe(true);
  });

  it('шрифты загрузились — не ждём', () => {
    expect(shouldWaitForFonts(true, false, false)).toBe(false);
  });

  it('useFonts вернул ошибку — не ждём, рендерим с тем, что есть', () => {
    expect(shouldWaitForFonts(false, true, false)).toBe(false);
  });

  it('истёк таймаут защиты от вечного зависания — не ждём', () => {
    expect(shouldWaitForFonts(false, false, true)).toBe(false);
  });
});
