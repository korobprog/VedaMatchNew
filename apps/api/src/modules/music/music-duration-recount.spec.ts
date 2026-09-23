import {
  MAX_PLAUSIBLE_DURATION_SECONDS,
  decideRecountedDuration,
} from './music-duration-recount';

describe('decideRecountedDuration', () => {
  // Та самая жалоба VED-165: пятиминутный трек с оценкой «больше получаса».
  it('оценку по первому кадру заменяет точным числом из файла', () => {
    expect(
      decideRecountedDuration({ parsedSeconds: 300.024, currentSeconds: 1872 }),
    ).toEqual({ kind: 'update', seconds: 300 });
  });

  it('совпавшее число не переписывает', () => {
    expect(
      decideRecountedDuration({ parsedSeconds: 154.4, currentSeconds: 154 }),
    ).toEqual({ kind: 'keep' });
  });

  it('разбор не дал длительности — прежнее число остаётся', () => {
    for (const parsedSeconds of [undefined, null, 0, -3, Number.NaN]) {
      expect(
        decideRecountedDuration({ parsedSeconds, currentSeconds: 200 }),
      ).toEqual({ kind: 'unreadable' });
    }
  });

  it('сутки и больше — сбой разбора, а не запись', () => {
    expect(
      decideRecountedDuration({
        parsedSeconds: MAX_PLAUSIBLE_DURATION_SECONDS + 1,
        currentSeconds: 200,
      }),
    ).toEqual({ kind: 'unreadable' });
  });

  it('доля секунды округляется до одной, а не до нуля', () => {
    expect(
      decideRecountedDuration({ parsedSeconds: 0.3, currentSeconds: 5 }),
    ).toEqual({ kind: 'update', seconds: 1 });
  });
});
