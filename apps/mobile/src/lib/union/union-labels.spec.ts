import {
  INTENTION_LABELS,
  INTENTION_TYPES,
  initialOf,
  nameWithAge,
  profileSubtitle,
  tileAccessibilityLabel,
  yearsSuffix,
} from './union-labels';

describe('yearsSuffix', () => {
  it.each([
    [1, 'год'],
    [21, 'год'],
    [22, 'года'],
    [24, 'года'],
    [25, 'лет'],
    [11, 'лет'],
    [12, 'лет'],
    [14, 'лет'],
    [111, 'лет'],
    [30, 'лет'],
  ])('%i — %s', (age, expected) => {
    expect(yearsSuffix(age)).toBe(expected);
  });
});

describe('подписи анкеты', () => {
  it('цели — в том же порядке и теми же словами, что на сайте', () => {
    expect(INTENTION_TYPES).toEqual(['family', 'business', 'friendship', 'service']);
    expect(INTENTION_LABELS.family).toBe('Создание семьи');
  });

  it('возраст приклеивается к имени, только если он известен', () => {
    expect(nameWithAge({ name: 'Радха', age: 27 })).toBe('Радха, 27');
    expect(nameWithAge({ name: 'Радха', age: null })).toBe('Радха');
  });

  it('строка под именем собирается из того, что есть', () => {
    expect(profileSubtitle({ age: 27, city: 'Алматы', spiritualStage: 'yogi' })).toBe('27 лет · Алматы · Йог');
    expect(profileSubtitle({ age: null, city: 'Казань', spiritualStage: null })).toBe('Казань');
  });

  it('пустая строка под именем — прочерк, а не дыра', () => {
    expect(profileSubtitle({ age: null, city: null, spiritualStage: null })).toBe('—');
  });

  it('скринридер слышит и совместимость, и принятое решение', () => {
    expect(tileAccessibilityLabel({ name: 'Говинда', age: 30 }, 82, null)).toBe('Говинда, 30 — совместимость 82%');
    expect(tileAccessibilityLabel({ name: 'Говинда', age: 30 }, 82, 'pass')).toBe(
      'Говинда, 30 — совместимость 82%, вы пропускали эту анкету',
    );
  });

  it('заглушка вместо фото — первая буква, а у пустого имени — знак вопроса', () => {
    expect(initialOf(' радха')).toBe('Р');
    expect(initialOf('')).toBe('?');
  });
});
