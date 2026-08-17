import {
  normalizeCity,
  subscriptionTargetKey,
} from './subscription-target-key';

const key = subscriptionTargetKey;

describe('subscriptionTargetKey', () => {
  it('разводит подписки разных видов', () => {
    expect(
      key({
        kind: 'rubric',
        rubricSlug: 'giveaway',
        city: null,
        communityId: null,
      }),
    ).toBe('rubric:giveaway');
    expect(
      key({
        kind: 'city',
        rubricSlug: null,
        city: 'Москва',
        communityId: null,
      }),
    ).toBe('city:москва');
    expect(
      key({
        kind: 'community',
        rubricSlug: null,
        city: null,
        communityId: 'c1',
      }),
    ).toBe('community:c1');
  });

  it('город нормализуется — иначе уведомление придёт дважды', () => {
    const a = key({
      kind: 'city',
      rubricSlug: null,
      city: ' МОСКВА ',
      communityId: null,
    });
    const b = key({
      kind: 'city',
      rubricSlug: null,
      city: 'москва',
      communityId: null,
    });
    expect(a).toBe(b);
  });

  it('ё и е — один город', () => {
    expect(normalizeCity('Щёлково')).toBe(normalizeCity('Щелково'));
  });

  it('одна рубрика — один ключ, сколько бы раз ни подписались', () => {
    const a = key({
      kind: 'rubric',
      rubricSlug: 'seva',
      city: null,
      communityId: null,
    });
    const b = key({
      kind: 'rubric',
      rubricSlug: 'seva',
      city: 'Москва',
      communityId: 'c1',
    });
    // Лишние поля на ключ рубрики не влияют: иначе дедупликация развалилась бы.
    expect(a).toBe(b);
  });
});
