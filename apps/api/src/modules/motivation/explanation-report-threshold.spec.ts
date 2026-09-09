import {
  EXPLANATION_HIDE_THRESHOLD,
  crossesExplanationThreshold,
} from './explanation-report-threshold';

describe('crossesExplanationThreshold', () => {
  it('одной жалобы мало: ею легко свести счёты', () => {
    expect(crossesExplanationThreshold(1)).toBe(false);
    expect(crossesExplanationThreshold(2)).toBe(false);
  });

  it('на третьей прячем', () => {
    expect(crossesExplanationThreshold(EXPLANATION_HIDE_THRESHOLD)).toBe(true);
  });

  it('после порога не прячем снова: админ мог уже вернуть трактовку', () => {
    expect(crossesExplanationThreshold(4)).toBe(false);
    expect(crossesExplanationThreshold(10)).toBe(false);
  });
});
