import fs from 'node:fs';
import path from 'node:path';
import type { UnionProfileDetails } from '@vedamatch/shared';
import {
  UNION_INTEREST_OPTIONS,
  UNION_LANGUAGE_OPTIONS,
  UNION_PET_OPTIONS,
  UNION_SKILL_OPTIONS,
  UNION_VALUE_OPTIONS,
  profileDetailRows,
} from './union-dictionaries';

const EMPTY: UnionProfileDetails = {
  status: null,
  heightCm: null,
  diet: null,
  regulativePrinciples: [],
  childrenStatus: null,
  education: null,
  spiritualEducation: null,
  housing: null,
  income: null,
  pets: [],
  ageRangeMin: null,
  ageRangeMax: null,
};

describe('profileDetailRows', () => {
  it('пустая анкета не даёт ни одной строки', () => {
    expect(profileDetailRows(EMPTY)).toEqual([]);
  });

  it('заполненные поля — подписями, в порядке сайта', () => {
    const rows = profileDetailRows({
      ...EMPTY,
      heightCm: 172,
      diet: 'prasadam_only',
      regulativePrinciples: ['no_meat', 'no_gambling'],
      pets: ['кошка', 'собака'],
    });
    expect(rows).toEqual([
      { label: 'Рост', value: '172 см' },
      { label: 'Питание', value: 'только прасад' },
      { label: 'Регулирующие принципы', value: 'не ем мясо, рыбу и яйца, не играю в азартные игры' },
      { label: 'Домашние животные', value: 'кошка, собака' },
    ]);
  });
});

/**
 * Теги — данные, а не подписи: по ним сервер считает совместимость, и
 * «йога» из приложения обязана быть той же строкой, что «йога» с сайта.
 * Поэтому сверяемся с исходником сайта напрямую, а не с копией в тесте.
 */
describe('теги совпадают с сайтом буква в букву', () => {
  const webSource = fs.readFileSync(
    path.join(__dirname, '../../../../web/src/components/union/dictionaries.ts'),
    'utf8',
  );
  const webTags = new Set([...webSource.matchAll(/tag\("([^"]+)"/g)].map((match) => match[1]));

  it.each([
    ['языки', UNION_LANGUAGE_OPTIONS],
    ['навыки', UNION_SKILL_OPTIONS],
    ['интересы', UNION_INTEREST_OPTIONS],
    ['ценности', UNION_VALUE_OPTIONS],
    ['питомцы', UNION_PET_OPTIONS],
  ])('%s', (_name, options) => {
    const missing = options.map((option) => option.value).filter((value) => !webTags.has(value));
    expect(missing).toEqual([]);
  });

  it('и ни один тег сайта не потерян', () => {
    const mine = new Set(
      [UNION_LANGUAGE_OPTIONS, UNION_SKILL_OPTIONS, UNION_INTEREST_OPTIONS, UNION_VALUE_OPTIONS, UNION_PET_OPTIONS]
        .flat()
        .map((option) => option.value),
    );
    expect([...webTags].filter((value) => !mine.has(value))).toEqual([]);
  });
});
