import type { ChatGroupCallDto } from '@vedamatch/shared';
import {
  conversationCallStrip,
  ownCallBanner,
  peopleLabel,
} from './group-call-banner-text';

function room(ids: string[], over: Partial<ChatGroupCallDto> = {}): ChatGroupCallDto {
  return {
    id: 'room-1',
    conversationId: 'conv-1',
    kind: 'audio',
    status: 'live',
    hostId: ids[0] ?? null,
    startedBy: { id: ids[0] ?? 'a', name: 'a', avatarUrl: null, lastSeenAt: null },
    createdAt: '2026-09-21T10:00:00.000Z',
    endedAt: null,
    maxParticipants: 4,
    maxVideoParticipants: 3,
    participants: ids.map((id, index) => ({
      user: { id, name: id, avatarUrl: null, lastSeenAt: null },
      joinedAt: `2026-09-21T10:0${index}:00.000Z`,
      muted: false,
      video: false,
      host: index === 0,
    })),
    ...over,
  };
}

describe('плашка группового звонка', () => {
  it('свой звонок ведёт назад к экрану звонка, а не предлагает войти заново', () => {
    const own = room(['a', 'me']);
    expect(conversationCallStrip('conv-1', own, own, 'me', 'active')).toEqual({
      kind: 'own',
      callId: 'room-1',
      title: 'Вы в звонке · 2 из 4',
      action: 'Вернуться в звонок',
      blocked: false,
    });
  });

  it('плавающая плашка своего звонка говорит то же самое', () => {
    expect(ownCallBanner(room(['a', 'me']))).toMatchObject({
      title: 'Вы в звонке · 2 из 4',
      action: 'Вернуться в звонок',
    });
  });

  it('чужой звонок в открытой беседе предлагает войти и показывает места', () => {
    const banner = conversationCallStrip('conv-1', null, room(['a', 'b']), 'me', 'idle');
    expect(banner).toEqual({
      kind: 'invite',
      callId: 'room-1',
      title: 'Идёт звонок · 2 из 4',
      action: 'Войти',
      blocked: false,
    });
  });

  it('после выхода (фаза ended) снова предлагает войти', () => {
    expect(
      conversationCallStrip('conv-1', null, room(['a']), 'me', 'ended')?.action,
    ).toBe('Войти');
  });

  it('полная комната — «Мест нет», кнопка погашена', () => {
    const banner = conversationCallStrip('conv-1', null, room(['a', 'b', 'c', 'd']), 'me', 'idle');
    expect(banner?.title).toBe('Идёт звонок · 4 из 4');
    expect(banner?.action).toBe('Мест нет');
    expect(banner?.blocked).toBe(true);
  });

  it('пока идёт вход — «Входим…», второй раз нажать нельзя', () => {
    expect(
      conversationCallStrip('conv-1', null, room(['a']), 'me', 'joining'),
    ).toMatchObject({ action: 'Входим…', blocked: true });
  });

  it('мы в звонке другой беседы — сюда не пускает и объясняет почему', () => {
    const elsewhere = room(['me'], { id: 'room-9', conversationId: 'conv-9' });
    expect(
      conversationCallStrip('conv-1', elsewhere, room(['a']), 'me', 'active'),
    ).toMatchObject({ kind: 'invite', action: 'Вы в другом звонке', blocked: true });
  });

  it('мы числимся в комнате, но не здесь (другое устройство) — второй вход не предлагаем', () => {
    expect(
      conversationCallStrip('conv-1', null, room(['a', 'me']), 'me', 'idle'),
    ).toMatchObject({ action: 'Вы уже в звонке', blocked: true });
  });

  it('закончившийся и отсутствующий звонок плашки не дают', () => {
    expect(
      conversationCallStrip('conv-1', null, room(['a'], { status: 'ended' }), 'me', 'idle'),
    ).toBeNull();
    expect(conversationCallStrip('conv-1', null, null, 'me', 'idle')).toBeNull();
  });

  it('склоняет «человек»', () => {
    expect(peopleLabel(1)).toBe('1 человек');
    expect(peopleLabel(2)).toBe('2 человека');
    expect(peopleLabel(5)).toBe('5 человек');
    expect(peopleLabel(11)).toBe('11 человек');
    expect(peopleLabel(22)).toBe('22 человека');
  });
});
