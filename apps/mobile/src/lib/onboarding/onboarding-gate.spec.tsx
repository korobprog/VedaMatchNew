import { act, create } from 'react-test-renderer';
import { OnboardingGateProvider, useOnboardingGate, type OnboardingGate } from './onboarding-gate';

/**
 * Провайдер развилки: он держит единственное состояние — закрыт ли онбординг
 * на эту сессию — и обязан сбрасывать его при выходе из аккаунта. Само
 * решение считает `shouldShowOnboarding`, у неё свой тест; здесь проверяется
 * склейка с сессией, которую чистая функция не видит.
 */
// Имя с `mock` — требование jest: фабрика `jest.mock` не пускает к себе
// внешние переменные с другими именами.
let mockSessionState = {
  status: 'signed' as 'loading' | 'guest' | 'signed',
  user: { gender: null, spiritualStage: null } as { gender: string | null; spiritualStage: string | null } | null,
};

jest.mock('@/lib/auth/session', () => ({ __esModule: true, useSession: () => mockSessionState }));

function mount(): { gate: () => OnboardingGate; rerender: () => void } {
  let current!: OnboardingGate;
  function Probe() {
    current = useOnboardingGate();
    return null;
  }
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <OnboardingGateProvider>
        <Probe />
      </OnboardingGateProvider>,
    );
  });
  return {
    gate: () => current,
    rerender: () =>
      act(() => {
        renderer.update(
          <OnboardingGateProvider>
            <Probe />
          </OnboardingGateProvider>,
        );
      }),
  };
}

beforeEach(() => {
  mockSessionState = { status: 'signed', user: { gender: null, spiritualStage: null } };
});

describe('OnboardingGateProvider', () => {
  it('новичку показывает экран вопросов', () => {
    expect(mount().gate().visible).toBe(true);
  });

  it('заполнившему — нет', () => {
    mockSessionState.user = { gender: 'male', spiritualStage: 'yogi' };
    expect(mount().gate().visible).toBe(false);
  });

  it('«Позже» убирает экран до следующего запуска', () => {
    const { gate } = mount();
    act(() => gate().defer());
    expect(gate().visible).toBe(false);
  });

  it('сохранённые ответы убирают экран, не дожидаясь перечитанного профиля', () => {
    const { gate } = mount();
    act(() => gate().complete());
    expect(gate().visible).toBe(false);
  });

  // Отложенное предыдущим человеком не должно достаться следующему: иначе
  // вошедший после чужого выхода новичок не увидит вопросов вовсе.
  it('выход из аккаунта снимает отложенное', () => {
    const { gate, rerender } = mount();
    act(() => gate().defer());
    mockSessionState = { status: 'guest', user: null };
    rerender();
    mockSessionState = { status: 'signed', user: { gender: null, spiritualStage: null } };
    rerender();
    expect(gate().visible).toBe(true);
  });
});
