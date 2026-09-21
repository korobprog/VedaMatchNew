import type { ChatGroupCallDto } from '@vedamatch/shared';
import { canStartGroupCall, groupCallButtonLabel } from './group-call-entry';

function room(count: number, over: Partial<ChatGroupCallDto> = {}): ChatGroupCallDto {
  return {
    id: 'room-1',
    conversationId: 'conv-1',
    kind: 'audio',
    status: 'live',
    hostId: 'a',
    startedBy: { id: 'a', name: 'a', avatarUrl: null, lastSeenAt: null },
    createdAt: '2026-09-21T10:00:00.000Z',
    endedAt: null,
    maxParticipants: 4,
    maxVideoParticipants: 3,
    participants: Array.from({ length: count }, (_, index) => ({
      user: { id: `u${index}`, name: `u${index}`, avatarUrl: null, lastSeenAt: null },
      joinedAt: `2026-09-21T10:0${index}:00.000Z`,
      muted: false,
      video: false,
      host: index === 0,
    })),
    ...over,
  };
}

describe('где показывать кнопку', () => {
  it('в группе, где можно писать — да', () => {
    expect(canStartGroupCall({ kind: 'group', canWrite: true })).toBe(true);
  });

  it('в личном диалоге и в канале — нет', () => {
    expect(canStartGroupCall({ kind: 'direct', canWrite: true })).toBe(false);
    expect(canStartGroupCall({ kind: 'channel', canWrite: true })).toBe(false);
  });

  it('там, где писать нельзя, и звонить нельзя', () => {
    expect(canStartGroupCall({ kind: 'group', canWrite: false })).toBe(false);
  });
});

describe('подпись кнопки', () => {
  it('звонка нет — предлагает начать', () => {
    expect(groupCallButtonLabel(null, 'idle')).toEqual({
      text: 'Групповой звонок',
      disabled: false,
    });
  });

  it('звонок идёт — предлагает присоединиться и говорит, сколько там людей', () => {
    expect(groupCallButtonLabel(room(2), 'idle')).toEqual({
      text: 'Присоединиться к звонку, 2 в комнате',
      disabled: false,
    });
  });

  it('комната полная — кнопка гаснет с объяснением', () => {
    expect(groupCallButtonLabel(room(4), 'idle')).toEqual({
      text: 'В звонке уже 4 человека',
      disabled: true,
    });
  });

  it('мы уже в звонке — второго не начать', () => {
    expect(groupCallButtonLabel(null, 'active').disabled).toBe(true);
    expect(groupCallButtonLabel(room(2), 'joining').disabled).toBe(true);
  });
});
