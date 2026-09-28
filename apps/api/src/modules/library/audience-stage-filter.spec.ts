import { audienceStageCondition } from './audience-stage-filter';

describe('audienceStageCondition', () => {
  it('без ступеней фильтра нет', () => {
    expect(audienceStageCondition(null)).toBeNull();
    expect(audienceStageCondition([])).toBeNull();
  });

  it('ступень зрителя плюс материалы «для всех»', () => {
    expect(audienceStageCondition(['yogi'])).toEqual({
      OR: [
        { audienceStages: { isEmpty: true } },
        { audienceStages: { has: 'yogi' } },
      ],
    });
  });

  it('несколько ступеней — любая из них (VED-617)', () => {
    expect(audienceStageCondition(['seeker', 'yogi'])).toEqual({
      OR: [
        { audienceStages: { isEmpty: true } },
        { audienceStages: { hasSome: ['seeker', 'yogi'] } },
      ],
    });
  });
});
