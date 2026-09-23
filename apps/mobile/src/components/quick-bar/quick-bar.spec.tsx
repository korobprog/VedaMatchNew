import type { ServiceCard } from '@vedamatch/shared';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { serializeQuickPins, type QuickPin } from '@/lib/services/quick-pins';
import { QUICK_PINS_STORAGE_KEY, createQuickPinsStore, type QuickPinsStore } from '@/lib/services/quick-pins-store';
import { hitTarget } from '@/theme/tokens';
import { QuickBar } from './quick-bar';

/**
 * Панель над вкладками: пусто — ничего не рисует, закреплено — чипы в порядке
 * человека, чип открывает сервис тем же путём, что и карточка каталога,
 * снимок сверяется с каталогом.
 */

const mockOpenService = jest.fn();
const mockList = jest.fn<Promise<ServiceCard[]>, []>();

// Штатный `react-native-reanimated/mock` тянет нативный worklets и в jest
// падает; панели нужны ровно вид, «проявление» с цепочкой настроек и обёртка.
jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual('react-native');
  const chain = (): unknown => new Proxy({}, { get: () => chain });
  return {
    __esModule: true,
    default: { View },
    FadeIn: chain(),
    FadeOut: chain(),
    Easing: { bezier: () => (t: number) => t },
    ReduceMotion: { System: 'system' },
    LayoutAnimationConfig: ({ children }: { children: React.ReactNode }) => children,
  };
});

jest.mock('expo-secure-store', () => ({
  __esModule: true,
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('react-native-safe-area-context', () => ({
  __esModule: true,
  useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }),
}));

jest.mock('@/config/app-variant', () => ({
  __esModule: true,
  appVariant: () => ({ webOrigin: 'https://vedamatch.ru' }),
}));

jest.mock('@/lib/auth/session', () => ({
  __esModule: true,
  useSession: () => ({ api: { request: () => mockList() } }),
}));

jest.mock('@/lib/services/open-service', () => ({
  __esModule: true,
  openService: (...args: unknown[]) => mockOpenService(...args),
}));

jest.mock('@/components/services/service-icons', () => ({
  __esModule: true,
  ServiceIcon: () => null,
}));

const pin = (slug: string, name: string): QuickPin => ({ slug, name, url: `/${slug}` });

function card(slug: string, name: string, status: ServiceCard['status'] = 'active'): ServiceCard {
  return {
    id: slug,
    slug,
    name,
    nameEn: null,
    description: '',
    iconUrl: null,
    url: `/${slug}`,
    status,
    category: 'service',
    requiresDevoteeVerification: false,
  };
}

async function storeWith(pins: QuickPin[]): Promise<QuickPinsStore> {
  const data = new Map([[QUICK_PINS_STORAGE_KEY, serializeQuickPins(pins)]]);
  const store = createQuickPinsStore({
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => {
      data.set(key, value);
    },
  });
  await store.load();
  return store;
}

async function render(store: QuickPinsStore): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<QuickBar store={store} />);
  });
  return tree;
}

function chips(tree: ReactTestRenderer) {
  return tree.root.findAll(
    (node) => node.props.accessibilityRole === 'link' && typeof node.props.onPress === 'function',
    { deep: false },
  );
}

beforeEach(() => {
  mockOpenService.mockReset();
  mockList.mockReset().mockResolvedValue([]);
});

describe('QuickBar', () => {
  it('ничего не закреплено — панели нет вовсе, и каталог не запрашивается', async () => {
    const tree = await render(await storeWith([]));
    expect(tree.toJSON()).toBeNull();
    expect(mockList).not.toHaveBeenCalled();
  });

  it('закреплённое — чипами в порядке человека, с подписью для TalkBack', async () => {
    mockList.mockResolvedValue([card('music', 'Медиатека'), card('wellness', 'Здоровье')]);
    const tree = await render(await storeWith([pin('wellness', 'Здоровье'), pin('music', 'Медиатека')]));
    expect(chips(tree).map((chip) => chip.props.accessibilityLabel)).toEqual(['Здоровье', 'Медиатека']);
    const toolbar = tree.root.find((node) => node.props.accessibilityRole === 'toolbar');
    expect(toolbar.props.accessibilityLabel).toBe('Быстрый доступ к сервисам');
  });

  it('подсказка говорит, откроется ли раздел в приложении или на сайте', async () => {
    mockList.mockResolvedValue([card('wellness', 'Здоровье'), card('music', 'Медиатека')]);
    const tree = await render(await storeWith([pin('wellness', 'Здоровье'), pin('music', 'Медиатека')]));
    const [wellness, music] = chips(tree);
    expect(wellness.props.accessibilityHint).toBe('Открывает раздел в приложении');
    expect(music.props.accessibilityHint).toBe('Открывает раздел на сайте в браузере');
  });

  it('чип открывает сервис тем же путём, что карточка каталога', async () => {
    mockList.mockResolvedValue([card('library', 'Библиотека')]);
    const tree = await render(await storeWith([pin('library', 'Библиотека')]));
    await act(async () => {
      chips(tree)[0].props.onPress();
    });
    expect(mockOpenService).toHaveBeenCalledWith(pin('library', 'Библиотека'), 'https://vedamatch.ru');
  });

  it('зона нажатия чипа не меньше 44', async () => {
    mockList.mockResolvedValue([card('music', 'Медиатека')]);
    const tree = await render(await storeWith([pin('music', 'Медиатека')]));
    const style = chips(tree)[0].props.style({ pressed: false }).flat().filter(Boolean);
    const box = Object.assign({}, ...style) as { minHeight?: number; minWidth?: number };
    expect(box.minHeight).toBeGreaterThanOrEqual(hitTarget);
    expect(box.minWidth).toBeGreaterThanOrEqual(hitTarget);
  });

  it('панель занимает вырез сама: верхний отступ — высота выреза', async () => {
    mockList.mockResolvedValue([card('music', 'Медиатека')]);
    const tree = await render(await storeWith([pin('music', 'Медиатека')]));
    const toolbar = tree.root.find((node) => node.props.accessibilityRole === 'toolbar');
    const style = Object.assign({}, ...[toolbar.props.style].flat().filter(Boolean)) as { paddingTop?: number };
    expect(style.paddingTop).toBe(24);
  });

  it('выключенный в админке сервис после сверки с каталогом исчезает с панели', async () => {
    mockList.mockResolvedValue([card('music', 'Медиатека'), card('astro', 'Астро', 'coming_soon')]);
    const store = await storeWith([pin('astro', 'Астро'), pin('music', 'Музыка')]);
    const tree = await render(store);
    expect(chips(tree).map((chip) => chip.props.accessibilityLabel)).toEqual(['Медиатека']);
  });

  it('сеть недоступна — снимок остаётся как был', async () => {
    mockList.mockRejectedValue(new Error('offline'));
    const tree = await render(await storeWith([pin('music', 'Медиатека')]));
    expect(chips(tree).map((chip) => chip.props.accessibilityLabel)).toEqual(['Медиатека']);
  });

  it('открепили последний — панель пропадает', async () => {
    mockList.mockResolvedValue([card('music', 'Медиатека')]);
    const store = await storeWith([pin('music', 'Медиатека')]);
    const tree = await render(store);
    await act(async () => {
      await store.toggle(card('music', 'Медиатека'));
    });
    expect(tree.toJSON()).toBeNull();
  });
});
