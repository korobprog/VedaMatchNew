import { announceAudioStart, onYield } from '@/lib/audio/audio-arbiter';
import {
  getActiveVoicePlaybackId,
  isVoiceHeard,
  markVoiceFinished,
  registerVoiceOrder,
  releaseVoicePlayback,
  requestVoicePlayback,
  resetVoicePlaybackOrderForTests,
  stopActiveVoicePlayback,
} from './voice-playback-registry';

afterEach(() => {
  // Синглтон переживает между тестами — гасим вручную, чтобы не подтекало.
  stopActiveVoicePlayback();
  resetVoicePlaybackOrderForTests();
});

describe('requestVoicePlayback', () => {
  it('второй плеер останавливает первый', () => {
    const stopA = jest.fn();
    const stopB = jest.fn();
    requestVoicePlayback('a', stopA);
    expect(getActiveVoicePlaybackId()).toBe('a');
    requestVoicePlayback('b', stopB);
    expect(stopA).toHaveBeenCalledTimes(1);
    expect(stopB).not.toHaveBeenCalled();
    expect(getActiveVoicePlaybackId()).toBe('b');
  });

  it('повторный запрос тем же id никого не останавливает', () => {
    const stop = jest.fn();
    requestVoicePlayback('a', stop);
    requestVoicePlayback('a', stop);
    expect(stop).not.toHaveBeenCalled();
  });
});

describe('releaseVoicePlayback', () => {
  it('снимает только собственную активность', () => {
    const stopA = jest.fn();
    requestVoicePlayback('a', stopA);
    releaseVoicePlayback('b');
    expect(getActiveVoicePlaybackId()).toBe('a');
    releaseVoicePlayback('a');
    expect(getActiveVoicePlaybackId()).toBeNull();
  });
});

describe('stopActiveVoicePlayback', () => {
  it('останавливает текущий плеер и сбрасывает регистр', () => {
    const stop = jest.fn();
    requestVoicePlayback('a', stop);
    stopActiveVoicePlayback();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(getActiveVoicePlaybackId()).toBeNull();
  });

  it('без активного плеера — no-op', () => {
    expect(() => stopActiveVoicePlayback()).not.toThrow();
  });
});

describe('markVoiceFinished + registerVoiceOrder — автопереход (VED-289)', () => {
  it('доиграло первое — запускает следующее смонтированное', () => {
    const playB = jest.fn();
    registerVoiceOrder('a', 1, jest.fn());
    registerVoiceOrder('b', 2, playB);
    markVoiceFinished('a');
    expect(playB).toHaveBeenCalledTimes(1);
    expect(isVoiceHeard('a')).toBe(true);
  });

  it('доиграло последнее — тишина, никого не запускает', () => {
    const playA = jest.fn();
    registerVoiceOrder('a', 1, playA);
    markVoiceFinished('a');
    expect(playA).not.toHaveBeenCalled();
  });

  it('уже прослушанное соседями пропускается, назад список не идёт', () => {
    const playA = jest.fn();
    const playC = jest.fn();
    registerVoiceOrder('a', 1, playA);
    registerVoiceOrder('b', 2, jest.fn());
    markVoiceFinished('b'); // «b» помечено прослушанным раньше — кандидатов после него пока нет
    registerVoiceOrder('c', 3, playC);
    markVoiceFinished('a'); // доиграло «a» — кандидат «b» пропускается как прослушанный, берётся «c»
    expect(playC).toHaveBeenCalledTimes(1);
    expect(playA).not.toHaveBeenCalled();
  });

  it('отписка при размонтировании убирает из реестра — автопереход его больше не находит', () => {
    const playB = jest.fn();
    registerVoiceOrder('a', 1, jest.fn());
    const unregister = registerVoiceOrder('b', 2, playB);
    unregister();
    markVoiceFinished('a');
    expect(playB).not.toHaveBeenCalled();
  });

  it('resetVoicePlaybackOrderForTests чистит heard-список между тестами', () => {
    registerVoiceOrder('a', 1, jest.fn());
    markVoiceFinished('a');
    expect(isVoiceHeard('a')).toBe(true);
    resetVoicePlaybackOrderForTests();
    expect(isVoiceHeard('a')).toBe(false);
  });
});

describe('договорённость с Медиатекой (VED-331)', () => {
  it('голосовое, начавшее играть, просит Медиатеку замолчать', () => {
    const media = jest.fn();
    const off = onYield('media', media);
    requestVoicePlayback('v-media-1', jest.fn());
    expect(media).toHaveBeenCalledWith('voice');
    off();
    releaseVoicePlayback('v-media-1');
  });

  it('включили Медиатеку — играющее голосовое останавливается', () => {
    const stop = jest.fn();
    requestVoicePlayback('v-media-2', stop);
    announceAudioStart('media');
    expect(stop).toHaveBeenCalledTimes(1);
    expect(getActiveVoicePlaybackId()).toBeNull();
  });
});
