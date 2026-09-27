import { lineageFeedCondition } from './lineage-feed-filter';

describe('lineageFeedCondition', () => {
  it('без фильтра условия нет', () => {
    expect(lineageFeedCondition(null)).toBeNull();
  });

  it('одна линия — равенство плюс материалы для всех', () => {
    expect(lineageFeedCondition('ipbys')).toEqual({
      OR: [{ lineage: 'ipbys' }, { lineage: null }],
    });
  });

  it('группа — любая её линия плюс материалы для всех (VED-568)', () => {
    expect(lineageFeedCondition('group:gaudiya_math')).toEqual({
      OR: [
        {
          lineage: {
            in: [
              'sri_chaitanya_gaudiya_math',
              'sri_chaitanya_saraswat_math',
              'sri_gopinath_gaudiya_math',
              'ipbys',
            ],
          },
        },
        { lineage: null },
      ],
    });
  });

  it('группа из одной линии сводится к равенству', () => {
    expect(lineageFeedCondition('group:iskcon')).toEqual({
      OR: [{ lineage: 'iskcon' }, { lineage: null }],
    });
  });
});
