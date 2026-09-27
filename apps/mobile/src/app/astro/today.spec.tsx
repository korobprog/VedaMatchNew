import type { AstroTodayDto } from '@vedamatch/shared';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import AstroTodayScreen from './today';

const mockToday = jest.fn<Promise<AstroTodayDto | null>, []>();
const mockOpenBrowser = jest.fn(async (_url: string) => ({ type: 'opened' }));
const mockCapabilities = { siteServiceLinks: true };

jest.mock('expo-router', () => ({ __esModule: true, Stack: { Screen: () => null } }));
jest.mock('expo-web-browser', () => ({
  __esModule: true,
  openBrowserAsync: (url: string) => mockOpenBrowser(url),
}));
jest.mock('react-native-safe-area-context', () => ({
  __esModule: true,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/theme/theme', () => ({
  __esModule: true,
  useTheme: () => ({ colors: jest.requireActual('@/theme/tokens').light }),
}));
const fakeSession = { api: {} };
jest.mock('@/lib/auth/session', () => ({ __esModule: true, useSession: () => fakeSession }));
jest.mock('@/lib/astro/astro-api', () => ({
  __esModule: true,
  createAstroApi: () => ({ today: () => mockToday() }),
}));
jest.mock('@/lib/startup/connectivity', () => ({ __esModule: true, useReloadWhenOnline: () => undefined }));
jest.mock('@/config/app-variant', () => ({
  __esModule: true,
  appVariant: () => ({ webOrigin: 'https://vedamatch.ru' }),
  appCapabilities: () => mockCapabilities,
}));

const day = (overrides: Partial<AstroTodayDto> = {}): AstroTodayDto => ({
  forDate: '2026-09-27',
  moonBhava: 7,
  moonRashi: 4,
  moonNakshatra: 15,
  currentMahadasha: { lord: 'saturn' },
  currentAntardasha: { lord: 'venus' },
  text: 'Сегодня хорошо для партнёрства',
  ...overrides,
});

function screenText(renderer: ReactTestRenderer): string {
  const found: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === 'string') found.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object' && 'children' in node) walk((node as { children: unknown }).children);
  };
  walk(renderer.toJSON());
  return found.join(' ');
}

function link(renderer: ReactTestRenderer, label: string): ReactTestInstance | undefined {
  return renderer.root.findAll(
    (node) => typeof node.props?.onPress === 'function' && node.props?.accessibilityLabel === label,
  )[0];
}

const mounted: ReactTestRenderer[] = [];
async function render(): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<AstroTodayScreen />);
  });
  mounted.push(renderer);
  return renderer;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCapabilities.siteServiceLinks = true;
});
afterEach(() => {
  for (const renderer of mounted.splice(0)) act(() => renderer.unmount());
});

describe('«Персональный день»', () => {
  it('показывает текст дня и факты транзитной Луны и периода', async () => {
    mockToday.mockResolvedValue(day());
    const text = screenText(await render());
    expect(text).toContain('Сегодня хорошо для партнёрства');
    expect(text).toContain('Карка, Свати, 7-я бхава');
    expect(text).toContain('Шани — Шукра');
  });

  it('без текста дня — факты словами, а не пустая карточка', async () => {
    mockToday.mockResolvedValue(day({ text: null }));
    expect(screenText(await render())).toContain('Разбор дня появится чуть позже');
  });

  it('нет данных рождения — объясняет и ведёт на форму сайта, предупредив о входе', async () => {
    mockToday.mockResolvedValue(null);
    const renderer = await render();
    const text = screenText(renderer);
    expect(text).toContain('Нужны данные рождения');
    expect(text).toContain('нужно войти');
    await act(async () => link(renderer, 'Заполнить на сайте')!.props.onPress());
    expect(mockOpenBrowser).toHaveBeenCalledWith('https://vedamatch.ru/astro');
  });

  it('ошибка сети — понятный текст и «Повторить», который перечитывает', async () => {
    // Подробности сетевого сбоя экран пишет в лог — в выводе теста они шум.
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockToday.mockRejectedValueOnce(new TypeError('Network request failed'));
    const renderer = await render();
    expect(warn).toHaveBeenCalledWith('[astro/today]', 'TypeError: Network request failed');
    warn.mockRestore();
    expect(screenText(renderer)).toContain('Нет соединения с сервером');
    mockToday.mockResolvedValueOnce(day());
    const retry = renderer.root.findAll(
      (node) => typeof node.props?.onPress === 'function' && node.props?.accessibilityRole === 'button',
    )[0];
    await act(async () => retry.props.onPress());
    expect(mockToday).toHaveBeenCalledTimes(2);
    expect(screenText(renderer)).toContain('Сегодня хорошо для партнёрства');
  });

  it('ссылка на карту рождения на сайте — с предупреждением о входе', async () => {
    mockToday.mockResolvedValue(day());
    const renderer = await render();
    await act(async () => link(renderer, 'Карта рождения на сайте')!.props.onPress());
    expect(mockOpenBrowser).toHaveBeenCalledWith('https://vedamatch.ru/astro/chart');
  });

  it('сборка без ссылок на сайт — ни кнопки формы, ни ссылки на карту', async () => {
    mockCapabilities.siteServiceLinks = false;
    mockToday.mockResolvedValue(null);
    const renderer = await render();
    expect(link(renderer, 'Заполнить на сайте')).toBeUndefined();
    expect(screenText(renderer)).toContain('Нужны данные рождения');

    mockToday.mockResolvedValue(day());
    const ready = await render();
    expect(link(ready, 'Карта рождения на сайте')).toBeUndefined();
  });

  it('на экране нет ни цен, ни призывов оплатить — день бесплатен в обоих каналах', async () => {
    mockToday.mockResolvedValue(day());
    const text = screenText(await render());
    expect(text).not.toMatch(/₽|тариф|оплат|купить|подписк/i);
  });
});
