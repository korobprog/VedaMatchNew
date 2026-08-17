import {
  REPORT_HIDE_THRESHOLD,
  crossesHideThreshold,
} from './report-threshold';

describe('crossesHideThreshold', () => {
  it('срабатывает ровно на пороге', () => {
    expect(crossesHideThreshold(REPORT_HIDE_THRESHOLD)).toBe(true);
  });

  it('до порога молчит', () => {
    for (let count = 0; count < REPORT_HIDE_THRESHOLD; count += 1) {
      expect(crossesHideThreshold(count)).toBe(false);
    }
  });

  it('после порога молчит тоже', () => {
    // Иначе объявление скрывалось бы снова после каждой новой жалобы —
    // в том числе после того, как админ его вернул.
    expect(crossesHideThreshold(REPORT_HIDE_THRESHOLD + 1)).toBe(false);
    expect(crossesHideThreshold(REPORT_HIDE_THRESHOLD + 10)).toBe(false);
  });
});
