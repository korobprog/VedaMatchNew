import type { UnionProfileCompleteness, UnionProfileDto } from '@vedamatch/shared';
import {
  ageRangeValue,
  canAddCustomTag,
  canChooseFamily,
  evenWeights,
  intentionSum,
  intentionsOf,
  isEvenSplit,
  listValue,
  mergePatch,
  normalizeWeights,
  parseAgeRange,
  parseBoundedNumber,
  progressHint,
  progressTone,
  seeksGenderAfter,
  stepWeight,
  toDraft,
  toggleIntention,
  toggleTag,
  toWeights,
  MAX_LIST_ITEMS,
} from './union-profile-form';

const none = { family: 0, business: 0, friendship: 0, service: 0 };

describe('цели знакомства', () => {
  it('новичок начинает с ровных весов', () => {
    expect(toWeights(null)).toEqual({ family: 25, business: 25, friendship: 25, service: 25 });
  });

  it('веса сохранённой анкеты — как есть', () => {
    const profile = { intentions: [{ type: 'family', weight: 70 }, { type: 'service', weight: 30 }] } as UnionProfileDto;
    expect(toWeights(profile)).toEqual({ ...none, family: 70, service: 30 });
  });

  it('поровну — ровно 100, остаток первым по порядку', () => {
    expect(evenWeights(['family', 'business', 'service'])).toEqual({ family: 34, business: 33, friendship: 0, service: 33 });
    expect(intentionSum(evenWeights(['friendship']))).toBe(100);
    expect(evenWeights([])).toEqual({ family: 25, business: 25, friendship: 25, service: 25 });
  });

  it('ручную настройку отличает от галочек', () => {
    expect(isEvenSplit({ ...none, family: 50, service: 50 })).toBe(true);
    expect(isEvenSplit({ ...none, family: 70, service: 30 })).toBe(false);
    expect(isEvenSplit(none)).toBe(false);
  });

  it('«Выровнять до 100%» пропорционально', () => {
    const result = normalizeWeights({ ...none, family: 60, business: 60 });
    expect(intentionSum(result)).toBe(100);
    expect(result.family).toBe(result.business);
    expect(normalizeWeights(none)).toEqual({ family: 25, business: 25, friendship: 25, service: 25 });
  });

  it('шаг ±5 не уходит за 0 и 100', () => {
    expect(stepWeight({ ...none, family: 5 }, 'family', -5).family).toBe(0);
    expect(stepWeight({ ...none, family: 0 }, 'family', -5).family).toBe(0);
    expect(stepWeight({ ...none, family: 100 }, 'family', 5).family).toBe(100);
  });

  it('в запрос уходят только ненулевые цели', () => {
    expect(intentionsOf({ ...none, family: 60, service: 40 })).toEqual([
      { type: 'family', weight: 60 },
      { type: 'service', weight: 40 },
    ]);
  });

  it('галочка: добавляет цель поровну, последнюю снять нельзя', () => {
    const one = evenWeights(['business']);
    expect(toggleIntention(one, 'friendship', 30)).toEqual(evenWeights(['business', 'friendship']));
    expect(toggleIntention(one, 'business', 30)).toBeNull();
  });

  it('семью можно искать только с 18 и с известным возрастом', () => {
    expect(canChooseFamily(null)).toBe(false);
    expect(canChooseFamily(17)).toBe(false);
    expect(canChooseFamily(18)).toBe(true);
    const one = evenWeights(['business']);
    expect(toggleIntention(one, 'family', 17)).toBe(one);
  });

  it('отметили семью — подставляем противоположный пол; сняли — сбрасываем', () => {
    const before = evenWeights(['business']);
    const after = evenWeights(['business', 'family']);
    expect(seeksGenderAfter(before, after, null, 'male')).toBe('female');
    expect(seeksGenderAfter(before, after, null, null)).toBeUndefined();
    expect(seeksGenderAfter(after, before, 'female', 'male')).toBeNull();
    expect(seeksGenderAfter(after, after, 'female', 'male')).toBeUndefined();
  });
});

describe('черновик и сохранение', () => {
  it('статус и «о себе» — из портального профиля, даже без анкеты', () => {
    const draft = toDraft(null, { statusLine: 'Харе Кришна', about: 'Люблю киртан' });
    expect(draft.status).toBe('Харе Кришна');
    expect(draft.about).toBe('Люблю киртан');
    expect(draft.isActive).toBe(true);
    expect(draft.contactMode).toBe('requests');
  });

  it('правки копятся в один запрос, цели — в каждом', () => {
    const weights = evenWeights(['family']);
    const first = mergePatch(null, { heightCm: 170 }, weights);
    const second = mergePatch(first, { diet: 'vegan' }, weights);
    expect(second).toEqual({ heightCm: 170, diet: 'vegan', intentions: [{ type: 'family', weight: 100 }] });
  });
});

describe('поля', () => {
  it('список — три и «+N»', () => {
    expect(listValue([])).toBeNull();
    expect(listValue(['а', 'б'])).toBe('а, б');
    expect(listValue(['а', 'б', 'в', 'г', 'д'])).toBe('а, б, в +2');
  });

  it('число в пределах; пусто — «не указано»', () => {
    expect(parseBoundedNumber('', 120, 230)).toEqual({ ok: true, value: null });
    expect(parseBoundedNumber(' 172 ', 120, 230)).toEqual({ ok: true, value: 172 });
    expect(parseBoundedNumber('17.5', 120, 230).ok).toBe(false);
    expect(parseBoundedNumber('300', 120, 230)).toEqual({ ok: false, message: 'От 120 до 230.' });
  });

  it('возраст партнёра: «от» не выше «до»', () => {
    expect(parseAgeRange('25', '35')).toEqual({ ok: true, min: 25, max: 35 });
    expect(parseAgeRange('', '')).toEqual({ ok: true, min: null, max: null });
    expect(parseAgeRange('40', '30').ok).toBe(false);
    expect(parseAgeRange('10', '').ok).toBe(false);
    expect(ageRangeValue(25, null)).toBe('от 25 до 100 лет');
    expect(ageRangeValue(null, null)).toBeNull();
  });

  it('теги переключаются без учёта регистра и не растут сверх предела', () => {
    expect(toggleTag(['Йога'], 'йога ')).toEqual([]);
    expect(toggleTag([], ' киртан ')).toEqual(['киртан']);
    const full = Array.from({ length: MAX_LIST_ITEMS }, (_, i) => `тег ${i}`);
    expect(toggleTag(full, 'ещё')).toHaveLength(MAX_LIST_ITEMS);
  });

  it('свой тег — не повтор выбранного и не повтор варианта из списка', () => {
    const options = [{ value: 'йога' }];
    expect(canAddCustomTag('гончарное дело', [], options)).toBe(true);
    expect(canAddCustomTag('Йога', [], options)).toBe(false);
    expect(canAddCustomTag('лепка', ['Лепка'], options)).toBe(false);
    expect(canAddCustomTag('   ', [], options)).toBe(false);
    expect(canAddCustomTag('я'.repeat(101), [], options)).toBe(false);
  });
});

describe('прогресс анкеты', () => {
  const base: UnionProfileCompleteness = { percent: 50, items: [], missing: [], next: null };

  it('тон полосы по готовности', () => {
    expect(progressTone(20)).toBe('magenta');
    expect(progressTone(40)).toBe('gold');
    expect(progressTone(70)).toBe('cyan');
  });

  it('без фото — сначала о фото: лента ставит анкеты с фото выше', () => {
    expect(progressHint({ ...base, items: [{ key: 'photos', weight: 20, filled: false }], next: 'about' })).toMatch(/с фото/);
  });

  it('с фото — что заполнить дальше, а в конце — что всё готово', () => {
    const withPhotos = { ...base, items: [{ key: 'photos' as const, weight: 20, filled: true }] };
    expect(progressHint({ ...withPhotos, next: 'diet' })).toBe('Дальше: Питание');
    expect(progressHint(withPhotos)).toMatch(/заполнена полностью/);
  });
});
