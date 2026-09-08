import {
  REPORT_HIDE_THRESHOLD,
  crossesHideThreshold,
} from './report-threshold';

describe('crossesHideThreshold', () => {
  it('скрывает ровно на пороге', () => {
    expect(crossesHideThreshold(REPORT_HIDE_THRESHOLD)).toBe(true);
  });

  it('до порога и после него не срабатывает', () => {
    // После порога — чтобы возвращённое админом предложение не пряталось
    // снова с каждой следующей жалобой.
    expect(crossesHideThreshold(REPORT_HIDE_THRESHOLD - 1)).toBe(false);
    expect(crossesHideThreshold(REPORT_HIDE_THRESHOLD + 1)).toBe(false);
  });
});
