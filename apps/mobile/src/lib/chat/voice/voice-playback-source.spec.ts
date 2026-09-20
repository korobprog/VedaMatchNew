import { pickVoicePlaybackSource, resolveVoicePlaybackSource } from './voice-playback-source';

describe('pickVoicePlaybackSource', () => {
  it('локальный файл есть и существует — берём его, источник локальный', () => {
    expect(pickVoicePlaybackSource({ localUri: 'file:///v.m4a', localFileExists: true, remoteUrl: 'https://s/v.m4a' })).toEqual({
      source: 'file:///v.m4a',
      isLocal: true,
    });
  });

  it('локальный файл числится в реестре, но физически пропал — падаем на сервер', () => {
    expect(pickVoicePlaybackSource({ localUri: 'file:///v.m4a', localFileExists: false, remoteUrl: 'https://s/v.m4a' })).toEqual({
      source: 'https://s/v.m4a',
      isLocal: false,
    });
  });

  it('локального нет вовсе — сервер (чужая запись или своя после перезапуска)', () => {
    expect(pickVoicePlaybackSource({ localUri: null, localFileExists: false, remoteUrl: 'https://s/v.m4a' })).toEqual({
      source: 'https://s/v.m4a',
      isLocal: false,
    });
  });

  it('ни локального, ни серверного — играть нечего', () => {
    expect(pickVoicePlaybackSource({ localUri: null, localFileExists: false, remoteUrl: null })).toEqual({ source: null, isLocal: false });
  });
});

describe('resolveVoicePlaybackSource', () => {
  it('спрашивает существование только когда есть локальный кандидат', async () => {
    const fileExists = jest.fn().mockResolvedValue(true);
    const result = await resolveVoicePlaybackSource(undefined, null, fileExists);
    expect(fileExists).not.toHaveBeenCalled();
    expect(result).toEqual({ source: null, isLocal: false });
  });

  it('файл существует — локальный источник', async () => {
    const fileExists = jest.fn().mockResolvedValue(true);
    const result = await resolveVoicePlaybackSource('https://s/v.m4a', 'file:///v.m4a', fileExists);
    expect(fileExists).toHaveBeenCalledWith('file:///v.m4a');
    expect(result).toEqual({ source: 'file:///v.m4a', isLocal: true });
  });

  it('проверка упала — не роняет плеер, падает на сервер', async () => {
    const fileExists = jest.fn().mockRejectedValue(new Error('boom'));
    const result = await resolveVoicePlaybackSource('https://s/v.m4a', 'file:///v.m4a', fileExists);
    expect(result).toEqual({ source: 'https://s/v.m4a', isLocal: false });
  });
});
