import type { SelfIdentificationAnswers } from '@vedamatch/shared';
import {
  DEFAULT_ANSWERS,
  asksLineage,
  buildOnboardingSubmit,
  initialValues,
  needsOnboarding,
  onboardingSteps,
  stepError,
  type OnboardingValues,
} from './onboarding-steps';

/** Ответы, которые `detectSpiritualStage` читает как «преданный» (4 признака). */
const devoteeAnswers: SelfIdentificationAnswers = {
  ...DEFAULT_ANSWERS,
  hasMentor: true,
  hasCommunity: true,
  hasSpiritualName: true,
  participatesInService: true,
};

function values(over: Partial<OnboardingValues> = {}): OnboardingValues {
  return { gender: 'male', answers: DEFAULT_ANSWERS, lineage: '', ...over };
}

describe('needsOnboarding', () => {
  // Условие повторяет `needsWelcome` сайта (`apps/web/src/lib/welcome.ts`).
  // Разойдясь, сайт продолжал бы уводить в свой мастер того, кто прошёл
  // онбординг в приложении.
  it('спрашивает, пока нет этапа пути или пола', () => {
    expect(needsOnboarding({ spiritualStage: null, gender: 'male' })).toBe(true);
    expect(needsOnboarding({ spiritualStage: 'practitioner', gender: null })).toBe(true);
  });

  it('заполнившего не трогает', () => {
    expect(needsOnboarding({ spiritualStage: 'practitioner', gender: 'female' })).toBe(false);
  });
});

describe('onboardingSteps', () => {
  it('новичку — оба шага', () => {
    expect(onboardingSteps({ spiritualStage: null })).toEqual(['Кто вы', 'Ваш путь']);
  });

  // Анкету старому аккаунту не переигрываем: ответы по умолчанию переписали
  // бы уже определённый этап пути на «ищущего».
  it('аккаунту с этапом пути оставляет только вопрос о поле', () => {
    expect(onboardingSteps({ spiritualStage: 'devotee' })).toEqual(['Кто вы']);
  });
});

describe('initialValues', () => {
  it('подставляет уже известный пол и не выдумывает линию', () => {
    expect(initialValues({ gender: 'female' })).toEqual({
      gender: 'female',
      answers: DEFAULT_ANSWERS,
      lineage: '',
    });
    expect(initialValues({ gender: null }).gender).toBe('');
  });
});

describe('asksLineage', () => {
  it('спрашивает линию, когда ответы сложились в преданного', () => {
    expect(asksLineage(['Кто вы', 'Ваш путь'], devoteeAnswers)).toBe(true);
  });

  it('не спрашивает у йога и практикующего', () => {
    expect(asksLineage(['Кто вы', 'Ваш путь'], { ...DEFAULT_ANSWERS, regularPractice: 'daily' })).toBe(false);
    expect(asksLineage(['Кто вы', 'Ваш путь'], DEFAULT_ANSWERS)).toBe(false);
  });

  // Анкеты нет — значит, этап у человека уже есть и считать его по пустым
  // ответам нельзя: вопрос о линии задаёт сайт (`lineage-prompt.tsx`).
  it('не спрашивает, когда анкету не показывают', () => {
    expect(asksLineage(['Кто вы'], devoteeAnswers)).toBe(false);
  });
});

describe('stepError', () => {
  it('без пола с первого шага не уйти', () => {
    expect(stepError('Кто вы', values({ gender: '' }))).toMatch(/пол/i);
  });

  it('с полом — уйти можно', () => {
    expect(stepError('Кто вы', values())).toBeNull();
  });

  it('анкета уйти не мешает: значения по умолчанию осмысленные', () => {
    expect(stepError('Ваш путь', values({ gender: '' }))).toBeNull();
  });
});

describe('buildOnboardingSubmit', () => {
  const steps = ['Кто вы', 'Ваш путь'] as const;

  it('новичок отправляет пол и анкету', () => {
    expect(buildOnboardingSubmit(values(), steps)).toEqual({
      profile: { gender: 'male' },
      answers: DEFAULT_ANSWERS,
    });
  });

  it('преданный с выбранной линией отправляет и её', () => {
    const submit = buildOnboardingSubmit(values({ answers: devoteeAnswers, lineage: 'iskcon' }), steps);
    expect(submit.profile).toEqual({ gender: 'male', lineage: 'iskcon' });
  });

  // Пустое поле не должно стирать линию, указанную раньше на сайте.
  it('пропущенная линия в тело запроса не попадает', () => {
    const submit = buildOnboardingSubmit(values({ answers: devoteeAnswers }), steps);
    expect('lineage' in submit.profile).toBe(false);
  });

  // Выбор мог остаться от ответов, которые человек потом переиграл: линию
  // спрашивают только у преданного, и у йога она уйти не должна.
  it('линия не уходит, если по ответам человек уже не преданный', () => {
    const submit = buildOnboardingSubmit(values({ lineage: 'iskcon' }), steps);
    expect('lineage' in submit.profile).toBe(false);
  });

  it('аккаунту без анкеты отправляет только профиль', () => {
    expect(buildOnboardingSubmit(values(), ['Кто вы'])).toEqual({
      profile: { gender: 'male' },
      answers: null,
    });
  });
});
