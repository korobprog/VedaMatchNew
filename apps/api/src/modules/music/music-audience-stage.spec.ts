import { audienceStageAndConditions } from './music-audience-stage';

describe('audienceStageAndConditions', () => {
  it('без ступени — пусто, каталог целиком', () => {
    expect(audienceStageAndConditions(null)).toEqual([]);
  });

  it('ступень зрителя плюс записи «для всех»', () => {
    expect(audienceStageAndConditions('seeker')).toEqual([
      {
        OR: [
          { audienceStages: { isEmpty: true } },
          { audienceStages: { has: 'seeker' } },
        ],
      },
    ]);
  });
});
