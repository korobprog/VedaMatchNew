import { nextDismissal, shouldShowOnboarding, type OnboardingInput } from './onboarding-decision';

/**
 * Решение «показывать ли онбординг» — единственное место, где приложение
 * может либо навсегда оставить человека без самоопределения (VED-333), либо,
 * наоборот, запереть в анкете того, кто всё уже заполнил. Поэтому проверяется
 * по всем состояниям сессии, а не только по счастливому пути.
 */
const newcomer = { spiritualStage: null, gender: null } as const;
const filled = { spiritualStage: 'practitioner', gender: 'male' } as const;

function show(over: Partial<OnboardingInput> = {}): boolean {
  return shouldShowOnboarding({ status: 'signed', user: newcomer, dismissal: null, ...over });
}

describe('shouldShowOnboarding', () => {
  it('новичка после входа ведёт в онбординг', () => {
    expect(show()).toBe(true);
  });

  it('старый аккаунт без пола тоже спрашивают — как мастер сайта', () => {
    expect(show({ user: { spiritualStage: 'devotee', gender: null } })).toBe(true);
  });

  it('аккаунт без этапа пути спрашивают, даже если пол указан', () => {
    expect(show({ user: { spiritualStage: null, gender: 'female' } })).toBe(true);
  });

  it('заполнившего не трогают', () => {
    expect(show({ user: filled })).toBe(false);
  });

  it('гостю и на восстановлении сессии не показывают ничего', () => {
    expect(show({ status: 'guest' })).toBe(false);
    expect(show({ status: 'loading' })).toBe(false);
  });

  it('нажавшему «Позже» не показывают до следующего запуска', () => {
    expect(show({ dismissal: 'deferred' })).toBe(false);
  });

  it('ответившему не показывают, даже пока профиль в сессии не перечитан', () => {
    expect(show({ dismissal: 'done' })).toBe(false);
  });

  // Сессия жива, а профиля нет — это «не знаем», а не «человек без
  // самоопределения»: `session.tsx` пускает в приложение по сохранённым
  // токенам, когда `GET /users/me` не прошёл по сети.
  it('без загруженного профиля вопросов не задаёт', () => {
    expect(show({ user: null })).toBe(false);
  });
});

describe('nextDismissal', () => {
  it('у вошедшего отметка сохраняется', () => {
    expect(nextDismissal('deferred', 'signed')).toBe('deferred');
    expect(nextDismissal('done', 'signed')).toBe('done');
  });

  it('выход из аккаунта снимает отметку — следующий вошедший другой человек', () => {
    expect(nextDismissal('deferred', 'guest')).toBeNull();
    expect(nextDismissal('done', 'loading')).toBeNull();
  });
});
