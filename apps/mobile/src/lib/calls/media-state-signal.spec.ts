import type { ChatCallSignal } from '@vedamatch/shared';
import {
  buildMediaSignal,
  DEFAULT_REMOTE_MEDIA,
  readMediaSignal,
  reconnectRestored,
  shouldAnnounceMedia,
} from './media-state-signal';

describe('buildMediaSignal', () => {
  it('собирает сигнал состояния камеры в обе стороны', () => {
    expect(buildMediaSignal(false)).toEqual({ kind: 'media', media: { video: false } });
    expect(buildMediaSignal(true)).toEqual({ kind: 'media', media: { video: true } });
  });

  it('то, что собрали, читается обратно', () => {
    expect(readMediaSignal(buildMediaSignal(false))).toEqual({ video: false });
    expect(readMediaSignal(buildMediaSignal(true))).toEqual({ video: true });
  });
});

describe('readMediaSignal', () => {
  it('сигналы переговоров — не про медиа', () => {
    const offer: ChatCallSignal = { kind: 'sdp', sdp: { type: 'offer', sdp: 'v=0' } };
    const candidate: ChatCallSignal = { kind: 'candidate', candidate: { candidate: 'a' } };
    const endOfCandidates: ChatCallSignal = { kind: 'candidate', candidate: null };

    expect(readMediaSignal(offer)).toBeNull();
    expect(readMediaSignal(candidate)).toBeNull();
    expect(readMediaSignal(endOfCandidates)).toBeNull();
  });

  it('испорченная форма игнорируется, а не читается как «камера выключена»', () => {
    const cases = [
      { kind: 'media' },
      { kind: 'media', media: null },
      { kind: 'media', media: {} },
      { kind: 'media', media: { video: 'off' } },
      { kind: 'media', media: { video: 0 } },
    ];
    for (const value of cases)
      expect(readMediaSignal(value as unknown as ChatCallSignal)).toBeNull();
  });
});

describe('умолчание', () => {
  it('пока собеседник молчит, его камера считается включённой', () => {
    // Старый клиент (сайт до своей правки) не шлёт этот сигнал вовсе —
    // его видео должно показываться как раньше, без заглушки.
    expect(DEFAULT_REMOTE_MEDIA).toEqual({ video: true });
  });
});

describe('shouldAnnounceMedia', () => {
  it('первое состояние в соединении отправляется всегда', () => {
    expect(shouldAnnounceMedia(null, true)).toBe(true);
    expect(shouldAnnounceMedia(null, false)).toBe(true);
  });

  it('изменение отправляется, повтор того же — нет', () => {
    expect(shouldAnnounceMedia(true, false)).toBe(true);
    expect(shouldAnnounceMedia(false, true)).toBe(true);
    expect(shouldAnnounceMedia(true, true)).toBe(false);
    expect(shouldAnnounceMedia(false, false)).toBe(false);
  });
});

describe('reconnectRestored', () => {
  it('связь вернулась — состояние камеры сообщаем заново', () => {
    expect(reconnectRestored(true, false)).toBe(true);
  });

  it('связь пропала или ничего не менялось — не сообщаем', () => {
    expect(reconnectRestored(false, true)).toBe(false);
    expect(reconnectRestored(true, true)).toBe(false);
    expect(reconnectRestored(false, false)).toBe(false);
  });
});
