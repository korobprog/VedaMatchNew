import {
  EMPTY_SPEAKING_STATE,
  localAudioLevel,
  nextSpeakingState,
  remoteAudioLevel,
  speakingIds,
  SPEAKING_HOLD_MS,
} from './speaking-state';

describe('кто говорит', () => {
  it('громкий уровень поднимает подпись', () => {
    const state = nextSpeakingState(EMPTY_SPEAKING_STATE, { a: 0.2 }, 1000);
    expect(speakingIds(state)).toEqual(['a']);
  });

  it('шум комнаты подписи не поднимает', () => {
    const state = nextSpeakingState(EMPTY_SPEAKING_STATE, { a: 0.03 }, 1000);
    expect(speakingIds(state)).toEqual([]);
  });

  it('пауза в слове подпись не гасит — держим её', () => {
    let state = nextSpeakingState(EMPTY_SPEAKING_STATE, { a: 0.2 }, 1000);
    state = nextSpeakingState(state, { a: 0 }, 1000 + SPEAKING_HOLD_MS - 1);
    expect(speakingIds(state)).toEqual(['a']);
  });

  it('замолчал надолго — подпись гаснет', () => {
    let state = nextSpeakingState(EMPTY_SPEAKING_STATE, { a: 0.2 }, 1000);
    state = nextSpeakingState(state, { a: 0 }, 1000 + SPEAKING_HOLD_MS + 1);
    expect(speakingIds(state)).toEqual([]);
  });

  it('тихий, но не нулевой уровень продлевает удержание — мигания нет', () => {
    let state = nextSpeakingState(EMPTY_SPEAKING_STATE, { a: 0.2 }, 1000);
    for (let t = 1; t <= 10; t += 1)
      state = nextSpeakingState(state, { a: 0.03 }, 1000 + t * 500);
    expect(speakingIds(state)).toEqual(['a']);
  });

  it('выключенный микрофон не «говорит», даже если уровень пришёл', () => {
    let state = nextSpeakingState(EMPTY_SPEAKING_STATE, { a: 0.4 }, 1000);
    state = nextSpeakingState(state, { a: 0.4 }, 1200, new Set(['a']));
    expect(speakingIds(state)).toEqual([]);
  });

  it('исчезнувший из замера считается молчащим', () => {
    let state = nextSpeakingState(EMPTY_SPEAKING_STATE, { a: 0.2, b: 0.2 }, 1000);
    state = nextSpeakingState(state, { a: 0.2 }, 1000 + SPEAKING_HOLD_MS + 1);
    expect(speakingIds(state)).toEqual(['a']);
  });

  it('список говорящих стабилен по порядку', () => {
    const state = nextSpeakingState(EMPTY_SPEAKING_STATE, { c: 0.2, a: 0.2, b: 0.2 }, 1000);
    expect(speakingIds(state)).toEqual(['a', 'b', 'c']);
  });
});

describe('разбор статистики WebRTC', () => {
  it('берёт входящий звук собеседника', () => {
    expect(
      remoteAudioLevel([
        { type: 'inbound-rtp', kind: 'video', audioLevel: 0.9 },
        { type: 'inbound-rtp', kind: 'audio', audioLevel: 0.3 },
        { type: 'outbound-rtp', kind: 'audio', audioLevel: 0.8 },
      ]),
    ).toBe(0.3);
  });

  it('берёт уровень своего микрофона', () => {
    expect(
      localAudioLevel([
        { type: 'media-source', kind: 'audio', audioLevel: 0.44 },
        { type: 'inbound-rtp', kind: 'audio', audioLevel: 0.9 },
      ]),
    ).toBe(0.44);
  });

  it('пустой отчёт — ноль, а не падение', () => {
    expect(remoteAudioLevel([])).toBe(0);
    expect(localAudioLevel([{ type: 'media-source', kind: 'audio' }])).toBe(0);
  });
});
