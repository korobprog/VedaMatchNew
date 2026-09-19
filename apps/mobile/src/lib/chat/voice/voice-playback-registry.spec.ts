import {
  getActiveVoicePlaybackId,
  releaseVoicePlayback,
  requestVoicePlayback,
  stopActiveVoicePlayback,
} from './voice-playback-registry';

afterEach(() => {
  // Синглтон переживает между тестами — гасим вручную, чтобы не подтекало.
  stopActiveVoicePlayback();
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
