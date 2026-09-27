import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { HomeSectionsSettings } from './home-sections-settings';

/**
 * Раздел «Главная (Чаты)» в «Настройках»: тумблер на каждый блок, умолчания
 * видны сразу, нажатие пишет в то же хранилище, что читают «Чаты».
 * Хранилище настоящее, поверх памяти, новое на каждый тест.
 */

type HomeStoreModule = typeof import('@/lib/home/home-sections-store');
let mockStored: string | null = null;
let mockHomeStore: ReturnType<HomeStoreModule['createHomeSectionsStore']>;

jest.mock('expo-secure-store', () => ({ __esModule: true, getItemAsync: jest.fn(), setItemAsync: jest.fn() }));
jest.mock('@/theme/theme', () => ({
  __esModule: true,
  useTheme: () => ({ colors: jest.requireActual('@/theme/tokens').light }),
}));
jest.mock('@/lib/home/home-sections-store', () => {
  const actual: HomeStoreModule = jest.requireActual('@/lib/home/home-sections-store');
  return {
    __esModule: true,
    get homeSectionsStore() {
      return mockHomeStore;
    },
    useHomeSections: () => actual.useHomeSections(mockHomeStore),
  };
});

beforeEach(() => {
  mockStored = null;
  const actual: HomeStoreModule = jest.requireActual('@/lib/home/home-sections-store');
  mockHomeStore = actual.createHomeSectionsStore({
    getItem: async () => mockStored,
    setItem: async (_key, value) => {
      mockStored = value;
    },
  });
});

async function render(): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<HomeSectionsSettings />);
  });
  return renderer;
}

function switches(renderer: ReactTestRenderer): ReactTestInstance[] {
  // `Switch` разворачивается в несколько узлов с теми же props: берём те,
  // что действительно несут обработчик.
  return renderer.root.findAll(
    (node) => node.props?.accessibilityRole === 'switch' && typeof node.props?.onValueChange === 'function',
  );
}

function byLabel(renderer: ReactTestRenderer, label: string): ReactTestInstance {
  const found = switches(renderer).filter((node) => node.props.accessibilityLabel === label);
  expect(found.length).toBeGreaterThan(0);
  return found[0];
}

describe('«Настройки» → «Главная (Чаты)»', () => {
  it('три тумблера по порядку главной; блог-лента выключена, остальное включено', async () => {
    const renderer = await render();
    const labels = [...new Set(switches(renderer).map((node) => node.props.accessibilityLabel))];
    expect(labels).toEqual(['Быстрая конференция на главной', 'Статусы на главной', 'Блог-лента на главной']);
    expect(byLabel(renderer, 'Блог-лента на главной').props.value).toBe(false);
    expect(byLabel(renderer, 'Статусы на главной').props.value).toBe(true);
    expect(byLabel(renderer, 'Быстрая конференция на главной').props.value).toBe(true);
  });

  it('тумблер несёт состояние для скринридера', async () => {
    const renderer = await render();
    expect(byLabel(renderer, 'Блог-лента на главной').props.accessibilityState).toEqual({ checked: false });
  });

  it('включить ленту — тумблер встаёт сразу, выбор записан на телефон', async () => {
    const renderer = await render();
    await act(async () => byLabel(renderer, 'Блог-лента на главной').props.onValueChange(true));
    expect(byLabel(renderer, 'Блог-лента на главной').props.value).toBe(true);
    expect(JSON.parse(mockStored ?? '{}')).toEqual({ quickConference: true, statuses: true, blog: true });
  });

  it('сохранённый выбор показывается при входе', async () => {
    mockStored = '{"statuses":false,"blog":true}';
    const renderer = await render();
    expect(byLabel(renderer, 'Статусы на главной').props.value).toBe(false);
    expect(byLabel(renderer, 'Блог-лента на главной').props.value).toBe(true);
  });
});
