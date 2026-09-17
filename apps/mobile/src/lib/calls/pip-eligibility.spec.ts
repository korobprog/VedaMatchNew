import { isPipEligible } from './pip-eligibility';

describe('isPipEligible', () => {
  it('видео, активен, экран открыт — можно', () => {
    expect(isPipEligible('video', 'active', true)).toBe(true);
  });

  it('аудиозвонок — нельзя, даже активный и открытый', () => {
    expect(isPipEligible('audio', 'active', true)).toBe(false);
  });

  it('видео, но ещё дозвон — нельзя, нечего показывать', () => {
    expect(isPipEligible('video', 'connecting', true)).toBe(false);
    expect(isPipEligible('video', 'outgoing', true)).toBe(false);
    expect(isPipEligible('video', 'incoming', true)).toBe(false);
  });

  it('видео активен, но экран звонка не открыт — нельзя', () => {
    expect(isPipEligible('video', 'active', false)).toBe(false);
  });

  it('видео, разговор кончился — нельзя', () => {
    expect(isPipEligible('video', 'ended', true)).toBe(false);
  });
});
