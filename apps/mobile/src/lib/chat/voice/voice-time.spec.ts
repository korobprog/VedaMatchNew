import { formatVoiceTime } from './voice-time';

describe('formatVoiceTime', () => {
  it('минуты и секунды с ведущим нулём', () => {
    expect(formatVoiceTime(0)).toBe('0:00');
    expect(formatVoiceTime(5)).toBe('0:05');
    expect(formatVoiceTime(65)).toBe('1:05');
    expect(formatVoiceTime(599)).toBe('9:59');
  });

  it('час и дольше — h:mm:ss', () => {
    expect(formatVoiceTime(3600)).toBe('1:00:00');
    expect(formatVoiceTime(3725)).toBe('1:02:05');
  });

  it('округляет и не уходит в минус', () => {
    expect(formatVoiceTime(4.6)).toBe('0:05');
    expect(formatVoiceTime(-3)).toBe('0:00');
  });
});
