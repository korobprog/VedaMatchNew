import type { ChatAttachmentDto, ChatGroupCallDto } from '@vedamatch/shared';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { GroupCallsContext, type GroupCallsApi } from '@/lib/group-calls/group-call-context';
import { GroupCallStrip } from '@/components/calls/group-call-strip';
import { GroupCallMessageCard } from './group-call-message-card';
import { screenText } from '@/components/blog/blog-test-helpers';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ __esModule: true, router: { push: (...args: unknown[]) => mockPush(...args) } }));
jest.mock('@/lib/feedback', () => ({ __esModule: true, confirmTap: () => undefined }));
jest.mock('@/theme/theme', () => ({
  __esModule: true,
  useTheme: () => ({ colors: jest.requireActual('@/theme/tokens').light }),
}));

function room(ids: string[]): ChatGroupCallDto {
  return {
    id: 'room-1',
    conversationId: 'conv-1',
    kind: 'audio',
    status: 'live',
    hostId: ids[0] ?? null,
    startedBy: { id: 'a', name: 'a' },
    createdAt: '2026-09-26T10:00:00.000Z',
    endedAt: null,
    maxParticipants: 4,
    maxVideoParticipants: 3,
    participants: ids.map((id, index) => ({
      user: { id, name: id },
      joinedAt: '2026-09-26T10:00:00.000Z',
      muted: false,
      video: false,
      host: index === 0,
    })),
  };
}

const card: ChatAttachmentDto = {
  id: 'att-1',
  kind: 'call',
  title: 'Групповой звонок',
  subtitle: 'Идёт',
  sourceService: 'chat-group-call',
  sourceId: 'room-1',
  durationSec: null,
};

function api(over: Partial<GroupCallsApi> = {}): GroupCallsApi {
  return {
    state: { phase: 'idle', call: null } as unknown as GroupCallsApi['state'],
    selfId: 'me',
    callInConversation: () => room(['a', 'b']),
    join: jest.fn(() => Promise.resolve()),
    ...over,
  } as GroupCallsApi;
}

function render(value: GroupCallsApi, node: React.ReactElement): ReactTestRenderer {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<GroupCallsContext.Provider value={value}>{node}</GroupCallsContext.Provider>);
  });
  return renderer;
}

function button(renderer: ReactTestRenderer, label: string): ReactTestInstance {
  return renderer.root.find(
    (node) => node.props.accessibilityRole === 'button' && node.props.accessibilityLabel === label && typeof node.props.onPress === 'function',
  );
}

beforeEach(() => mockPush.mockClear());

describe('вход в групповой звонок из беседы', () => {
  it('карточка в ленте входит в ту же комнату, что и плашка', () => {
    const value = api();
    const renderer = render(value, <GroupCallMessageCard attachment={card} conversationId="conv-1" />);

    expect(screenText(renderer)).toContain('Звонок начался');
    expect(screenText(renderer)).toContain('Групповой звонок · 2 из 4');
    act(() => button(renderer, 'Войти в звонок').props.onPress());
    expect(value.join).toHaveBeenCalledWith('room-1');
  });

  it('завершённая карточка — длительность и никакой кнопки', () => {
    const renderer = render(
      api({ callInConversation: () => null }),
      <GroupCallMessageCard attachment={{ ...card, subtitle: '12:05', durationSec: 725 }} conversationId="conv-1" />,
    );
    expect(screenText(renderer)).toContain('Звонок завершён');
    expect(screenText(renderer)).toContain('Групповой звонок · 12:05');
    expect(renderer.root.findAll((node) => node.props.accessibilityRole === 'button')).toHaveLength(0);
  });

  it('полная комната — «Мест нет», кнопка погашена', () => {
    const renderer = render(
      api({ callInConversation: () => room(['a', 'b', 'c', 'd']) }),
      <GroupCallMessageCard attachment={card} conversationId="conv-1" />,
    );
    expect(button(renderer, 'Мест нет').props.accessibilityState).toEqual({ disabled: true });
  });

  it('мы в этом звонке — карточка возвращает на экран звонка, а не входит заново', () => {
    const own = room(['a', 'me']);
    const value = api({
      state: { phase: 'active', call: own } as unknown as GroupCallsApi['state'],
      callInConversation: () => own,
    });
    const renderer = render(value, <GroupCallMessageCard attachment={card} conversationId="conv-1" />);

    act(() => button(renderer, 'Вернуться в звонок').props.onPress());
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/group-call/[id]', params: { id: 'room-1' } });
    expect(value.join).not.toHaveBeenCalled();
  });

  it('плашка над перепиской: «Идёт звонок · 2 из 4 · Войти»', () => {
    const value = api();
    const renderer = render(value, <GroupCallStrip conversationId="conv-1" />);

    expect(screenText(renderer)).toContain('Идёт звонок · 2 из 4');
    act(() => button(renderer, 'Войти').props.onPress());
    expect(value.join).toHaveBeenCalledWith('room-1');
  });

  it('звонка нет — плашки нет', () => {
    const renderer = render(api({ callInConversation: () => null }), <GroupCallStrip conversationId="conv-1" />);
    expect(renderer.toJSON()).toBeNull();
  });
});
