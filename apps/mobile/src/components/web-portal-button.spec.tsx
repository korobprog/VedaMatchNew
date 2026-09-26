import { Linking } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import AuthReturnScreen from '@/app/auth';
import LoginScreen from '@/app/login';
import { WEB_PORTAL_LABEL } from '@/lib/web-portal';
import { hitTarget } from '@/theme/tokens';
import { WebPortalButton } from './web-portal-button';

/**
 * Кнопка «Открыть сайт» в углу экранов входа. Проверяется три вещи:
 * адрес берётся из контура сборки, отказ браузера виден человеку, и кнопка
 * стоит на КАЖДОМ экране, который показывается до входа. Последнее — ради
 * того, чтобы новый экран входа не появился без выхода в портал.
 */

const mockOpenBrowserAsync = jest.fn().mockResolvedValue({ type: 'opened' });
// Префикс `mock` обязателен: иначе babel-plugin-jest-hoist не пускает
// переменную внутрь фабрики `jest.mock`.
const mockVariant = { webOrigin: 'https://vedamatch.ru' };

jest.mock('expo-web-browser', () => ({
  __esModule: true,
  openBrowserAsync: (...args: unknown[]) => mockOpenBrowserAsync(...args),
}));

jest.mock('@/config/app-variant', () => ({
  __esModule: true,
  appVariant: () => mockVariant,
  appAuthRedirect: () => 'vedamatch://auth',
}));

jest.mock('react-native-safe-area-context', () => ({
  __esModule: true,
  useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }),
}));

// Экраны входа тянут сессию и роутер: подставляем гостя, ничего не делающего.
jest.mock('@/lib/auth/session', () => ({
  __esModule: true,
  useSession: () => ({
    status: 'guest',
    loginError: null,
    signIn: jest.fn().mockResolvedValue(undefined),
    signInDev: jest.fn().mockResolvedValue(undefined),
    // Висящее обещание: экран `auth` не должен уехать с себя посреди теста.
    completeSignIn: jest.fn(() => new Promise<void>(() => undefined)),
  }),
}));

jest.mock('expo-router', () => ({
  __esModule: true,
  useLocalSearchParams: () => ({}),
  router: { replace: jest.fn() },
}));

function render(element: React.ReactElement): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(element);
  });
  return tree;
}

/** Кнопка портала: единственный элемент с этой подписью на экране. */
function portalButtons(tree: ReactTestRenderer) {
  return tree.root.findAll(
    (node) => node.props.accessibilityLabel === WEB_PORTAL_LABEL && Boolean(node.props.onPress),
    { deep: true },
  );
}

beforeEach(() => {
  mockVariant.webOrigin = 'https://vedamatch.ru';
  mockOpenBrowserAsync.mockReset().mockResolvedValue({ type: 'opened' });
  jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('WebPortalButton', () => {
  it('подписана текстом, а не одним значком', () => {
    const tree = render(<WebPortalButton />);
    expect(JSON.stringify(tree.toJSON())).toContain(WEB_PORTAL_LABEL);
    expect(portalButtons(tree)).toHaveLength(1);
  });

  it('зона нажатия не меньше 44', () => {
    const tree = render(<WebPortalButton />);
    const [button] = portalButtons(tree);
    const style = button.props.style({ pressed: false }).flat().filter(Boolean);
    const box = Object.assign({}, ...style) as { minHeight?: number; minWidth?: number };
    expect(box.minHeight).toBeGreaterThanOrEqual(hitTarget);
    expect(box.minWidth).toBeGreaterThanOrEqual(hitTarget);
  });

  it('открывает адрес своего контура, а не зашитый', async () => {
    mockVariant.webOrigin = 'https://vedamatch.com';
    const tree = render(<WebPortalButton />);
    await act(async () => {
      portalButtons(tree)[0].props.onPress();
    });
    expect(mockOpenBrowserAsync).toHaveBeenCalledWith('https://vedamatch.com');
  });

  it('браузер отказал — уходит в системный, молча для человека', async () => {
    mockOpenBrowserAsync.mockRejectedValue(new Error('нет Custom Tabs'));
    const tree = render(<WebPortalButton />);
    await act(async () => {
      portalButtons(tree)[0].props.onPress();
    });
    expect(Linking.openURL).toHaveBeenCalledWith('https://vedamatch.ru');
    expect(JSON.stringify(tree.toJSON())).not.toContain('Не удалось открыть браузер');
  });

  it('браузера нет вовсе — на экране появляется адрес для ручного ввода', async () => {
    mockOpenBrowserAsync.mockRejectedValue(new Error('нет Custom Tabs'));
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('нет обработчика'));
    const tree = render(<WebPortalButton />);
    await act(async () => {
      portalButtons(tree)[0].props.onPress();
    });
    const rendered = JSON.stringify(tree.toJSON());
    expect(rendered).toContain('Не удалось открыть браузер');
    expect(rendered).toContain('vedamatch.ru');
  });
});

/**
 * Полный список экранов, которые человек видит ДО входа: `Stack.Protected`
 * с `guard={status === 'guest'}` в `components/root-shell-stack.tsx`.
 * Появится третий — он должен попасть и сюда, и в стек.
 */
describe.each([
  ['экран входа (app/login.tsx)', LoginScreen],
  ['возврат из браузера (app/auth.tsx)', AuthReturnScreen],
])('кнопка портала на экране: %s', (_name, Screen) => {
  it('есть ровно одна и ведёт на адрес контура', async () => {
    const tree = render(<Screen />);
    const buttons = portalButtons(tree);
    expect(buttons).toHaveLength(1);
    await act(async () => {
      buttons[0].props.onPress();
    });
    expect(mockOpenBrowserAsync).toHaveBeenCalledWith('https://vedamatch.ru');
  });
});
