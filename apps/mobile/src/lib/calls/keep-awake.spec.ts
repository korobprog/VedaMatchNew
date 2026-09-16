import { shouldKeepScreenAwake } from './keep-awake';

describe('shouldKeepScreenAwake', () => {
  it('видеозвонок — держать экран', () => {
    expect(shouldKeepScreenAwake('video')).toBe(true);
  });

  it('аудиозвонок — не держать, экран гасит датчик приближения', () => {
    expect(shouldKeepScreenAwake('audio')).toBe(false);
  });
});
