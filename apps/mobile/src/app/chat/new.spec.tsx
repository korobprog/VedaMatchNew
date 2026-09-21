import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import NewConversationScreen from './new';

const mockReplace = jest.fn();
const mockCreate = jest.fn();
const mockPeople = jest.fn();
const mockChannelCommunities = jest.fn();
const mockSearchCommunities = jest.fn();

jest.mock('expo-router', () => ({
  __esModule: true,
  Stack: { Screen: () => null },
  router: { replace: (...args: unknown[]) => mockReplace(...args) },
}));

jest.mock('expo-router/react-navigation', () => ({ __esModule: true, useHeaderHeight: () => 56 }));

jest.mock('react-native-safe-area-context', () => ({
  __esModule: true,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@/components/keyboard-controller-web', () => {
  const { View } = jest.requireActual('react-native');
  return { __esModule: true, ChatKeyboardAvoidingView: View, PersonKeyboardAwareScroll: View };
});

// Сессия отдаёт один и тот же клиент между перерисовками — как настоящая.
// Новый объект на каждый рендер зациклил бы эффект загрузки.
const fakeSession = { api: {}, user: { id: 'me' } };
jest.mock('@/lib/auth/session', () => ({ __esModule: true, useSession: () => fakeSession }));

jest.mock('@/lib/feedback', () => ({ __esModule: true, confirmTap: jest.fn(), longPressTap: jest.fn() }));

jest.mock('@/lib/communities/communities-api', () => ({
  __esModule: true,
  createCommunitiesApi: () => ({ search: (...args: unknown[]) => mockSearchCommunities(...args) }),
}));

jest.mock('@/lib/chat/chat-api', () => ({
  __esModule: true,
  createChatApi: () => ({
    people: () => mockPeople(),
    channelCommunities: () => mockChannelCommunities(),
    create: (...args: unknown[]) => mockCreate(...args),
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
    renderer = create(<NewConversationScreen />);
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
  mockPeople.mockResolvedValue({ people: [{ id: 'u1', name: 'Мадхава' }, { id: 'u2', name: 'Радха' }] });
  mockChannelCommunities.mockResolvedValue({ communities: [] });
  mockCreate.mockResolvedValue({ id: 'conv-1' });
  mockSearchCommunities.mockResolvedValue({ items: [] });
});

describe('Экран «Новая беседа» — совпадение названия с общиной', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  async function typeTitle(renderer: ReactTestRenderer, value: string) {
    await act(async () => {
      byLabel(renderer, 'Название беседы').props.onChangeText(value);
    });
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    await flush();
  }

  it('точное совпадение — предупреждает, что привязки не произошло', async () => {
    mockSearchCommunities.mockResolvedValue({ items: [{ id: 'c1', name: 'Минская ятра' }] });
    const renderer = await render();
    await typeTitle(renderer, 'Минская ятра');
    expect(mockSearchCommunities).toHaveBeenCalledWith({ q: 'Минская ятра', pageSize: 5 }, expect.anything());
    expect(texts(renderer)).toContain('сама по себе группа с ней не свяжется');
  });

  it('община в справочнике не нашлась — предупреждения нет', async () => {
    const renderer = await render();
    await typeTitle(renderer, 'Севаки');
    expect(texts(renderer)).not.toContain('не свяжется');
  });

  it('выбрали общину — предупреждение уходит, повторно не ищем', async () => {
    mockSearchCommunities.mockResolvedValue({ items: [{ id: 'c1', name: 'Минская ятра' }] });
    mockChannelCommunities.mockResolvedValue({
      communities: [{ community: { id: 'c1', slug: 'minsk', name: 'Минская ятра', status: 'active' }, channels: [] }],
    });
    const renderer = await render();
    await typeTitle(renderer, 'Минская ятра');
    expect(texts(renderer)).toContain('не свяжется');
    await act(async () => {
      byLabel(renderer, 'Минская ятра').props.onPress();
    });
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    await flush();
    expect(texts(renderer)).not.toContain('не свяжется');
    expect(mockSearchCommunities).toHaveBeenCalledTimes(1);
  });

  it('справочник недоступен — форма молчит и работает дальше', async () => {
    mockSearchCommunities.mockRejectedValue(new Error('Нет связи'));
    const renderer = await render();
    await typeTitle(renderer, 'Минская ятра');
    expect(texts(renderer)).not.toContain('не свяжется');
    await act(async () => {
      byLabel(renderer, 'Завести группу').props.onPress();
    });
    await flush();
    expect(mockCreate).toHaveBeenCalled();
  });

  it('пока человек печатает, справочник не дёргается на каждую букву', async () => {
    const renderer = await render();
    await act(async () => {
      byLabel(renderer, 'Название беседы').props.onChangeText('Ми');
    });
    await act(async () => {
      byLabel(renderer, 'Название беседы').props.onChangeText('Минская');
    });
    expect(mockSearchCommunities).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    await flush();
    expect(mockSearchCommunities).toHaveBeenCalledTimes(1);
  });
});

describe('Экран «Новая беседа» — загрузка и ошибка', () => {
  it('пока списки не пришли, формы и кнопки «Завести группу» ещё нет', async () => {
    let resolvePeople: ((value: unknown) => void) | undefined;
    mockPeople.mockReturnValue(new Promise((resolve) => {
      resolvePeople = resolve;
    }));
    const renderer = await render();
    expect(queryByLabel(renderer, 'Завести группу')).toBeNull();
    await act(async () => {
      resolvePeople?.({ people: [] });
    });
    await flush();
    expect(queryByLabel(renderer, 'Завести группу')).not.toBeNull();
  });

  it('список не загрузился — показывает текст ошибки сервера и «Повторить»', async () => {
    mockPeople.mockRejectedValue(new Error('Нет связи с сервером'));
    const renderer = await render();
    expect(texts(renderer)).toContain('Нет связи с сервером');
    expect(texts(renderer)).toContain('Повторить');
    // Формы в этот момент нет: ошибка загрузки — не пустой список.
    expect(queryByLabel(renderer, 'Название беседы')).toBeNull();
  });

  it('«Повторить» снова спрашивает оба списка', async () => {
    mockPeople.mockRejectedValueOnce(new Error('Нет связи'));
    const renderer = await render();
    expect(mockPeople).toHaveBeenCalledTimes(1);
    const retry = renderer.root.findAllByProps({ accessibilityRole: 'button' })[0];
    await act(async () => {
      retry.props.onPress();
    });
    await flush();
    expect(mockPeople).toHaveBeenCalledTimes(2);
    expect(queryByLabel(renderer, 'Завести группу')).not.toBeNull();
  });
});

describe('Экран «Новая беседа» — пустой список людей', () => {
  it('звать некого — экран честно объясняет, почему список пуст', async () => {
    mockPeople.mockResolvedValue({ people: [] });
    const renderer = await render();
    expect(texts(renderer)).toContain('Звать некого');
  });

  it('и всё же даёт завести группу — позвать можно позже', async () => {
    mockPeople.mockResolvedValue({ people: [] });
    const renderer = await render();
    await act(async () => {
      byLabel(renderer, 'Название беседы').props.onChangeText('Севаки');
    });
    await act(async () => {
      byLabel(renderer, 'Завести группу').props.onPress();
    });
    await flush();
    expect(mockCreate).toHaveBeenCalledWith({ kind: 'group', title: 'Севаки', memberIds: [] });
  });
});

describe('Экран «Новая беседа» — название и участники', () => {
  it('пустое название: запрос не уходит, а человеку говорят, чего не хватает', async () => {
    const renderer = await render();
    await act(async () => {
      byLabel(renderer, 'Завести группу').props.onPress();
    });
    await flush();
    expect(mockCreate).not.toHaveBeenCalled();
    expect(texts(renderer)).toContain('У группы должно быть название');
  });

  it('у канала без названия — свой текст, про канал', async () => {
    mockChannelCommunities.mockResolvedValue({
      communities: [{ community: { id: 'c1', slug: 'minsk', name: 'Минская ятра', status: 'active' }, channels: [] }],
    });
    const renderer = await render();
    await act(async () => {
      byLabel(renderer, 'Канал').props.onPress();
    });
    await act(async () => {
      byLabel(renderer, 'Завести канал').props.onPress();
    });
    await flush();
    expect(mockCreate).not.toHaveBeenCalled();
    expect(texts(renderer)).toContain('У канала должно быть название');
  });

  it('одни пробелы в названии — тоже отказ, а не пустая беседа', async () => {
    const renderer = await render();
    await act(async () => {
      byLabel(renderer, 'Название беседы').props.onChangeText('    ');
    });
    await act(async () => {
      byLabel(renderer, 'Завести группу').props.onPress();
    });
    await flush();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('отмеченные люди уходят в запрос, название — без пробелов по краям', async () => {
    const renderer = await render();
    await act(async () => {
      byLabel(renderer, 'Название беседы').props.onChangeText('  Севаки  ');
    });
    await act(async () => {
      byLabel(renderer, 'Мадхава').props.onPress();
    });
    await act(async () => {
      byLabel(renderer, 'Завести группу').props.onPress();
    });
    await flush();
    expect(mockCreate).toHaveBeenCalledWith({ kind: 'group', title: 'Севаки', memberIds: ['u1'] });
  });

  it('повторный тап снимает отметку с человека', async () => {
    const renderer = await render();
    await act(async () => {
      byLabel(renderer, 'Название беседы').props.onChangeText('Севаки');
    });
    await act(async () => {
      byLabel(renderer, 'Мадхава').props.onPress();
    });
    expect(byLabel(renderer, 'Мадхава').props.accessibilityState.checked).toBe(true);
    await act(async () => {
      byLabel(renderer, 'Мадхава').props.onPress();
    });
    expect(byLabel(renderer, 'Мадхава').props.accessibilityState.checked).toBe(false);
  });

  it('после успешного создания уводит в саму беседу', async () => {
    const renderer = await render();
    await act(async () => {
      byLabel(renderer, 'Название беседы').props.onChangeText('Севаки');
    });
    await act(async () => {
      byLabel(renderer, 'Завести группу').props.onPress();
    });
    await flush();
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/chat/[id]', params: { id: 'conv-1' } });
  });

  it('сервер отказал — текст отказа на экране, и никуда не уводит', async () => {
    mockCreate.mockRejectedValue(new Error('Беседу общины заводит администрация'));
    const renderer = await render();
    await act(async () => {
      byLabel(renderer, 'Название беседы').props.onChangeText('Севаки');
    });
    await act(async () => {
      byLabel(renderer, 'Завести группу').props.onPress();
    });
    await flush();
    expect(texts(renderer)).toContain('Беседу общины заводит администрация');
    expect(mockReplace).not.toHaveBeenCalled();
    // Кнопка снова доступна: отказ — не конец формы.
    expect(byLabel(renderer, 'Завести группу').props.accessibilityState.busy).toBe(false);
  });
});

describe('Экран «Новая беседа» — канал общины', () => {
  it('без общин вкладки «Канал» нет', async () => {
    const renderer = await render();
    expect(queryByLabel(renderer, 'Канал')).toBeNull();
  });

  it('с общиной канал доступен, и община подставляется сама', async () => {
    mockChannelCommunities.mockResolvedValue({
      communities: [{ community: { id: 'c1', slug: 'minsk', name: 'Минская ятра', status: 'active' }, channels: [] }],
    });
    const renderer = await render();
    await act(async () => {
      byLabel(renderer, 'Канал').props.onPress();
    });
    await act(async () => {
      byLabel(renderer, 'Название беседы').props.onChangeText('Объявления');
    });
    await act(async () => {
      byLabel(renderer, 'Завести канал').props.onPress();
    });
    await flush();
    expect(mockCreate).toHaveBeenCalledWith({ kind: 'channel', title: 'Объявления', communityId: 'c1' });
  });

  it('неактивную общину выбрать нельзя, и экран объясняет почему', async () => {
    mockChannelCommunities.mockResolvedValue({
      communities: [{ community: { id: 'c1', slug: 'minsk', name: 'Минская ятра', status: 'pending' }, channels: [] }],
    });
    const renderer = await render();
    const chip = byLabel(renderer, 'Минская ятра — не активна, беседы в ней не видны');
    expect(chip.props.accessibilityState.disabled).toBe(true);
    expect(chip.props.disabled).toBe(true);
    expect(texts(renderer)).toContain('на проверке');
  });

  it('канал в неактивной общине не заводится: общину не подставили, запрос не ушёл', async () => {
    mockChannelCommunities.mockResolvedValue({
      communities: [{ community: { id: 'c1', slug: 'minsk', name: 'Минская ятра', status: 'pending' }, channels: [] }],
    });
    const renderer = await render();
    await act(async () => {
      byLabel(renderer, 'Канал').props.onPress();
    });
    await act(async () => {
      byLabel(renderer, 'Название беседы').props.onChangeText('Объявления');
    });
    await act(async () => {
      byLabel(renderer, 'Завести канал').props.onPress();
    });
    await flush();
    expect(mockCreate).not.toHaveBeenCalled();
    expect(texts(renderer)).toContain('Выберите общину');
  });
});
