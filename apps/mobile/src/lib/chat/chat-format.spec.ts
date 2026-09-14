import type { ChatConversationSummary, ChatMessageDto } from '@vedamatch/shared';
import { formatChatDivider, formatChatStamp, initialOf, isNewDay, previewOf, unreadLabel } from './chat-format';

const now = new Date(2026, 8, 14, 15, 30);

function message(overrides: Partial<ChatMessageDto> = {}): ChatMessageDto {
  return {
    id: 'm1',
    conversationId: 'c1',
    author: { id: 'u1', name: 'Кешава' },
    body: 'Харе Кришна',
    attachments: [],
    reactions: [],
    createdAt: new Date(2026, 8, 14, 9, 5).toISOString(),
    ...overrides,
  } as ChatMessageDto;
}

function conversation(overrides: Partial<ChatConversationSummary> = {}): ChatConversationSummary {
  return {
    id: 'c1',
    kind: 'direct',
    state: 'active',
    visibility: 'private',
    title: 'Кешава',
    membersCount: 2,
    unreadCount: 0,
    muted: false,
    pinned: false,
    canWrite: true,
    lastMessage: message(),
    ...overrides,
  } as ChatConversationSummary;
}

describe('formatChatStamp', () => {
  it('часы сегодня, «вчера», день недели и дата', () => {
    expect(formatChatStamp(new Date(2026, 8, 14, 9, 5).toISOString(), now)).toBe('09:05');
    expect(formatChatStamp(new Date(2026, 8, 13, 23, 59).toISOString(), now)).toBe('вчера');
    expect(formatChatStamp(new Date(2026, 8, 10, 12).toISOString(), now)).toBe('чт');
    expect(formatChatStamp(new Date(2026, 7, 2, 12).toISOString(), now)).toBe('2 авг.');
  });

  it('пустое и кривое значение даёт пустую строку', () => {
    expect(formatChatStamp(null, now)).toBe('');
    expect(formatChatStamp('not a date', now)).toBe('');
  });
});

describe('formatChatDivider', () => {
  it('год показывает только для прошлых лет', () => {
    expect(formatChatDivider(new Date(2026, 8, 14, 1).toISOString(), now)).toBe('Сегодня');
    expect(formatChatDivider(new Date(2026, 8, 13).toISOString(), now)).toBe('Вчера');
    expect(formatChatDivider(new Date(2026, 4, 1).toISOString(), now)).toBe('1 мая');
    expect(formatChatDivider(new Date(2025, 11, 31).toISOString(), now)).toBe('31 декабря 2025');
  });
});

describe('isNewDay', () => {
  it('разделитель перед первым сообщением и при смене дня', () => {
    const morning = message({ createdAt: new Date(2026, 8, 14, 9).toISOString() });
    const evening = message({ createdAt: new Date(2026, 8, 14, 21).toISOString() });
    const nextDay = message({ createdAt: new Date(2026, 8, 15, 0, 1).toISOString() });
    expect(isNewDay(undefined, morning)).toBe(true);
    expect(isNewDay(morning, evening)).toBe(false);
    expect(isNewDay(evening, nextDay)).toBe(true);
  });
});

describe('previewOf', () => {
  it('в личной беседе без имени автора, в группе с именем', () => {
    expect(previewOf(conversation())).toBe('Харе Кришна');
    expect(previewOf(conversation({ kind: 'group' }))).toBe('Кешава: Харе Кришна');
  });

  it('пустая беседа, удалённое сообщение и вложение без текста', () => {
    expect(previewOf(conversation({ lastMessage: null }))).toBe('Пока ни одного сообщения');
    expect(previewOf(conversation({ lastMessage: message({ deletedAt: new Date().toISOString() }) }))).toBe(
      'Сообщение удалено',
    );
    expect(
      previewOf(conversation({ lastMessage: message({ body: '  ', attachments: [{ id: 'a', kind: 'image' }] }) })),
    ).toBe('Фото');
  });
});

describe('мелочи', () => {
  it('буква аватара и счётчик', () => {
    expect(initialOf(' сита')).toBe('С');
    expect(initialOf('')).toBe('?');
    expect(unreadLabel(7)).toBe('7');
    expect(unreadLabel(140)).toBe('99+');
  });
});
