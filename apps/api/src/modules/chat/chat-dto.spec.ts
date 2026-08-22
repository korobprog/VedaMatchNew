import type { ChatAttachment, ChatMessageReaction } from '@prisma/client';
import {
  conversationTitle,
  toMessageDto,
  toReactionSummaries,
  toUserSummary,
  type ChatConversationRow,
  type ChatMessageRow,
} from './chat-dto';

const user = (over: Partial<Record<string, unknown>> = {}) =>
  ({
    id: 'u1',
    name: 'Иван',
    spiritualName: null,
    avatarUrl: null,
    ...over,
  }) as never;

const reaction = (emoji: string, userId: string) =>
  ({ emoji, userId }) as Pick<ChatMessageReaction, 'emoji' | 'userId'>;

describe('toUserSummary', () => {
  it('показывает духовное имя, когда оно есть', () => {
    expect(toUserSummary(user({ spiritualName: 'Говинда дас' })).name).toBe(
      'Говинда дас',
    );
  });

  it('без духовного имени показывает мирское', () => {
    expect(toUserSummary(user()).name).toBe('Иван');
  });
});

describe('toReactionSummaries', () => {
  it('считает одинаковые эмодзи вместе и помечает мою', () => {
    const summaries = toReactionSummaries(
      [reaction('🙏', 'a'), reaction('🙏', 'me'), reaction('🔥', 'a')],
      'me',
    );
    expect(summaries[0]).toEqual({ emoji: '🙏', count: 2, mine: true });
    expect(summaries[1]).toEqual({ emoji: '🔥', count: 1, mine: false });
  });

  it('чужая реакция не становится моей', () => {
    expect(toReactionSummaries([reaction('🙏', 'a')], 'me')[0].mine).toBe(
      false,
    );
  });
});

const message = (over: Partial<ChatMessageRow> = {}): ChatMessageRow =>
  ({
    id: 'm1',
    conversationId: 'c1',
    authorId: 'me',
    author: user({ id: 'me' }),
    body: 'привет',
    replyToId: null,
    replyTo: null,
    attachments: [] as ChatAttachment[],
    reactions: [] as ChatMessageReaction[],
    editedAt: null,
    deletedAt: null,
    createdAt: new Date('2026-08-22T10:00:00.000Z'),
    ...over,
  }) as ChatMessageRow;

describe('toMessageDto', () => {
  it('удалённое сообщение отдаёт пустым, но не вырезает из ленты', () => {
    const dto = toMessageDto(
      message({
        deletedAt: new Date('2026-08-22T11:00:00.000Z'),
        attachments: [{ id: 'a', position: 0 } as ChatAttachment],
        reactions: [reaction('🙏', 'a') as ChatMessageReaction],
      }),
      'me',
    );
    expect(dto.id).toBe('m1');
    expect(dto.body).toBe('');
    expect(dto.attachments).toEqual([]);
    expect(dto.reactions).toEqual([]);
  });

  it('ставит «прочитано» только на своё сообщение и только после отметки', () => {
    const later = new Date('2026-08-22T10:30:00.000Z');
    const earlier = new Date('2026-08-22T09:30:00.000Z');
    expect(toMessageDto(message(), 'me', later).readByOthers).toBe(true);
    expect(toMessageDto(message(), 'me', earlier).readByOthers).toBe(false);
    expect(toMessageDto(message(), 'me', null).readByOthers).toBe(false);
  });

  it('на чужом сообщении галочки нет вовсе', () => {
    const dto = toMessageDto(
      message({ authorId: 'other', author: user({ id: 'other' }) }),
      'me',
      new Date(),
    );
    expect(dto.readByOthers).toBeUndefined();
  });

  it('сортирует вложения по позиции, а не по порядку выборки', () => {
    const dto = toMessageDto(
      message({
        attachments: [
          {
            id: 'b',
            position: 1,
            kind: 'image',
            waveform: [],
          } as unknown as ChatAttachment,
          {
            id: 'a',
            position: 0,
            kind: 'image',
            waveform: [],
          } as unknown as ChatAttachment,
        ],
      }),
      'me',
    );
    expect(dto.attachments.map((a) => a.id)).toEqual(['a', 'b']);
  });
});

const conversation = (over: Partial<ChatConversationRow> = {}) =>
  ({
    id: 'c1',
    kind: 'direct',
    state: 'active',
    title: null,
    avatarUrl: null,
    members: [
      { userId: 'me', role: 'member', leftAt: null, user: user({ id: 'me' }) },
      {
        userId: 'other',
        role: 'member',
        leftAt: null,
        user: user({ id: 'other', spiritualName: 'Радха деви даси' }),
      },
    ],
    ...over,
  }) as unknown as ChatConversationRow;

describe('conversationTitle', () => {
  it('в личном диалоге показывает собеседника, а не смотрящего', () => {
    const result = conversationTitle(conversation(), 'me');
    expect(result.title).toBe('Радха деви даси');
    expect(result.companion?.id).toBe('other');
  });

  it('у группы берёт собственное название', () => {
    const result = conversationTitle(
      conversation({ kind: 'group', title: 'Киртан-группа' }),
      'me',
    );
    expect(result.title).toBe('Киртан-группа');
    expect(result.companion).toBeNull();
  });
});
