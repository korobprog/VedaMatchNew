import type { ChatConversationDetail, ChatMemberRole } from '@vedamatch/shared';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import ConversationMembersScreen from './[id]';

const mockDetail = jest.fn();
const mockPeople = jest.fn();
const mockAddMembers = jest.fn();
const mockRemoveMember = jest.fn();
const mockSetMemberRole = jest.fn();
const mockUpdateConversation = jest.fn();
const mockLeave = jest.fn();
const mockRemoveConversation = jest.fn();
const mockReplace = jest.fn();
const mockDismissAll = jest.fn();

jest.mock('expo-router', () => ({
  __esModule: true,
  Stack: { Screen: () => null },
  router: {
    replace: (...args: unknown[]) => mockReplace(...args),
    dismissAll: () => mockDismissAll(),
  },
  useLocalSearchParams: () => ({ id: 'conv-1' }),
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

const fakeSession = { api: {}, user: { id: 'me' } };
jest.mock('@/lib/auth/session', () => ({ __esModule: true, useSession: () => fakeSession }));

jest.mock('@/lib/feedback', () => ({ __esModule: true, confirmTap: jest.fn(), longPressTap: jest.fn() }));

jest.mock('@/lib/chat/chat-api', () => ({
  __esModule: true,
  createChatApi: () => ({
    detail: (...args: unknown[]) => mockDetail(...args),
    people: () => mockPeople(),
    addMembers: (...args: unknown[]) => mockAddMembers(...args),
    removeMember: (...args: unknown[]) => mockRemoveMember(...args),
    setMemberRole: (...args: unknown[]) => mockSetMemberRole(...args),
    updateConversation: (...args: unknown[]) => mockUpdateConversation(...args),
    leave: (...args: unknown[]) => mockLeave(...args),
    removeConversation: (...args: unknown[]) => mockRemoveConversation(...args),
  }),
}));

function member(id: string, name: string, role: ChatMemberRole = 'member') {
  return { user: { id, name }, role, joinedAt: '2026-01-01T00:00:00.000Z' };
}

function conversation(myRole: ChatMemberRole, extra: Partial<ChatConversationDetail> = {}): ChatConversationDetail {
  return {
    id: 'conv-1',
    kind: 'group',
    state: 'active',
    visibility: 'private',
    title: 'Севаки',
    description: null,
    membersCount: 3,
    unreadCount: 0,
    muted: false,
    pinned: false,
    official: false,
    canWrite: true,
    members: [member('me', 'Я', myRole), member('u1', 'Мадхава'), member('u2', 'Радха', 'admin')],
    messages: [],
    hasMore: false,
    myRole,
    ...extra,
  } as ChatConversationDetail;
}

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
    renderer = create(<ConversationMembersScreen />);
  });
  await flush();
  return renderer;
}

function queryByLabel(renderer: ReactTestRenderer, label: string): ReactTestInstance | null {
  const found = renderer.root.findAllByProps({ accessibilityLabel: label });
  return found.length > 0 ? found[0] : null;
}

function byLabel(renderer: ReactTestRenderer, label: string): ReactTestInstance {
  const found = queryByLabel(renderer, label);
  if (!found) throw new Error(`Нет элемента с подписью «${label}»`);
  return found;
}

function texts(renderer: ReactTestRenderer): string {
  return renderer.root
    .findAllByType('Text' as never, { deep: true })
    .map((node) => JSON.stringify(node.props.children))
    .join(' ');
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDetail.mockResolvedValue(conversation('owner'));
  mockPeople.mockResolvedValue({ people: [{ id: 'u3', name: 'Ананда' }] });
  mockAddMembers.mockResolvedValue({ added: 1 });
  mockRemoveMember.mockResolvedValue({ ok: true });
  mockSetMemberRole.mockResolvedValue({ role: 'admin' });
  mockUpdateConversation.mockResolvedValue({ ...conversation('owner'), title: 'Севаки' });
  mockLeave.mockResolvedValue({ ok: true });
  mockRemoveConversation.mockResolvedValue({ ok: true });
});

describe('Экран участников — загрузка и ошибка', () => {
  it('беседа не загрузилась — ошибка сервера и «Повторить» вместо списка', async () => {
    mockDetail.mockRejectedValue(new Error('Беседа не найдена'));
    const renderer = await render();
    expect(texts(renderer)).toContain('Беседа не найдена');
    expect(texts(renderer)).toContain('Повторить');
    expect(queryByLabel(renderer, 'Название беседы')).toBeNull();
  });
});

describe('Экран участников — права', () => {
  it('владелец видит правку беседы, раздачу прав и удаление', async () => {
    const renderer = await render();
    expect(queryByLabel(renderer, 'Сохранить')).not.toBeNull();
    expect(queryByLabel(renderer, 'Удалить беседу')).not.toBeNull();
    expect(queryByLabel(renderer, 'Сделать админом: Мадхава')).not.toBeNull();
    expect(queryByLabel(renderer, 'Снять права: Радха')).not.toBeNull();
  });

  it('администратор правит беседу, но не раздаёт права и не удаляет её', async () => {
    mockDetail.mockResolvedValue(conversation('admin'));
    const renderer = await render();
    expect(queryByLabel(renderer, 'Сохранить')).not.toBeNull();
    expect(queryByLabel(renderer, 'Удалить беседу')).toBeNull();
    expect(queryByLabel(renderer, 'Сделать админом: Мадхава')).toBeNull();
    // Рядового исключить может, другого администратора — нет.
    expect(queryByLabel(renderer, 'Исключить: Мадхава')).not.toBeNull();
    expect(queryByLabel(renderer, 'Исключить: Радха')).toBeNull();
  });

  it('рядовой участник только смотрит и может выйти', async () => {
    mockDetail.mockResolvedValue(conversation('member'));
    const renderer = await render();
    expect(queryByLabel(renderer, 'Сохранить')).toBeNull();
    expect(queryByLabel(renderer, 'Исключить: Мадхава')).toBeNull();
    expect(queryByLabel(renderer, 'Выйти из группы')).not.toBeNull();
  });

  it('рядовому участнику список «кого позвать» даже не запрашивается', async () => {
    mockDetail.mockResolvedValue(conversation('member'));
    await render();
    expect(mockPeople).not.toHaveBeenCalled();
  });

  it('у рядового участника раздела «Позвать» нет вовсе', async () => {
    mockDetail.mockResolvedValue(conversation('member'));
    const renderer = await render();
    expect(texts(renderer)).not.toContain('Позвать');
    // И ни одного объяснения «звать некого» — раздела просто нет.
    expect(texts(renderer)).not.toContain('Звать некого');
  });

  it('у администратора раздел «Позвать» есть', async () => {
    mockDetail.mockResolvedValue(conversation('admin'));
    const renderer = await render();
    expect(texts(renderer)).toContain('Позвать');
    expect(queryByLabel(renderer, 'Ананда')).not.toBeNull();
  });

  it('себя из списка не исключают', async () => {
    const renderer = await render();
    expect(queryByLabel(renderer, 'Исключить: Я')).toBeNull();
  });
});

describe('Экран участников — правка беседы', () => {
  it('пустое название не уходит на сервер', async () => {
    const renderer = await render();
    await act(async () => {
      byLabel(renderer, 'Название беседы').props.onChangeText('   ');
    });
    await act(async () => {
      byLabel(renderer, 'Сохранить').props.onPress();
    });
    await flush();
    expect(mockUpdateConversation).not.toHaveBeenCalled();
    expect(texts(renderer)).toContain('Название не может быть пустым');
  });

  it('сохраняет название, описание и открытость одним запросом', async () => {
    const renderer = await render();
    await act(async () => {
      byLabel(renderer, 'Название беседы').props.onChangeText('  Севаки Минска  ');
    });
    await act(async () => {
      byLabel(renderer, 'Описание беседы').props.onChangeText('Подготовка программ');
    });
    await act(async () => {
      byLabel(renderer, 'Открыто для всех').props.onPress();
    });
    await act(async () => {
      byLabel(renderer, 'Сохранить').props.onPress();
    });
    await flush();
    expect(mockUpdateConversation).toHaveBeenCalledWith('conv-1', {
      title: 'Севаки Минска',
      description: 'Подготовка программ',
      visibility: 'public',
    });
    expect(texts(renderer)).toContain('Сохранено');
  });

  it('отказ сервера показывается рядом с формой', async () => {
    mockUpdateConversation.mockRejectedValue(new Error('Меняет владелец или администратор'));
    const renderer = await render();
    await act(async () => {
      byLabel(renderer, 'Сохранить').props.onPress();
    });
    await flush();
    expect(texts(renderer)).toContain('Меняет владелец или администратор');
  });
});

describe('Экран участников — приглашение', () => {
  it('тап по человеку зовёт его и переносит в список участников', async () => {
    const renderer = await render();
    await act(async () => {
      byLabel(renderer, 'Ананда').props.onPress();
    });
    await flush();
    expect(mockAddMembers).toHaveBeenCalledWith('conv-1', ['u3']);
    // Позвали — в «кого позвать» его больше нет, звать некого.
    expect(texts(renderer)).toContain('Все, с кем есть переписка, уже здесь');
  });

  it('звать некого — экран объясняет, почему список пуст', async () => {
    mockPeople.mockResolvedValue({ people: [] });
    const renderer = await render();
    expect(texts(renderer)).toContain('Звать некого');
  });

  it('отказ сервера на приглашение виден на экране', async () => {
    mockAddMembers.mockRejectedValue(new Error('Приглашает владелец или администратор'));
    const renderer = await render();
    await act(async () => {
      byLabel(renderer, 'Ананда').props.onPress();
    });
    await flush();
    expect(texts(renderer)).toContain('Приглашает владелец или администратор');
  });
});

describe('Экран участников — роли и исключение', () => {
  it('«Сделать админом» отправляет роль и меняет подпись строки', async () => {
    const renderer = await render();
    await act(async () => {
      byLabel(renderer, 'Сделать админом: Мадхава').props.onPress();
    });
    await flush();
    expect(mockSetMemberRole).toHaveBeenCalledWith('conv-1', 'u1', 'admin');
    expect(queryByLabel(renderer, 'Снять права: Мадхава')).not.toBeNull();
  });

  it('исключение сначала спрашивает подтверждение и называет человека', async () => {
    const renderer = await render();
    await act(async () => {
      byLabel(renderer, 'Исключить: Мадхава').props.onPress();
    });
    expect(texts(renderer)).toContain('Мадхава больше не увидит переписку');
    expect(mockRemoveMember).not.toHaveBeenCalled();
  });

  it('подтверждение исключает участника и убирает строку', async () => {
    const renderer = await render();
    await act(async () => {
      byLabel(renderer, 'Исключить: Мадхава').props.onPress();
    });
    // Кнопка подтверждения в диалоге подписана коротко — «Исключить»,
    // в отличие от строки участника («Исключить: Мадхава»).
    await act(async () => {
      byLabel(renderer, 'Исключить').props.onPress();
    });
    await flush();
    expect(mockRemoveMember).toHaveBeenCalledWith('conv-1', 'u1');
    expect(queryByLabel(renderer, 'Исключить: Мадхава')).toBeNull();
  });
});

describe('Экран участников — выход и удаление', () => {
  it('«Выйти из группы» спрашивает подтверждение, а не уходит сразу', async () => {
    const renderer = await render();
    await act(async () => {
      byLabel(renderer, 'Выйти из группы').props.onPress();
    });
    expect(mockLeave).not.toHaveBeenCalled();
    expect(texts(renderer)).toContain('Переписка пропадёт из списка');
  });

  it('удаление беседы честно предупреждает, что вернуть нельзя', async () => {
    const renderer = await render();
    await act(async () => {
      byLabel(renderer, 'Удалить беседу').props.onPress();
    });
    expect(texts(renderer)).toContain('Вернуть будет нельзя');
    expect(mockRemoveConversation).not.toHaveBeenCalled();
  });

  it('после подтверждения выхода уводит в список бесед, а не оставляет в пустой беседе', async () => {
    const renderer = await render();
    await act(async () => {
      byLabel(renderer, 'Выйти из группы').props.onPress();
    });
    await act(async () => {
      byLabel(renderer, 'Выйти').props.onPress();
    });
    await flush();
    expect(mockLeave).toHaveBeenCalledWith('conv-1');
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
  });

  it('подтверждённое удаление сносит беседу и возвращает в список', async () => {
    const renderer = await render();
    await act(async () => {
      byLabel(renderer, 'Удалить беседу').props.onPress();
    });
    await act(async () => {
      byLabel(renderer, 'Удалить').props.onPress();
    });
    await flush();
    expect(mockRemoveConversation).toHaveBeenCalledWith('conv-1');
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
  });

  it('сервер не дал выйти — отказ на экране, и никуда не уводит', async () => {
    mockLeave.mockRejectedValue(new Error('Не получилось выйти'));
    const renderer = await render();
    await act(async () => {
      byLabel(renderer, 'Выйти из группы').props.onPress();
    });
    await act(async () => {
      byLabel(renderer, 'Выйти').props.onPress();
    });
    await flush();
    expect(texts(renderer)).toContain('Не получилось выйти');
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
