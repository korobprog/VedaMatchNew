import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import NewCommunityScreen from './new';

const mockCreate = jest.fn();
const mockGeoSearch = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  __esModule: true,
  Stack: { Screen: () => null },
  router: { back: () => mockBack() },
}));

jest.mock('react-native-safe-area-context', () => ({
  __esModule: true,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@/components/keyboard-controller-web', () => {
  const { View } = jest.requireActual('react-native');
  return { __esModule: true, ChatKeyboardAvoidingView: View, PersonKeyboardAwareScroll: View };
});

const fakeSession = { api: {}, user: { id: 'me' } };
jest.mock('@/lib/auth/session', () => ({ __esModule: true, useSession: () => fakeSession }));

jest.mock('@/lib/feedback', () => ({ __esModule: true, confirmTap: jest.fn(), longPressTap: jest.fn() }));

jest.mock('@/lib/communities/communities-api', () => ({
  __esModule: true,
  createCommunitiesApi: () => ({
    create: (...args: unknown[]) => mockCreate(...args),
    geoSearch: (...args: unknown[]) => mockGeoSearch(...args),
  }),
}));

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function render(): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<NewCommunityScreen />);
  });
  await flush();
  return renderer;
}

function byLabel(renderer: ReactTestRenderer, label: string): ReactTestInstance {
  return renderer.root.findByProps({ accessibilityLabel: label });
}

function queryByLabel(renderer: ReactTestRenderer, label: string): ReactTestInstance | null {
  const found = renderer.root.findAllByProps({ accessibilityLabel: label });
  return found.length > 0 ? found[0] : null;
}

function texts(renderer: ReactTestRenderer): string {
  return renderer.root
    .findAllByType('Text' as never, { deep: true })
    .map((node) => JSON.stringify(node.props.children))
    .join(' ');
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCreate.mockResolvedValue({ id: 'c1', slug: 'minskaya-yatra', name: 'Минская ятра' });
  mockGeoSearch.mockResolvedValue([
    { city: 'Минск', country: 'Беларусь', lat: 53.9, lon: 27.56, displayName: 'Минск, Беларусь' },
  ]);
});

describe('Экран «Новая община» — форма', () => {
  it('без названия отправить нельзя', async () => {
    const renderer = await render();
    expect(byLabel(renderer, 'Отправить на проверку').props.accessibilityState.disabled).toBe(true);
  });

  it('сразу объясняет, что карточку проверяет администрация портала', async () => {
    const renderer = await render();
    expect(texts(renderer)).toContain('администрация портала');
  });

  it('отправляет тип, название и порядок вступления', async () => {
    const renderer = await render();
    await act(async () => {
      byLabel(renderer, 'Название общины').props.onChangeText('  Минская ятра  ');
    });
    await act(async () => {
      byLabel(renderer, 'Храм').props.onPress();
    });
    await act(async () => {
      byLabel(renderer, 'Вступают свободно').props.onPress();
    });
    await act(async () => {
      byLabel(renderer, 'Отправить на проверку').props.onPress();
    });
    await flush();
    expect(mockCreate).toHaveBeenCalledWith({
      kind: 'temple',
      name: 'Минская ятра',
      descriptionRu: null,
      address: null,
      location: null,
      joinPolicy: 'open',
    });
  });

  it('после отправки показывает, что заявка ушла, и называет общину', async () => {
    const renderer = await render();
    await act(async () => {
      byLabel(renderer, 'Название общины').props.onChangeText('Минская ятра');
    });
    await act(async () => {
      byLabel(renderer, 'Отправить на проверку').props.onPress();
    });
    await flush();
    expect(texts(renderer)).toContain('Заявка отправлена');
    expect(texts(renderer)).toContain('Минская ятра');
    // Формы больше нет: второй раз ту же общину не заводят случайно.
    expect(queryByLabel(renderer, 'Название общины')).toBeNull();
  });

  it('отказ сервера (например, лимит заявок) остаётся на форме', async () => {
    mockCreate.mockRejectedValue(new Error('Такая община уже есть в справочнике'));
    const renderer = await render();
    await act(async () => {
      byLabel(renderer, 'Название общины').props.onChangeText('Минская ятра');
    });
    await act(async () => {
      byLabel(renderer, 'Отправить на проверку').props.onPress();
    });
    await flush();
    expect(texts(renderer)).toContain('Такая община уже есть в справочнике');
    expect(queryByLabel(renderer, 'Название общины')).not.toBeNull();
  });
});

describe('Экран «Новая община» — подсказки городов', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  async function typeCity(renderer: ReactTestRenderer, value: string) {
    await act(async () => {
      byLabel(renderer, 'Город общины').props.onChangeText(value);
    });
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    await flush();
  }

  it('одна буква геокодер не дёргает', async () => {
    const renderer = await render();
    await typeCity(renderer, 'М');
    expect(mockGeoSearch).not.toHaveBeenCalled();
  });

  it('две буквы — запрос уходит после паузы, а не на каждое нажатие', async () => {
    const renderer = await render();
    await act(async () => {
      byLabel(renderer, 'Город общины').props.onChangeText('Ми');
    });
    expect(mockGeoSearch).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    await flush();
    expect(mockGeoSearch).toHaveBeenCalledTimes(1);
    expect(mockGeoSearch.mock.calls[0][0]).toBe('Ми');
  });

  it('выбранный город уходит с координатами в запрос', async () => {
    const renderer = await render();
    await act(async () => {
      byLabel(renderer, 'Название общины').props.onChangeText('Минская ятра');
    });
    await typeCity(renderer, 'Минск');
    await act(async () => {
      byLabel(renderer, 'Минск, Беларусь').props.onPress();
    });
    await act(async () => {
      byLabel(renderer, 'Отправить на проверку').props.onPress();
    });
    await flush();
    expect(mockCreate.mock.calls[0][0].location).toEqual({
      city: 'Минск',
      country: 'Беларусь',
      lat: 53.9,
      lon: 27.56,
      displayName: 'Минск, Беларусь',
    });
  });

  it('город выбран — повторный запрос по тому же тексту не уходит', async () => {
    const renderer = await render();
    await typeCity(renderer, 'Минск');
    expect(mockGeoSearch).toHaveBeenCalledTimes(1);
    await act(async () => {
      byLabel(renderer, 'Минск, Беларусь').props.onPress();
    });
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    await flush();
    expect(mockGeoSearch).toHaveBeenCalledTimes(1);
  });

  it('геокодер молчит — форма не ломается и общину можно завести без города', async () => {
    mockGeoSearch.mockRejectedValue(new Error('Геокодер недоступен'));
    const renderer = await render();
    await act(async () => {
      byLabel(renderer, 'Название общины').props.onChangeText('Минская ятра');
    });
    await typeCity(renderer, 'Минск');
    expect(byLabel(renderer, 'Отправить на проверку').props.accessibilityState.disabled).toBe(false);
  });
});
