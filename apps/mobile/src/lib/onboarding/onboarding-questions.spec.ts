import { detectSpiritualStage } from '@vedamatch/shared';
import {
  FLAG_QUESTIONS,
  FOCUS_QUESTION,
  GENDER_OPTIONS,
  INTEREST_QUESTION,
  PRACTICE_QUESTION,
} from './onboarding-questions';
import { DEFAULT_ANSWERS } from './onboarding-steps';

/**
 * Анкета обязана спрашивать ровно то же, что форма сайта: этап считается по
 * ответам, и недостающий вариант означал бы, что с телефона до «преданного»
 * дойти нельзя в принципе. Тест сторожит наборы значений, а не вёрстку.
 */
describe('варианты ответа', () => {
  it('интерес — четыре значения домена', () => {
    expect(INTEREST_QUESTION.options.map((o) => o.value)).toEqual([
      'beginning',
      'learning',
      'deepening',
      'devotional_service',
    ]);
  });

  it('практика — четыре значения домена', () => {
    expect(PRACTICE_QUESTION.options.map((o) => o.value)).toEqual([
      'none',
      'sometimes',
      'daily',
      'strict_daily',
    ]);
  });

  it('фокус — четыре значения домена', () => {
    expect(FOCUS_QUESTION.options.map((o) => o.value)).toEqual([
      'curiosity',
      'basic_practice',
      'deep_practice',
      'service_community',
    ]);
  });

  it('галочки — все пять полей анкеты', () => {
    expect(FLAG_QUESTIONS.map((f) => f.key)).toEqual([
      'hasMentor',
      'hasCommunity',
      'hasSpiritualName',
      'participatesInService',
      'wantsRecommendations',
    ]);
  });

  it('пол — те же два значения, что принимает сервер', () => {
    expect(GENDER_OPTIONS.map((o) => o.value)).toEqual(['male', 'female']);
  });

  it('у каждого варианта есть подпись по-русски', () => {
    const all = [...INTEREST_QUESTION.options, ...PRACTICE_QUESTION.options, ...FOCUS_QUESTION.options];
    for (const option of all) expect(option.label.trim().length).toBeGreaterThan(0);
  });
});

/**
 * Через анкету должен быть достижим каждый этап — иначе часть портала
 * недоступна человеку, зарегистрировавшемуся с телефона.
 */
describe('достижимость этапов', () => {
  it('ответы по умолчанию дают «ищущего»', () => {
    expect(detectSpiritualStage(DEFAULT_ANSWERS)).toBe('seeker');
  });

  it('крайние варианты складываются в «преданного»', () => {
    expect(
      detectSpiritualStage({
        ...DEFAULT_ANSWERS,
        interest: 'devotional_service',
        regularPractice: 'strict_daily',
        currentFocus: 'service_community',
        hasMentor: true,
      }),
    ).toBe('devotee');
  });

  it('средние — «практикующего» и «йога»', () => {
    expect(detectSpiritualStage({ ...DEFAULT_ANSWERS, regularPractice: 'sometimes' })).toBe('practitioner');
    expect(detectSpiritualStage({ ...DEFAULT_ANSWERS, regularPractice: 'daily' })).toBe('yogi');
  });
});
