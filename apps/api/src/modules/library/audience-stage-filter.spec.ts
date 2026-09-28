import { audienceStageCondition } from './audience-stage-filter';

describe('audienceStageCondition', () => {
  it('без ступени фильтра нет', () => {
    expect(audienceStageCondition(null)).toBeNull();
  });

  it('ступень зрителя плюс материалы «для всех»', () => {
    expect(audienceStageCondition('yogi')).toEqual({
      OR: [
        { audienceStages: { isEmpty: true } },
        { audienceStages: { has: 'yogi' } },
      ],
    });
  });
});
