import {
  MUSIC_COPYRIGHT_HIDE_THRESHOLD,
  MUSIC_REPORT_HIDE_THRESHOLD,
  MUSIC_REVIEW_DEADLINE_DAYS,
  crossesHideThreshold,
  hideThresholdFor,
  initialStatusFor,
  isReviewOverdue,
} from './music-publish-policy';

describe('initialStatusFor', () => {
  it('своя запись идёт в каталог сразу', () => {
    expect(initialStatusFor('own_recording')).toBe('published');
  });

  it('свободно распространяемая — тоже', () => {
    expect(initialStatusFor('freely_distributed')).toBe('published');
  });

  it('запись с открытой программы ждёт проверки', () => {
    // Чужое исполнение: отвечать за него будет портал, а правообладатель
    // приходит быстрее трёх случайных жалоб.
    expect(initialStatusFor('open_program')).toBe('pending');
  });
});

describe('hideThresholdFor', () => {
  it('обычные жалобы копятся до трёх', () => {
    expect(hideThresholdFor('content')).toBe(MUSIC_REPORT_HIDE_THRESHOLD);
    expect(hideThresholdFor('quality')).toBe(MUSIC_REPORT_HIDE_THRESHOLD);
  });

  it('копирайт скрывает с первой претензии', () => {
    expect(hideThresholdFor('copyright')).toBe(MUSIC_COPYRIGHT_HIDE_THRESHOLD);
  });
});

describe('crossesHideThreshold', () => {
  it('срабатывает ровно на пороге', () => {
    expect(crossesHideThreshold(3, 'content')).toBe(true);
  });

  it('до порога молчит', () => {
    expect(crossesHideThreshold(1, 'content')).toBe(false);
    expect(crossesHideThreshold(2, 'content')).toBe(false);
  });

  it('после порога молчит — иначе возвращённая запись пряталась бы снова', () => {
    // Админ вернул запись из панели, пришла четвёртая жалоба. При проверке
    // `>=` она спрятала бы её опять, и решение админа ничего не значило бы.
    expect(crossesHideThreshold(4, 'content')).toBe(false);
    expect(crossesHideThreshold(10, 'content')).toBe(false);
  });

  it('копирайт срабатывает на первой и молчит на второй', () => {
    expect(crossesHideThreshold(1, 'copyright')).toBe(true);
    expect(crossesHideThreshold(2, 'copyright')).toBe(false);
  });
});

describe('isReviewOverdue', () => {
  const escalated = new Date('2026-08-20T12:00:00.000Z');

  it('через неделю срок вышел', () => {
    expect(
      isReviewOverdue(escalated, new Date('2026-08-27T12:00:00.000Z')),
    ).toBe(true);
  });

  it('за минуту до — ещё нет', () => {
    expect(
      isReviewOverdue(escalated, new Date('2026-08-27T11:59:00.000Z')),
    ).toBe(false);
  });

  it('на следующий день после — тем более вышел', () => {
    expect(
      isReviewOverdue(escalated, new Date('2026-08-28T12:00:00.000Z')),
    ).toBe(true);
  });

  it('срок настраивается', () => {
    expect(
      isReviewOverdue(escalated, new Date('2026-08-22T12:00:00.000Z'), 2),
    ).toBe(true);
    expect(
      isReviewOverdue(escalated, new Date('2026-08-22T12:00:00.000Z'), 14),
    ).toBe(false);
  });

  it('неделя — это семь дней', () => {
    expect(MUSIC_REVIEW_DEADLINE_DAYS).toBe(7);
  });
});
