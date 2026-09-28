import { audienceStageAndConditions } from './music-audience-stage';

describe('audienceStageAndConditions', () => {
  it('без ступени — пусто, каталог целиком', () => {
    expect(audienceStageAndConditions(null)).toEqual([]);
  });

  it('ступень зрителя плюс записи «для всех»', () => {
    expect(audienceStageAndConditions(['seeker'])).toEqual([
      {
        OR: [
          { audienceStages: { isEmpty: true } },
          { audienceStages: { has: 'seeker' } },
        ],
      },
    ]);
  });

  it('несколько ступеней — любая из них (VED-617)', () => {
    expect(audienceStageAndConditions(['seeker', 'yogi'])).toEqual([
      {
        OR: [
          { audienceStages: { isEmpty: true } },
          { audienceStages: { hasSome: ['seeker', 'yogi'] } },
        ],
      },
    ]);
  });
});
