import {
  REPORT_HIDE_THRESHOLD,
  crossesHideThreshold,
  reportTargetKey,
} from './report-threshold';

describe('crossesHideThreshold', () => {
  it('does not fire below the threshold', () => {
    expect(crossesHideThreshold(0)).toBe(false);
    expect(crossesHideThreshold(1)).toBe(false);
    expect(crossesHideThreshold(REPORT_HIDE_THRESHOLD - 1)).toBe(false);
  });

  it('fires exactly at the threshold', () => {
    expect(crossesHideThreshold(REPORT_HIDE_THRESHOLD)).toBe(true);
  });

  // Главное свойство: проверка `>=` скрывала бы объект на каждой следующей
  // жалобе, и он снова прятался бы после того, как админ его вернул.
  it('does not fire again past the threshold', () => {
    expect(crossesHideThreshold(REPORT_HIDE_THRESHOLD + 1)).toBe(false);
    expect(crossesHideThreshold(REPORT_HIDE_THRESHOLD + 10)).toBe(false);
  });

  it('fires exactly once while reports accumulate', () => {
    const fired = Array.from({ length: 10 }, (_, index) =>
      crossesHideThreshold(index + 1),
    ).filter(Boolean);
    expect(fired).toHaveLength(1);
  });

  it('keeps the threshold at three', () => {
    expect(REPORT_HIDE_THRESHOLD).toBe(3);
  });
});

describe('reportTargetKey', () => {
  it('namespaces the id by target kind', () => {
    expect(reportTargetKey('listing', 'abc')).toBe('listing:abc');
    expect(reportTargetKey('shop', 'abc')).toBe('shop:abc');
  });

  // Объявление и магазин с одинаковым id — разные цели; без префикса жалоба
  // на один блокировала бы жалобу на другой.
  it('keeps different kinds with the same id apart', () => {
    expect(reportTargetKey('listing', 'same')).not.toBe(
      reportTargetKey('review', 'same'),
    );
  });

  it('is stable for the same input', () => {
    expect(reportTargetKey('comment', 'x')).toBe(reportTargetKey('comment', 'x'));
  });
});
