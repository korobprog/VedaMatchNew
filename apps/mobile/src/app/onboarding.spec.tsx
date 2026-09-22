import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { ApiError } from '@/lib/api/client';
import OnboardingScreen from './onboarding';

/**
 * Экран онбординга (VED-333). Чистые правила — какие шаги, что уходит на
 * сервер, показывать ли экран вообще — проверены в `lib/onboarding/*.spec.ts`;
 * здесь проверяется то, что видит и делает человек: что без пола дальше не
 * пускают, что вопрос о линии появляется по ответам, что ответы уезжают
 * двумя запросами, и что отказ сети не выкидывает его из онбординга с
 * потерянными ответами.
 */

const mockSaveProfile = jest.fn<Promise<unknown>, [unknown]>(async () => ({}));
const mockSubmitAnswers = jest.fn<Promise<unknown>, [unknown]>(async () => ({}));
const mockReloadUser = jest.fn<Promise<void>, []>(async () => undefined);
const mockComplete = jest.fn();
const mockDefer = jest.fn();

let sessionUser: { gender: string | null; spiritualStage: string | null } = {
  gender: null,
  spiritualStage: null,
};

jest.mock('expo-router', () => ({ __esModule: true, Stack: { Screen: () => null } }));

jest.mock('react-native-safe-area-context', () => ({
  __esModule: true,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// Сессия — один и тот же объект на все рендеры: новый литерал менял бы `api`,
// а с ним и `useMemo` клиента онбординга. Тот же приём, что в `profile.spec.tsx`.
const mockSession = {
  api: {},
  get user() {
    return sessionUser;
  },
  reloadUser: () => mockReloadUser(),
};
jest.mock('@/lib/auth/session', () => ({ __esModule: true, useSession: () => mockSession }));

jest.mock('@/lib/onboarding/onboarding-gate', () => ({
  __esModule: true,
  useOnboardingGate: () => ({ visible: true, complete: () => mockComplete(), defer: () => mockDefer() }),
}));

jest.mock('@/theme/theme', () => ({
  __esModule: true,
  useTheme: () => ({ colors: jest.requireActual('@/theme/tokens').light }),
}));

jest.mock('@/lib/feedback', () => ({ __esModule: true, confirmTap: () => undefined }));

// Подменяется только клиент: `describeProfileError` остаётся настоящей —
// человек должен видеть тот же текст отказа, что и на экране «Профиль».
jest.mock('@/lib/onboarding/onboarding-api', () => {
  const actual = jest.requireActual('@/lib/onboarding/onboarding-api');
  return {
    ...actual,
    __esModule: true,
    createOnboardingApi: () => ({
      saveProfile: (body: unknown) => mockSaveProfile(body),
      submitAnswers: (body: unknown) => mockSubmitAnswers(body),
    }),
  };
});

/** Весь текст экрана одной строкой. */
function texts(renderer: ReactTestRenderer): string {
  const found: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === 'string') {
      found.push(node);
      return;
    }
    if (Array.isArray(node)) {
      for (const child of node) walk(child);
      return;
    }
    if (node && typeof node === 'object' && 'children' in node) walk((node as { children: unknown }).children);
  };
  walk(renderer.toJSON());
  // Пробелы схлопываются: `Text` режет строку с подстановками на куски, и
  // «Шаг 1 из 2» собирается обратно с двойными пробелами между ними.
  return found.join(' ').replace(/\s+/g, ' ');
}

function byLabel(renderer: ReactTestRenderer, label: string): ReactTestInstance[] {
  return renderer.root.findAll(
    (node) =>
      typeof node.props?.onPress === 'function' &&
      typeof node.props?.accessibilityLabel === 'string' &&
      node.props.accessibilityLabel === label,
  );
}

function press(renderer: ReactTestRenderer, label: string): Promise<void> {
  const found = byLabel(renderer, label);
  if (found.length === 0) throw new Error(`Кнопки «${label}» на экране нет`);
  return act(async () => {
    found[0].props.onPress();
  });
}

function render(): ReactTestRenderer {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<OnboardingScreen />);
  });
  return renderer;
}

/** Пройти первый шаг: выбрать пол и нажать «Дальше». */
async function passFirstStep(renderer: ReactTestRenderer): Promise<void> {
  await press(renderer, 'Мужской');
  await press(renderer, 'Дальше');
}

/** Отметить четыре признака преданного. */
async function markDevotee(renderer: ReactTestRenderer): Promise<void> {
  for (const label of ['Есть наставник', 'Есть связь с общиной', 'Есть духовное имя', 'Участвую в служении']) {
    await press(renderer, label);
  }
}

beforeEach(() => {
  jest.clearAllMocks();
  sessionUser = { gender: null, spiritualStage: null };
});

describe('онбординг новичка', () => {
  it('начинается с вопроса о поле и говорит, зачем он', () => {
    const screen = texts(render());
    expect(screen).toContain('Шаг 1 из 2');
    expect(screen).toContain('Ваш пол');
    expect(screen).toContain('Знакомствах');
  });

  it('имя и фото не спрашивает — они на экране «Профиль»', () => {
    expect(texts(render())).toContain('Профиль');
    expect(byLabel(render(), 'Духовное имя')).toHaveLength(0);
  });

  it('без пола дальше не пускает и объясняет почему', async () => {
    const renderer = render();
    await press(renderer, 'Дальше');
    expect(texts(renderer)).toContain('Выберите пол');
    expect(texts(renderer)).toContain('Шаг 1 из 2');
  });

  it('с выбранным полом ведёт на анкету', async () => {
    const renderer = render();
    await passFirstStep(renderer);
    expect(texts(renderer)).toContain('Шаг 2 из 2');
    expect(texts(renderer)).toContain('Где вы на пути');
  });

  it('линию спрашивает только у преданного', async () => {
    const renderer = render();
    await passFirstStep(renderer);
    expect(texts(renderer)).not.toContain('К какой линии');
    await markDevotee(renderer);
    expect(texts(renderer)).toContain('К какой линии');
    expect(texts(renderer)).toContain('Гаудия-матх');
  });

  it('сохраняет пол, анкету и линию — двумя запросами', async () => {
    const renderer = render();
    await passFirstStep(renderer);
    await markDevotee(renderer);
    await press(renderer, 'ISKCON');
    await press(renderer, 'Готово');

    expect(mockSaveProfile).toHaveBeenCalledWith({ gender: 'male', lineage: 'iskcon' });
    expect(mockSubmitAnswers).toHaveBeenCalledWith(
      expect.objectContaining({ hasMentor: true, hasCommunity: true, interest: 'beginning' }),
    );
    // Профиль в сессии перечитан, иначе вопросы повторились бы.
    expect(mockReloadUser).toHaveBeenCalled();
    expect(mockComplete).toHaveBeenCalled();
  });

  it('пропущенную линию не отправляет', async () => {
    const renderer = render();
    await passFirstStep(renderer);
    await markDevotee(renderer);
    await press(renderer, 'Готово');
    expect(mockSaveProfile).toHaveBeenCalledWith({ gender: 'male' });
  });

  it('аккаунту с этапом пути показывает один шаг и анкету не шлёт', async () => {
    sessionUser = { gender: null, spiritualStage: 'devotee' };
    const renderer = render();
    expect(texts(renderer)).toContain('Шаг 1 из 1');
    await press(renderer, 'Мужской');
    await press(renderer, 'Готово');
    expect(mockSaveProfile).toHaveBeenCalledWith({ gender: 'male' });
    expect(mockSubmitAnswers).not.toHaveBeenCalled();
  });

  it('на отказе сети показывает ошибку и оставляет ответы на месте', async () => {
    mockSaveProfile.mockRejectedValueOnce(new ApiError(0, 'Нет связи с сервером.', null));
    const renderer = render();
    await passFirstStep(renderer);
    await press(renderer, 'Готово');

    expect(texts(renderer)).toContain('Нет связи с сервером.');
    expect(mockComplete).not.toHaveBeenCalled();
    expect(texts(renderer)).toContain('Шаг 2 из 2');

    // Повторное «Готово» работает: экран не заперт «сохраняем…» навсегда.
    await press(renderer, 'Готово');
    expect(mockSaveProfile).toHaveBeenCalledTimes(2);
    expect(mockComplete).toHaveBeenCalled();
  });

  it('упавшая анкета не засчитывает онбординг', async () => {
    mockSubmitAnswers.mockRejectedValueOnce(new ApiError(500, 'ой', null));
    const renderer = render();
    await passFirstStep(renderer);
    await press(renderer, 'Готово');
    expect(texts(renderer)).toContain('Сервер временно недоступен');
    expect(mockComplete).not.toHaveBeenCalled();
  });

  it('«Позже» откладывает, ничего не сохраняя', async () => {
    const renderer = render();
    await press(renderer, 'Ответить позже');
    expect(mockDefer).toHaveBeenCalled();
    expect(mockSaveProfile).not.toHaveBeenCalled();
  });

  it('с анкеты можно вернуться и переиграть пол', async () => {
    const renderer = render();
    await passFirstStep(renderer);
    await press(renderer, 'Назад');
    expect(texts(renderer)).toContain('Шаг 1 из 2');
    await press(renderer, 'Женский');
    await press(renderer, 'Дальше');
    await press(renderer, 'Готово');
    expect(mockSaveProfile).toHaveBeenCalledWith({ gender: 'female' });
  });
});
