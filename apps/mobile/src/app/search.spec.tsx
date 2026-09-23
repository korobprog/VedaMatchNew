import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import type { SearchOutcomes } from '@/lib/search/search-results';
import { SEARCH_DEBOUNCE_MS } from '@/lib/search/search-query';
import SearchScreen from './search';

const mockSearch = jest.fn();
const mockPush = jest.fn();
const mockOpenBrowser = jest.fn();

jest.mock('expo-router', () => ({
  __esModule: true,
  router: { push: (...args: unknown[]) => mockPush(...args), back: jest.fn() },
}));

jest.mock('expo-web-browser', () => ({
  __esModule: true,
  openBrowserAsync: (...args: unknown[]) => mockOpenBrowser(...args),
}));

jest.mock('react-native-safe-area-context', () => ({
  __esModule: true,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@/components/keyboard-controller-web', () => {
  const { View } = jest.requireActual('react-native');
  return { __esModule: true, ChatKeyboardAvoidingView: View, PersonKeyboardAwareScroll: View };
});

jest.mock('@/config/app-variant', () => ({
  __esModule: true,
  appVariant: () => ({ webOrigin: 'https://vedamatch.ru' }),
}));

const mockSession = { api: {} };
jest.mock('@/lib/auth/session', () => ({ __esModule: true, useSession: () => mockSession }));

jest.mock('@/lib/search/search-api', () => {
  const actual = jest.requireActual('@/lib/search/search-api');
  return {
    __esModule: true,
    SearchCancelled: actual.SearchCancelled,
    createSearchApi: () => ({ search: (...args: unknown[]) => mockSearch(...args) }),
  };
});

const EMPTY: SearchOutcomes = {
  people: { status: 'ok', data: { items: [], page: 1, pageSize: 5, hasMore: false, total: null, facets: [] } },
  communities: { status: 'ok', data: { items: [], page: 1, pageSize: 5, total: 0, hasMore: false } },
  chats: { status: 'skipped' },
  portal: { status: 'ok', data: { query: 'x', groups: [], unavailable: [] } },
};

function withResults(): SearchOutcomes {
  return {
    ...EMPTY,
    people: {
      status: 'ok',
      data: {
        page: 1,
        pageSize: 5,
        hasMore: false,
        total: null,
        facets: [],
        items: [{ userId: 'u1', name: 'Радха Деви', headline: null, statusLine: null, city: 'Минск' }] as never,
      },
    },
    portal: {
      status: 'ok',
      data: {
        query: 'гхи',
        groups: [
          {
            service: 'market',
            items: [{ kind: 'link', service: 'market', title: 'Гхи', subtitle: null, body: null, imageUrl: null, href: '/market/listing/7' }],
          },
        ],
        unavailable: [],
      },
    },
  };
}

async function render(): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<SearchScreen />);
  });
  return renderer;
}

function field(renderer: ReactTestRenderer): ReactTestInstance {
  return renderer.root.findByProps({ accessibilityLabel: 'Поиск по VedaMatch' });
}

async function type(renderer: ReactTestRenderer, value: string) {
  await act(async () => {
    field(renderer).props.onChangeText(value);
  });
}

async function wait(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
  await act(async () => {
    await Promise.resolve();
  });
}

function pressableWithText(renderer: ReactTestRenderer, text: string): ReactTestInstance {
  return renderer.root.findAll(
    (node) =>
      typeof node.props.onPress === 'function' &&
      node.findAllByType('Text' as never).some((t) => [t.props.children].flat().join('') === text),
  )[0];
}

function texts(renderer: ReactTestRenderer): string {
  return renderer.root
    .findAllByType('Text' as never)
    .map((node) => [node.props.children].flat().join(''))
    .join('\n');
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockSearch.mockResolvedValue(EMPTY);
  mockOpenBrowser.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('Поиск по порталу', () => {
  it('на пустом поле объясняет, что ищется, и не спрашивает сервер', async () => {
    const renderer = await render();
    expect(texts(renderer)).toContain('Люди, общины, ваша переписка');
    await wait(SEARCH_DEBOUNCE_MS * 2);
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it('один символ — просит ещё, запроса нет', async () => {
    const renderer = await render();
    await type(renderer, 'к');
    await wait(SEARCH_DEBOUNCE_MS * 2);
    expect(texts(renderer)).toContain('Нужно хотя бы два символа');
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it('ждёт паузы: быстрый набор даёт один запрос — последний', async () => {
    const renderer = await render();
    await type(renderer, 'кр');
    await wait(SEARCH_DEBOUNCE_MS - 50);
    await type(renderer, 'кри');
    await wait(SEARCH_DEBOUNCE_MS - 50);
    await type(renderer, 'кришна');
    expect(mockSearch).not.toHaveBeenCalled();
    await wait(SEARCH_DEBOUNCE_MS);
    expect(mockSearch).toHaveBeenCalledTimes(1);
    expect(mockSearch.mock.calls[0][0]).toBe('кришна');
  });

  it('новая буква отменяет ушедший запрос, его поздний ответ не показывается', async () => {
    let finishOld!: (value: SearchOutcomes) => void;
    mockSearch.mockImplementationOnce(
      (_q: string, signal: AbortSignal) =>
        new Promise<SearchOutcomes>((resolve) => {
          finishOld = resolve;
          signal.addEventListener('abort', () => undefined);
        }),
    );
    const renderer = await render();
    await type(renderer, 'гх');
    await wait(SEARCH_DEBOUNCE_MS);
    const oldSignal = mockSearch.mock.calls[0][1] as AbortSignal;

    mockSearch.mockResolvedValueOnce(EMPTY);
    await type(renderer, 'гхи');
    expect(oldSignal.aborted).toBe(true);
    await wait(SEARCH_DEBOUNCE_MS);

    // Старый ответ приходит последним — но экран уже про «гхи».
    await act(async () => finishOld(withResults()));
    expect(texts(renderer)).toContain('По запросу «гхи» ничего не нашлось');
    expect(texts(renderer)).not.toContain('Радха Деви');
  });

  it('группы выдачи: свой экран — переходом, сервис — сайтом', async () => {
    mockSearch.mockResolvedValue(withResults());
    const renderer = await render();
    await type(renderer, 'гхи');
    await wait(SEARCH_DEBOUNCE_MS);
    const shown = texts(renderer);
    expect(shown).toContain('Люди');
    expect(shown).toContain('Рынок');
    expect(shown).toContain('на сайте ↗');

    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: 'Радха Деви. Минск. Профиль' }).props.onPress();
    });
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/people/[id]', params: { id: 'u1' } });

    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: 'Гхи. Рынок, откроется на сайте' }).props.onPress();
    });
    expect(mockOpenBrowser).toHaveBeenCalledWith('https://vedamatch.ru/market/listing/7');
  });

  it('ничего не нашлось — так и говорит, а для двух букв поясняет про переписку', async () => {
    const renderer = await render();
    await type(renderer, 'ом');
    await wait(SEARCH_DEBOUNCE_MS);
    expect(texts(renderer)).toContain('По запросу «ом» ничего не нашлось');
    expect(texts(renderer)).toContain('Переписку ищем с трёх букв');
  });

  it('нет сети — объясняет по-человечески, «Повторить» повторяет тот же запрос', async () => {
    const down = { status: 'failed' as const };
    mockSearch.mockResolvedValueOnce({ people: down, communities: down, chats: down, portal: down });
    const renderer = await render();
    await type(renderer, 'ятра');
    await wait(SEARCH_DEBOUNCE_MS);
    expect(texts(renderer)).toContain('похоже, нет соединения');

    mockSearch.mockResolvedValueOnce(withResults());
    await act(async () => {
      pressableWithText(renderer, 'Повторить').props.onPress();
    });
    await wait(SEARCH_DEBOUNCE_MS);
    expect(mockSearch).toHaveBeenCalledTimes(2);
    expect(mockSearch.mock.calls[1][0]).toBe('ятра');
    expect(texts(renderer)).toContain('Радха Деви');
  });

  it('очистка поля возвращает подсказку', async () => {
    mockSearch.mockResolvedValue(withResults());
    const renderer = await render();
    await type(renderer, 'гхи');
    await wait(SEARCH_DEBOUNCE_MS);
    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: 'Очистить поиск' }).props.onPress();
    });
    expect(texts(renderer)).not.toContain('Радха Деви');
    expect(texts(renderer)).toContain('Люди, общины, ваша переписка');
  });
});
