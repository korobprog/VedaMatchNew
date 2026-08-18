import {
  DEFAULT_RATE_PER_MTOKENS,
  estimatePlannedClipUsd,
  estimateVideoCostUsd,
  videoTokens,
} from './video-cost';

describe('оценка стоимости ролика', () => {
  // Опорная точка — реальная строка счёта fal от 18.08.2026:
  // ролик 704×1248, 5.04 с, тариф Pro $2.50/M → Quantity 0.10, Cost $0.259545.
  const measured = { width: 704, height: 1248, seconds: 5.04 };

  it('воспроизводит количество токенов из счёта', () => {
    expect(videoTokens(measured) / 1_000_000).toBeCloseTo(0.104, 2);
  });

  it('воспроизводит сумму из счёта по тарифу Pro', () => {
    const cost = estimateVideoCostUsd({ ...measured, ratePerMTokens: 2.5 });
    expect(cost).toBeCloseTo(0.2595, 3);
  });

  it('на Pro Fast тот же ролик стоит в 2.5 раза дешевле', () => {
    const pro = estimateVideoCostUsd({ ...measured, ratePerMTokens: 2.5 });
    const fast = estimateVideoCostUsd({ ...measured, ratePerMTokens: 1.0 });
    expect(pro / fast).toBeCloseTo(2.5, 5);
    expect(fast).toBeCloseTo(0.1038, 3);
  });

  it('по умолчанию считает по тарифу Pro Fast — он и стоит в конфиге', () => {
    expect(DEFAULT_RATE_PER_MTOKENS).toBe(1.0);
  });

  it('цена линейна по длительности', () => {
    const five = estimatePlannedClipUsd({ seconds: 5 });
    const ten = estimatePlannedClipUsd({ seconds: 10 });
    expect(ten / five).toBeCloseTo(2, 5);
  });

  it('оценка планируемого ролика близка к тому, что выставили за реальный', () => {
    // Потолок бюджета опирается на эту оценку, поэтому она не должна
    // занижать: разойдись она вдвое — потолок пропустил бы вдвое больше.
    const planned = estimatePlannedClipUsd({ seconds: 5, ratePerMTokens: 2.5 });
    expect(planned).toBeGreaterThan(0.24);
    expect(planned).toBeLessThan(0.27);
  });
});
