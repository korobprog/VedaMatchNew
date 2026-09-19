import type { ChatMessageDto } from '@vedamatch/shared';
import {
  applyReadByOther,
  applyRoomEvent,
  buildPendingMessage,
  dropPendingMessage,
  isPendingMessage,
  prependOlder,
  settlePendingMessage,
} from './chat-room-state';
import { streamBackoffMs } from './stream-backoff';

function msg(id: string, authorId = 'other', createdAt = '2026-09-14T10:00:00Z'): ChatMessageDto {
  return {
    id,
    conversationId: 'c1',
    author: { id: authorId, name: 'A' },
    body: id,
    attachments: [],
    reactions: [],
    createdAt,
  } as ChatMessageDto;
}

const author = { id: 'me', name: 'Я' };

describe('черновик отправки', () => {
  it('заменяется ответом сервера', () => {
    const draft = buildPendingMessage({ seed: 's1', conversationId: 'c1', author, body: 'hi', now: new Date() });
    expect(isPendingMessage(draft)).toBe(true);
    expect(settlePendingMessage([msg('a'), draft], draft.id, msg('real', 'me')).map((m) => m.id)).toEqual(['a', 'real']);
  });

  it('не дублируется, если поток доставил сообщение раньше ответа', () => {
    const draft = buildPendingMessage({ seed: 's1', conversationId: 'c1', author, body: 'hi', now: new Date() });
    const saved = msg('real', 'me');
    expect(settlePendingMessage([draft, saved], draft.id, saved).map((m) => m.id)).toEqual(['real']);
  });

  it('убирается при ошибке', () => {
    const draft = buildPendingMessage({ seed: 's1', conversationId: 'c1', author, body: 'hi', now: new Date() });
    expect(dropPendingMessage([msg('a'), draft], draft.id).map((m) => m.id)).toEqual(['a']);
  });

  it('несёт вложения и цитату ответа, пока отправляется', () => {
    const draft = buildPendingMessage({
      seed: 's2',
      conversationId: 'c1',
      author,
      body: '',
      now: new Date(),
      attachments: [{ kind: 'image', url: 'https://x/1', key: '1', mimeType: 'image/jpeg', sizeBytes: 10 }],
      replyTo: { id: 'orig', authorName: 'Другой', body: 'Исходный текст' },
    });
    expect(draft.attachments).toHaveLength(1);
    expect(draft.attachments[0].kind).toBe('image');
    expect(draft.replyTo?.id).toBe('orig');
  });

  it('голосовое несёт длительность и дорожку — плеер рисует их до ответа сервера', () => {
    const draft = buildPendingMessage({
      seed: 's3',
      conversationId: 'c1',
      author,
      body: '',
      now: new Date(),
      attachments: [
        { kind: 'voice', url: 'https://x/v', key: 'v', mimeType: 'audio/mp4', sizeBytes: 4000, durationSec: 7, waveform: [1, 2, 3] },
      ],
    });
    expect(draft.attachments[0].durationSec).toBe(7);
    expect(draft.attachments[0].waveform).toEqual([1, 2, 3]);
  });
});

describe('applyRoomEvent', () => {
  it('добавляет новое сообщение без дублей и игнорирует чужие беседы', () => {
    const list = [msg('a')];
    const added = applyRoomEvent(list, { type: 'message.created', conversationId: 'c1', message: msg('b') }, 'c1');
    expect(added.map((m) => m.id)).toEqual(['a', 'b']);
    expect(applyRoomEvent(list, { type: 'message.created', conversationId: 'c1', message: msg('a') }, 'c1')).toHaveLength(1);
    expect(applyRoomEvent(list, { type: 'message.created', conversationId: 'c2', message: msg('z') }, 'c1')).toHaveLength(1);
  });

  it('правка, удаление и реакции', () => {
    const list = [msg('a')];
    const edited = applyRoomEvent(list, { type: 'message.updated', conversationId: 'c1', message: { ...msg('a'), body: 'new' } }, 'c1');
    expect(edited[0].body).toBe('new');
    const deleted = applyRoomEvent(list, { type: 'message.deleted', conversationId: 'c1', messageId: 'a' }, 'c1')[0];
    expect(deleted.body).toBe('');
    expect(deleted.deletedAt).toBeTruthy();
    const reacted = applyRoomEvent(
      list,
      { type: 'reaction.set', conversationId: 'c1', messageId: 'a', reactions: [{ emoji: '🙏', count: 1, mine: true }] },
      'c1',
    );
    expect(reacted[0].reactions).toHaveLength(1);
  });
});

describe('prependOlder', () => {
  it('приклеивает старшую страницу без дублей', () => {
    expect(prependOlder([msg('c'), msg('d')], [msg('a'), msg('b'), msg('c')]).map((m) => m.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('applyReadByOther', () => {
  it('отмечает свои сообщения не позже отметки и не трогает черновики', () => {
    const draft = buildPendingMessage({ seed: 's', conversationId: 'c1', author, body: 'x', now: new Date('2026-09-14T09:00:00Z') });
    const list = [
      msg('old', 'me', '2026-09-14T09:00:00Z'),
      msg('new', 'me', '2026-09-14T11:00:00Z'),
      msg('theirs', 'other', '2026-09-14T09:00:00Z'),
      draft,
    ];
    const next = applyReadByOther(list, 'me', '2026-09-14T10:00:00Z');
    expect(next.map((m) => Boolean(m.readByOthers))).toEqual([true, false, false, false]);
  });
});

describe('streamBackoffMs', () => {
  it('удваивается от секунды до потолка 15 с', () => {
    expect([0, 1, 2, 3, 4, 5, 50].map(streamBackoffMs)).toEqual([1000, 2000, 4000, 8000, 15000, 15000, 15000]);
    expect(streamBackoffMs(-3)).toBe(1000);
  });
});
