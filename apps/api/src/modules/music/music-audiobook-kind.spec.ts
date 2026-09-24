import {
  parseAudiobookKind,
  readAudiobookKindField,
} from './music-audiobook-kind';

describe('parseAudiobookKind', () => {
  it('узнаёт оба раздела', () => {
    expect(parseAudiobookKind('lecture')).toBe('lecture');
    expect(parseAudiobookKind('audiobook')).toBe('audiobook');
  });

  it('без значения или с мусором — аудиокниги', () => {
    expect(parseAudiobookKind(undefined)).toBe('audiobook');
    expect(parseAudiobookKind('')).toBe('audiobook');
    expect(parseAudiobookKind('LECTURE')).toBe('audiobook');
    expect(parseAudiobookKind(['lecture'])).toBe('audiobook');
  });
});

describe('readAudiobookKindField', () => {
  it('undefined — поле не трогают', () => {
    expect(readAudiobookKindField(undefined)).toBeUndefined();
  });

  it('допустимое значение проходит', () => {
    expect(readAudiobookKindField('lecture')).toBe('lecture');
  });

  it('недопустимое — null, чтобы сервис отказал', () => {
    expect(readAudiobookKindField('podcast')).toBeNull();
    expect(readAudiobookKindField(null)).toBeNull();
  });
});
