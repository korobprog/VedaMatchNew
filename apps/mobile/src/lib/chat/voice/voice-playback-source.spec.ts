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

  it('серверный адрес уходит в плеер БЕЗ обрезки подписи S3 (регресс с живой проверки — своё голосовое "0:04, вчера" вместо плеера показывало "Не получилось загрузить запись"): источник обязан остаться полной подписанной ссылкой, а не укороченным ключом реестра (`canonicalVoiceUrlKey`), иначе S3 ответит 403 там, где полная ссылка отвечает 200', () => {
    const signed = 'https://s3.example/chat/conv/file.m4a?X-Amz-Signature=abc&X-Amz-Expires=21600';
    const result = pickVoicePlaybackSource({ localUri: null, localFileExists: false, remoteUrl: signed });
    expect(result.source).toBe(signed);
    expect(result.source).not.toBe('https://s3.example/chat/conv/file.m4a');
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
