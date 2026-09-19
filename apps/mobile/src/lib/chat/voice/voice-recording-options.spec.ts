import {
  VOICE_RECORDING_OPTIONS,
  VOICE_UPLOAD_FILE_NAME,
  VOICE_UPLOAD_MIME_TYPE,
} from './voice-recording-options';

/**
 * Замок на решение о формате (см. обоснование в самом файле): случайная
 * правка на webm/Opus без обновления сервера/аплоада сломала бы отправку
 * тихо — тест должен упасть первым.
 */
describe('VOICE_RECORDING_OPTIONS', () => {
  it('пишет AAC-моно в .m4a', () => {
    expect(VOICE_RECORDING_OPTIONS.extension).toBe('.m4a');
    expect(VOICE_RECORDING_OPTIONS.numberOfChannels).toBe(1);
    expect(VOICE_RECORDING_OPTIONS.android?.audioEncoder).toBe('aac');
    expect(VOICE_RECORDING_OPTIONS.android?.outputFormat).toBe('mpeg4');
    expect(VOICE_RECORDING_OPTIONS.isMeteringEnabled).toBe(true);
  });
});

describe('загрузка файла', () => {
  it('имя оканчивается на .m4a — сервер берёт расширение из имени', () => {
    expect(VOICE_UPLOAD_FILE_NAME.endsWith('.m4a')).toBe(true);
  });

  it('MIME из разрешённого на сервере списка голосовых', () => {
    expect(VOICE_UPLOAD_MIME_TYPE).toBe('audio/mp4');
  });
});
