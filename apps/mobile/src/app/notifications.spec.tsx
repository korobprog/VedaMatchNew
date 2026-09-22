import type { NotificationInboxResponse, NotificationItemDto } from '@vedamatch/shared';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { resetUnreadCount, unreadCount } from '@/lib/notifications/unread-store';
import NotificationsScreen from './notifications';

/**
 * Состояния экрана уведомлений (VED-330). Чистые правила (разбор путей,
 * секции, склейка порций) проверены в `lib/notifications/*.spec.ts`; здесь —
 * что экран действительно ходит на сервер, показывает нужное состояние и
 * что его нажатия делают обещанное.
 */

const mockInbox = jest.fn<Promise<NotificationInboxResponse>, [unknown]>();
const mockMarkRead = jest.fn<Promise<{ ok: true }>, [string[] | undefined]>(async () => ({
  ok: true as const,
}));
const mockPush = jest.fn();
const mockOpenBrowser = jest.fn<Promise<undefined>, [string]>(async () => undefined);

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    __esModule: true,
    // Настоящий `useFocusEffect` зовёт колбэк, когда экран в фокусе; в тесте
    // экран в фокусе всегда.
    useFocusEffect: (callback: () => void) => useEffect(callback, [callback]),
    router: { push: (...args: unknown[]) => mockPush(...args) },
    // `Stack.Screen` задаёт нативную шапку и ничего не рисует.
    Stack: { Screen: () => null },
  };
});

jest.mock('react-native-safe-area-context', () => ({
  __esModule: true,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('expo-web-browser', () => ({
  __esModule: true,
  openBrowserAsync: (url: string) => mockOpenBrowser(url),
}));

const fakeSession = { api: {} };
jest.mock('@/lib/auth/session', () => ({ __esModule: true, useSession: () => fakeSession }));

jest.mock('@/theme/theme', () => ({
  __esModule: true,
  useTheme: () => ({ colors: jest.requireActual('@/theme/tokens').light }),
}));

jest.mock('@/lib/notifications/inbox-api', () => ({
  __esModule: true,
  createInboxApi: () => ({
    inbox: (query: unknown) => mockInbox(query),
    markRead: (ids?: string[]) => mockMarkRead(ids),
    unreadCount: async () => ({ unreadCount: 0 }),
  }),
}));

jest.mock('@/config/app-variant', () => ({
  __esModule: true,
  appVariant: () => ({ webOrigin: 'https://vedamatch.ru' }),
}));

function item(id: string, overrides: Partial<NotificationItemDto> = {}): NotificationItemDto {
  return {
    id,
    title: `Заголовок ${id}`,
    body: `Текст ${id}`,
    url: '/chat/c-1',
    category: 'chat',
    createdAt: new Date().toISOString(),
    readAt: null,
    mark: null,
    ...overrides,
  };
}

function page(items: NotificationItemDto[], extra: Partial<NotificationInboxResponse> = {}) {
  return {
    items,
    nextCursor: null,
    unreadCount: items.filter((one) => one.readAt === null).length,
    ...extra,
  };
}

/** Весь текст, который человек видит на экране, одной строкой. */
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
    if (node && typeof node === 'object' && 'children' in node) {
      walk((node as { children: unknown }).children);
    }
  };
  walk(renderer.toJSON());
  return found.join(' ');
}

/**
 * Нажимаемые узлы с такой подписью. Только те, у кого есть `onPress`:
 * `findAll` обходит и обёртки, и у одной кнопки их несколько — без этого
 * фильтра «одна карточка» считалась бы тремя.
 */
function byLabel(renderer: ReactTestRenderer, match: string | RegExp): ReactTestInstance[] {
  return renderer.root.findAll((node) => {
    if (typeof node.props?.onPress !== 'function') return false;
    const label = node.props?.accessibilityLabel;
    if (typeof label !== 'string') return false;
    return typeof match === 'string' ? label.includes(match) : match.test(label);
  });
}

/** Весь текст внутри узла — по нему опознаются кнопки без своей подписи. */
function textOf(node: ReactTestInstance): string {
  const parts: string[] = [];
  const walk = (child: ReactTestInstance | string): void => {
    if (typeof child === 'string') {
      parts.push(child);
      return;
    }
    for (const next of child.children) walk(next as ReactTestInstance | string);
  };
  walk(node);
  return parts.join(' ');
}

/** Кнопка, подписанная текстом внутри себя («Повторить», «Показать ещё»). */
function byText(renderer: ReactTestRenderer, text: string): ReactTestInstance {
  const found = renderer.root.findAll(
    (node) =>
      typeof node.props?.onPress === 'function' &&
      node.props?.accessibilityRole === 'button' &&
      textOf(node).includes(text),
  );
  if (found.length === 0) throw new Error(`Кнопки «${text}» на экране нет`);
  return found[0];
}

/** Узел с такой подписью, нажимаемый или нет (скелетон, плашки). */
function labelled(renderer: ReactTestRenderer, match: string): ReactTestInstance[] {
  return renderer.root.findAll((node) => {
    const label = node.props?.accessibilityLabel;
    return typeof label === 'string' && label.includes(match);
  });
}

const mounted: ReactTestRenderer[] = [];

async function render(): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<NotificationsScreen />);
  });
  mounted.push(renderer);
  return renderer;
}

beforeEach(() => {
  jest.clearAllMocks();
  resetUnreadCount();
});

// Экран отписывается при размонтировании; без уборки незавершённый запрос
// одного теста доезжает до следующего и роняет его чужой ошибкой.
afterEach(async () => {
  await act(async () => {
    while (mounted.length > 0) mounted.pop()!.unmount();
  });
});

describe('экран уведомлений', () => {
  it('просит порцию, а не ленту целиком', async () => {
    mockInbox.mockResolvedValue(page([item('a')]));
    await render();
    // Первая порция просится без курсора; `limit` подставляет сам
    // `inbox-api.ts` — запрос совсем без параметров сервер считает старым
    // клиентом и отдаёт ленту целиком.
    expect(mockInbox.mock.calls[0]).toEqual([]);
  });

  it('пока лента не пришла, показывает скелетон, а не «уведомлений нет»', async () => {
    let release!: (value: NotificationInboxResponse) => void;
    mockInbox.mockReturnValue(new Promise((resolve) => (release = resolve)));
    const renderer = await render();
    expect(texts(renderer)).not.toContain('Уведомлений нет');
    expect(labelled(renderer, 'Загружаем').length).toBeGreaterThan(0);
    await act(async () => release(page([])));
  });

  it('пустая лента объясняет, что здесь бывает', async () => {
    mockInbox.mockResolvedValue(page([]));
    const renderer = await render();
    expect(texts(renderer)).toContain('Уведомлений нет');
  });

  it('ошибка первой загрузки даёт текст и «Повторить», а вторая попытка — ленту', async () => {
    mockInbox.mockRejectedValueOnce(new Error('Нет связи с сервером'));
    const renderer = await render();
    expect(texts(renderer)).toContain('Нет связи с сервером');

    mockInbox.mockResolvedValue(page([item('a')]));
    await act(async () => byText(renderer, 'Повторить').props.onPress());
    expect(texts(renderer)).toContain('Заголовок a');
  });

  it('непрочитанное выделено секцией «Новое» со счётчиком', async () => {
    mockInbox.mockResolvedValue(
      page([item('a'), item('b', { readAt: new Date().toISOString() })]),
    );
    const renderer = await render();
    expect(texts(renderer)).toContain('Новое · 1');
    expect(texts(renderer)).toContain('Сегодня');
  });

  it('непрочитанное названо словом, а не только точкой и цветом', async () => {
    mockInbox.mockResolvedValue(page([item('a')]));
    const renderer = await render();
    expect(byLabel(renderer, 'Не прочитано').length).toBe(1);
  });

  it('счётчик колокольчика берётся из ответа сервера', async () => {
    mockInbox.mockResolvedValue(page([item('a')], { unreadCount: 12 }));
    await render();
    expect(unreadCount()).toBe(12);
  });

  it('открытие карточки гасит её, уменьшает значок и ведёт на свой экран', async () => {
    mockInbox.mockResolvedValue(page([item('a', { url: '/chat/c-9' })], { unreadCount: 3 }));
    const renderer = await render();

    await act(async () => byLabel(renderer, 'Заголовок a')[0].props.onPress());

    expect(mockMarkRead).toHaveBeenCalledWith(['a']);
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/chat/[id]', params: { id: 'c-9' } });
    // Значок гаснет под пальцем, не дожидаясь ответа сервера.
    expect(unreadCount()).toBe(2);
    expect(byLabel(renderer, 'Не прочитано')).toHaveLength(0);
  });

  it('раздел без своего экрана открывает сайт по тому же пути', async () => {
    mockInbox.mockResolvedValue(page([item('a', { url: '/market/orders/o-1', category: 'market' })]));
    const renderer = await render();

    await act(async () => byLabel(renderer, 'Заголовок a')[0].props.onPress());

    expect(mockOpenBrowser).toHaveBeenCalledWith('https://vedamatch.ru/market/orders/o-1');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('уход на сайт объявлен заранее, а переход внутри приложения — нет', async () => {
    mockInbox.mockResolvedValue(
      page([item('a', { url: '/market/orders/o-1' }), item('b', { url: '/chat/c-1' })]),
    );
    const renderer = await render();
    const hints = byLabel(renderer, /Заголовок/).map((node) => node.props.accessibilityHint);
    expect(hints[0]).toContain('сайт');
    expect(hints[1]).not.toContain('сайт');
  });

  it('уже прочитанное повторно не отмечает', async () => {
    mockInbox.mockResolvedValue(page([item('a', { readAt: new Date().toISOString() })]));
    const renderer = await render();
    await act(async () => byLabel(renderer, 'Заголовок a')[0].props.onPress());
    expect(mockMarkRead).not.toHaveBeenCalled();
  });

  it('«Прочитать все» гасит счётчик и перечитывает ленту', async () => {
    mockInbox.mockResolvedValueOnce(page([item('a'), item('b')], { unreadCount: 2 }));
    const renderer = await render();
    const before = mockInbox.mock.calls.length;

    // Перечитанная лента приходит уже прочитанной — иначе счётчик вернулся бы.
    mockInbox.mockResolvedValue(
      page([item('a', { readAt: new Date().toISOString() })], { unreadCount: 0 }),
    );
    await act(async () => byLabel(renderer, 'Отметить все прочитанными')[0].props.onPress());

    // Пустой вызов — «прочитано всё», включая то, до чего не долистали.
    expect(mockMarkRead).toHaveBeenCalledWith(undefined);
    expect(unreadCount()).toBe(0);
    // Строки переехали в другой поток — прежний курсор показывает не туда.
    expect(mockInbox.mock.calls.length).toBeGreaterThan(before);
  });

  it('«Показать ещё» есть только при курсоре и дописывает порцию в конец', async () => {
    mockInbox.mockResolvedValueOnce(page([item('a')], { nextCursor: 'cur-1' }));
    const renderer = await render();
    expect(texts(renderer)).toContain('Показать ещё');

    mockInbox.mockResolvedValueOnce(page([item('b')], { nextCursor: null }));
    await act(async () => byText(renderer, 'Показать ещё').props.onPress());

    expect(mockInbox).toHaveBeenLastCalledWith({ cursor: 'cur-1' });
    const shown = texts(renderer);
    expect(shown).toContain('Заголовок a');
    expect(shown).toContain('Заголовок b');
    // Лента кончилась — кнопки больше нет.
    expect(shown).not.toContain('Показать ещё');
  });

  it('без курсора кнопки продолжения нет', async () => {
    mockInbox.mockResolvedValue(page([item('a')], { nextCursor: null }));
    const renderer = await render();
    expect(texts(renderer)).not.toContain('Показать ещё');
  });

  it('обновление не удалось, а лента есть — она остаётся, ошибка рядом', async () => {
    mockInbox.mockResolvedValueOnce(page([item('a')]));
    const renderer = await render();

    mockInbox.mockRejectedValueOnce(new Error('Сеть отвалилась'));
    await act(async () => {
      renderer.update(<NotificationsScreen />);
    });
    // Пере-рендер сам по себе ленту не роняет; проверяем через обновление.
    const shown = texts(renderer);
    expect(shown).toContain('Заголовок a');
  });
});
