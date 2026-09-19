import { downsampleWaveform, flatWaveform, normalizeMeteringLevel, WAVEFORM_POINTS } from './voice-waveform';

describe('flatWaveform', () => {
  it('даёт сорок одинаковых столбиков по умолчанию', () => {
    const bars = flatWaveform();
    expect(bars).toHaveLength(WAVEFORM_POINTS);
    expect(new Set(bars).size).toBe(1);
  });
});

describe('downsampleWaveform', () => {
  it('пустые уровни — ровная дорожка', () => {
    expect(downsampleWaveform([])).toEqual(flatWaveform());
  });

  it('короче сорока точек — отдаёт как есть', () => {
    expect(downsampleWaveform([10, 20, 30])).toEqual([10, 20, 30]);
  });

  it('сжимает длинную запись до сорока точек усреднением', () => {
    const levels = Array.from({ length: 400 }, (_, i) => i % 100);
    const bars = downsampleWaveform(levels);
    expect(bars).toHaveLength(WAVEFORM_POINTS);
    expect(bars.every((v) => v >= 0 && v <= 100)).toBe(true);
  });
});

describe('normalizeMeteringLevel', () => {
  it('тишина (-160 дБ и ниже) даёт 0', () => {
    expect(normalizeMeteringLevel(-160)).toBe(0);
    expect(normalizeMeteringLevel(-50)).toBe(0);
  });

  it('полная громкость (0 дБ) даёт 100', () => {
    expect(normalizeMeteringLevel(0)).toBe(100);
  });

  it('середина шкалы — около половины', () => {
    expect(normalizeMeteringLevel(-25)).toBe(50);
  });

  it('нечисловое значение — тишина', () => {
    expect(normalizeMeteringLevel(NaN)).toBe(0);
  });
});
