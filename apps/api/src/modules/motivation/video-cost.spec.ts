import {
  DEFAULT_RATE_PER_MTOKENS,
  estimatePlannedClipUsd,
  ratePerMTokensFor,
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

describe('оценка под конкретную модель', () => {
  it('Wan считает по $0.05 за секунду 720p', () => {
    // Сверено с прайсом fal и счётом: скидки за немой ролик нет, ставка одна.
    // Прежние $0.025/с занижали расход вдвое, а на нём стоит дневной потолок.
    expect(
      estimatePlannedClipUsd({
        seconds: 5,
        model: 'wan/v2.6/image-to-video/flash',
      }),
    ).toBeCloseTo(0.25, 3);
  });

  it('Vidu в 720p считает с множителем 2.2', () => {
    // $0.07/с базово, 720p дороже в 2.2 раза.
    expect(
      estimatePlannedClipUsd({
        seconds: 5,
        model: 'fal-ai/vidu/q3/image-to-video',
      }),
    ).toBeCloseTo(0.77, 2);
  });

  it('Seedance считается по токенам, и Pro дороже Fast', () => {
    const fast = estimatePlannedClipUsd({
      seconds: 5,
      model: 'fal-ai/bytedance/seedance/v1/pro/fast/image-to-video',
    });
    const pro = estimatePlannedClipUsd({
      seconds: 5,
      model: 'fal-ai/bytedance/seedance/v1/pro/image-to-video',
    });

    expect(fast).toBeCloseTo(0.103, 2);
    // Ставка Pro в 2.5 раза выше: одна на обе модели снова считала бы половину.
    expect(pro).toBeCloseTo(fast * 2.5, 2);
  });

  it('ставка за миллион токенов берётся по имени модели', () => {
    expect(ratePerMTokensFor('fal-ai/bytedance/seedance/v1/pro/fast/x')).toBe(
      1,
    );
    expect(ratePerMTokensFor('fal-ai/bytedance/seedance/v1/pro/x')).toBe(2.5);
    // Незнакомой модели приписываем верхнюю ставку: занижать расход опаснее.
    expect(ratePerMTokensFor('нечто/новое')).toBe(2.5);
  });

  it('незнакомая модель не роняет расчёт, а падает на токенную формулу', () => {
    expect(
      estimatePlannedClipUsd({ seconds: 5, model: 'нечто/новое' }),
    ).toBeGreaterThan(0);
  });

  it('разные модели дают разные числа — иначе учёт был бы фикцией', () => {
    const wan = estimatePlannedClipUsd({
      seconds: 5,
      model: 'wan/v2.6/image-to-video/flash',
    });
    const vidu = estimatePlannedClipUsd({
      seconds: 5,
      model: 'fal-ai/vidu/q3/image-to-video',
    });
    const seedance = estimatePlannedClipUsd({
      seconds: 5,
      model: 'fal-ai/bytedance/seedance/v1/pro/fast/image-to-video',
    });

    expect(new Set([wan, vidu, seedance]).size).toBe(3);
  });

  it('длиннее ролик — дороже, и ровно во столько же раз', () => {
    const five = estimatePlannedClipUsd({
      seconds: 5,
      model: 'wan/v2.6/image-to-video/flash',
    });
    const ten = estimatePlannedClipUsd({
      seconds: 10,
      model: 'wan/v2.6/image-to-video/flash',
    });

    expect(ten).toBeCloseTo(five * 2, 3);
  });
});
