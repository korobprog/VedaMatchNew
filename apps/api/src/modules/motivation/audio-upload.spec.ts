import {
  audioExtension,
  audioKey,
  audioMessage,
  MAX_AUDIO_BYTES,
  titleFromFilename,
  validateAudio,
  type UploadedAudio,
} from './audio-upload';

function file(over: Partial<UploadedAudio> = {}): UploadedAudio {
  return {
    buffer: Buffer.from('звук'),
    mimetype: 'audio/mpeg',
    size: 1024,
    originalname: 'flute.mp3',
    ...over,
  };
}

describe('validateAudio', () => {
  it('пропускает mp3, m4a и ogg', () => {
    for (const mimetype of ['audio/mpeg', 'audio/mp4', 'audio/ogg'])
      expect(validateAudio(file({ mimetype }))).toBeNull();
  });

  it('без файла — «файл не выбран», а не падение', () => {
    expect(validateAudio(undefined)).toBe('audio_missing');
    expect(validateAudio(file({ buffer: Buffer.alloc(0) }))).toBe(
      'audio_missing',
    );
  });

  it('чужой тип отбивает: видео и картинку фоном не поставишь', () => {
    expect(validateAudio(file({ mimetype: 'video/mp4' }))).toBe('audio_type');
    expect(validateAudio(file({ mimetype: 'image/png' }))).toBe('audio_type');
  });

  it('слишком большой файл отбивает по размеру', () => {
    expect(validateAudio(file({ size: MAX_AUDIO_BYTES + 1 }))).toBe(
      'audio_too_big',
    );
    expect(validateAudio(file({ size: MAX_AUDIO_BYTES }))).toBeNull();
  });

  it('объясняет отказ словами, а не кодом', () => {
    expect(audioMessage('audio_type')).toContain('mp3');
    expect(audioMessage('audio_too_big')).toContain('20 МБ');
  });
});

describe('audioKey', () => {
  it('расширение берёт из типа, а не из имени файла', () => {
    // Имя приходит от человека и врёт: «песня.mp3» может оказаться ogg.
    expect(audioExtension('audio/ogg')).toBe('ogg');
    expect(audioKey('a1', 'audio/ogg', 1700000000000)).toBe(
      'motivation/audio/a1-1700000000000.ogg',
    );
  });

  it('в ключе есть время: повторная заливка не затирает прежнюю', () => {
    expect(audioKey('a1', 'audio/mpeg', 1)).not.toBe(
      audioKey('a1', 'audio/mpeg', 2),
    );
  });
});

describe('titleFromFilename', () => {
  it('снимает расширение и разделители', () => {
    expect(titleFromFilename('vedic_flute-01.mp3')).toBe('vedic flute 01');
  });

  it('без имени возвращает понятную заглушку', () => {
    expect(titleFromFilename(undefined)).toBe('Без названия');
    expect(titleFromFilename('.mp3')).toBe('Без названия');
  });
});
