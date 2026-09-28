import { lineageFilterIds } from '@vedamatch/shared';
import { lineageFeedCondition } from './lineage-feed-filter';

describe('lineageFeedCondition', () => {
  it('без фильтра условия нет', () => {
    expect(lineageFeedCondition(null)).toBeNull();
    expect(lineageFeedCondition([])).toBeNull();
  });

  it('одна линия — равенство плюс материалы для всех', () => {
    expect(lineageFeedCondition(['ipbys'])).toEqual({
      OR: [{ lineage: 'ipbys' }, { lineage: null }],
    });
  });

  it('группа — любая её линия плюс материалы для всех (VED-568)', () => {
    expect(
      lineageFeedCondition(lineageFilterIds('group:gaudiya_math')),
    ).toEqual({
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

  it('несколько линий из «Фильтров материалов» (VED-617)', () => {
    expect(lineageFeedCondition(['iskcon', 'advaita_vamsha'])).toEqual({
      OR: [
        { lineage: { in: ['iskcon', 'advaita_vamsha'] } },
        { lineage: null },
      ],
    });
  });
});
