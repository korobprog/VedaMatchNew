import type { SupportTicketDto } from '@vedamatch/shared';
import type { ReactTestRenderer } from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { ApiError } from '@/lib/api/client';
import SupportTicketScreen from './[id]';

const mockGet = jest.fn();
const mockReply = jest.fn();

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    __esModule: true,
    Stack: { Screen: () => null },
    useLocalSearchParams: () => ({ id: 't-1' }),
    // Фокус экрана в тесте — просто монтирование.
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
  };
});

jest.mock('react-native-safe-area-context', () => ({
  __esModule: true,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@/components/keyboard-controller-web', () => {
  const { View } = jest.requireActual('react-native');
  return { __esModule: true, ChatKeyboardAvoidingView: View, PersonKeyboardAwareScroll: View };
});

const mockSession = { api: {} };
jest.mock('@/lib/auth/session', () => ({ __esModule: true, useSession: () => mockSession }));
jest.mock('@/lib/feedback', () => ({ __esModule: true, confirmTap: jest.fn() }));
jest.mock('@/lib/support/support-api', () => ({
  __esModule: true,
  createSupportApi: () => ({
    get: (...args: unknown[]) => mockGet(...args),
    reply: (...args: unknown[]) => mockReply(...args),
  }),
}));

function ticket(over: Partial<SupportTicketDto> = {}): SupportTicketDto {
  return {
    id: 't-1',
    number: 42,
    subject: 'Не приходят пуши',
    category: 'technical',
    status: 'waiting_user',
    createdAt: '2026-09-21T10:00:00.000Z',
    updatedAt: '2026-09-21T10:00:00.000Z',
    lastMessageAt: '2026-09-21T10:00:00.000Z',
    firstResponseAt: '2026-09-21T11:00:00.000Z',
    closedAt: null,
    contactEmail: null,
    contactTelegram: null,
    messages: [
      { id: 'm1', authorType: 'user', authorName: null, body: 'Не приходят', createdAt: '2026-09-21T10:00:00.000Z' },
      { id: 'm2', authorType: 'admin', authorName: 'Поддержка VedaMatch', body: 'Какой телефон?', createdAt: '2026-09-21T11:00:00.000Z' },
    ],
    ...over,
  };
}

async function render(): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<SupportTicketScreen />);
  });
  await act(async () => {
    await Promise.resolve();
  });
  return renderer;
}

function texts(renderer: ReactTestRenderer): string {
  return renderer.root
    .findAllByType('Text' as never)
    .map((node) => [node.props.children].flat().join(''))
    .join('\n');
}

const input = (renderer: ReactTestRenderer) => renderer.root.findAllByProps({ accessibilityLabel: 'Ответ в обращение' });
const send = (renderer: ReactTestRenderer) =>
  renderer.root.findAll((node) => node.props.accessibilityRole === 'button' && node.props.accessibilityState?.busy !== undefined)[0];

beforeEach(() => {
  jest.clearAllMocks();
  mockGet.mockResolvedValue(ticket());
});

describe('Переписка по обращению', () => {
  it('показывает сообщения с подписями «Вы» и «Поддержка VedaMatch»', async () => {
    const renderer = await render();
    expect(mockGet).toHaveBeenCalledWith('t-1');
    const shown = texts(renderer);
    expect(shown).toContain('Вы');
    expect(shown).toContain('Поддержка VedaMatch');
    expect(shown).toContain('Какой телефон?');
    expect(shown).toContain('Ждём ответа · Техническая проблема');
  });

  it('ответ уходит, поле очищается, переписка берётся из ответа сервера', async () => {
    const answered = ticket({
      status: 'in_progress',
      messages: [...ticket().messages, { id: 'm3', authorType: 'user', authorName: null, body: 'Samsung A51', createdAt: '2026-09-21T12:00:00.000Z' }],
    });
    mockReply.mockResolvedValue(answered);
    const renderer = await render();
    await act(async () => {
      input(renderer)[0].props.onChangeText('  Samsung A51 ');
    });
    await act(async () => {
      send(renderer).props.onPress();
    });
    expect(mockReply).toHaveBeenCalledWith('t-1', 'Samsung A51');
    expect(input(renderer)[0].props.value).toBe('');
    expect(texts(renderer)).toContain('Samsung A51');
    expect(texts(renderer)).toContain('В работе');
  });

  it('пустой ответ не отправляется', async () => {
    const renderer = await render();
    await act(async () => {
      input(renderer)[0].props.onChangeText('   ');
    });
    expect(send(renderer).props.disabled).toBe(true);
  });

  it('ошибка отправки: объяснение, текст остаётся в поле', async () => {
    mockReply.mockRejectedValue(new TypeError('Network request failed'));
    const renderer = await render();
    await act(async () => {
      input(renderer)[0].props.onChangeText('Samsung');
    });
    await act(async () => {
      send(renderer).props.onPress();
    });
    expect(texts(renderer)).toContain('текст сохранён');
    expect(input(renderer)[0].props.value).toBe('Samsung');
  });

  it('в закрытое обращение писать нельзя — предложено новое', async () => {
    mockGet.mockResolvedValue(ticket({ status: 'closed' }));
    const renderer = await render();
    expect(input(renderer)).toHaveLength(0);
    expect(texts(renderer)).toContain('Обращение закрыто');
  });

  it('чужое обращение: понятный отказ без бесполезного «Повторить»', async () => {
    mockGet.mockRejectedValue(new ApiError(404, 'Обращение не найдено', null));
    const renderer = await render();
    expect(texts(renderer)).toContain('Обращение не найдено');
    expect(texts(renderer)).not.toContain('Повторить');
  });
});
