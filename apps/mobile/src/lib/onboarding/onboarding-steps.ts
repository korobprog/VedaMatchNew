import {
  detectSpiritualStage,
  type Gender,
  type LineageId,
  type ProfileUpdateRequest,
  type SelfIdentificationAnswers,
  type SpiritualStage,
} from '@vedamatch/shared';

/**
 * Онбординг новичка в приложении (VED-333): что спросить и что из этого
 * отправить на сервер.
 *
 * Зачем он вообще. На сайте зарегистрировавшийся попадает в мастер
 * `/welcome` — без пола Знакомства не показывают человека никому, а без
 * этапа пути портал не знает, что ему показывать, и пять страниц подряд
 * уводят в мастер редиректом. В приложении этой развилки не было вовсе:
 * зарегистрировавшийся с телефона навсегда оставался без самоопределения.
 *
 * Чем отличается от сайта. Мастер сайта спрашивает ещё имя, город и фото;
 * здесь их нет. Имя и фотографию правит экран «Профиль» (VED-332) — второй
 * ввод тех же полей в первые минуты был бы просто анкетой подлиннее, а
 * бросают именно из-за длины. Город — геокодер, которого в приложении нет.
 * Остаётся то, без чего портал не работает: пол и этап пути, и духовная
 * линия следом, если по ответам человек преданный.
 *
 * Условие входа повторяет `needsWelcome` сайта (`apps/web/src/lib/welcome.ts`)
 * буквально. Разойтись им нельзя: сайт с тем же аккаунтом продолжал бы
 * уводить человека в свой мастер после пройденного онбординга.
 */

export type OnboardingStep = 'Кто вы' | 'Ваш путь';

/** Что человек успел ответить: одно состояние на оба шага. */
export interface OnboardingValues {
  gender: Gender | '';
  answers: SelfIdentificationAnswers;
  /** Пустая строка — линию не выбрали: её не спрашивали либо пропустили. */
  lineage: LineageId | '';
}

/**
 * Ответы по умолчанию — те же, что в форме сайта
 * (`self-identification-questions.tsx`). Совпадать они обязаны: этап
 * считается по ответам, и разные значения по умолчанию означали бы, что
 * молча согласившийся с формой получает на сайте и в приложении разный этап.
 */
export const DEFAULT_ANSWERS: SelfIdentificationAnswers = {
  interest: 'beginning',
  regularPractice: 'none',
  currentFocus: 'curiosity',
  hasMentor: false,
  hasCommunity: false,
  hasSpiritualName: false,
  participatesInService: false,
  wantsRecommendations: true,
};

export function initialValues(user: { gender: Gender | null }): OnboardingValues {
  return { gender: user.gender ?? '', answers: DEFAULT_ANSWERS, lineage: '' };
}

/**
 * Нужен ли человеку онбординг. Копия `needsWelcome` сайта: этап пути — то,
 * без чего портал не знает, что показывать; пол — то, без чего Знакомства не
 * показывают человека никому.
 */
export function needsOnboarding(user: {
  spiritualStage: SpiritualStage | null;
  gender: Gender | null;
}): boolean {
  return !user.spiritualStage || !user.gender;
}

/**
 * Какие шаги показать. Новичку — оба. Аккаунту, у которого этап уже есть, а
 * пола нет (поле появилось позже анкеты), — только первый: гонять его по
 * анкете заново значит предложить переписать уже определённый этап ответами
 * по умолчанию. Ровно то же правило, что у `welcomeSteps` на сайте.
 */
export function onboardingSteps(user: { spiritualStage: SpiritualStage | null }): OnboardingStep[] {
  return user.spiritualStage ? ['Кто вы'] : ['Кто вы', 'Ваш путь'];
}

/**
 * Спрашивать ли духовную линию. Считается той же `detectSpiritualStage`, что
 * и на сервере, и прямо по ходу ответов — вопрос появляется сразу, как
 * только ответы складываются в «преданного», а не отдельным экраном после
 * отправки. У йога и практикующего его не будет: к ним деление на линии не
 * относится (`packages/shared/src/lineage.ts`).
 */
export function asksLineage(steps: readonly OnboardingStep[], answers: SelfIdentificationAnswers): boolean {
  return steps.includes('Ваш путь') && detectSpiritualStage(answers) === 'devotee';
}

/**
 * Почему нельзя уйти с шага, или `null`. Пол — единственный обязательный
 * ответ: на сайте первый шаг мастера тоже непропускаемый. Анкета уйти не
 * мешает — значения по умолчанию у неё осмысленные («только начинаю»).
 */
export function stepError(step: OnboardingStep, values: OnboardingValues): string | null {
  if (step === 'Кто вы' && !values.gender) {
    return 'Выберите пол — без него Знакомства не покажут вас никому.';
  }
  return null;
}

export interface OnboardingSubmit {
  profile: ProfileUpdateRequest;
  /** `null` — анкету не показывали, отправлять нечего. */
  answers: SelfIdentificationAnswers | null;
}

/**
 * Что уедет на сервер. Двумя запросами, как и на сайте: портальный профиль
 * (`PATCH /profile`) и анкета (`POST /self-identification/submit`), этап
 * считает сервер сам.
 *
 * Линия попадает в тело, только когда её спрашивали И выбрали: пустое поле
 * не должно стирать уже указанную, а у не-преданного её и не спрашивают.
 */
export function buildOnboardingSubmit(
  values: OnboardingValues,
  steps: readonly OnboardingStep[],
): OnboardingSubmit {
  const withLineage = asksLineage(steps, values.answers) && values.lineage !== '';
  return {
    profile: {
      ...(values.gender ? { gender: values.gender } : {}),
      ...(withLineage ? { lineage: values.lineage as LineageId } : {}),
    },
    answers: steps.includes('Ваш путь') ? values.answers : null,
  };
}
