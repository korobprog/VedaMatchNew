import { buildStamp, buildStampLabel } from './build-stamp';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { build: { builtAt: '2026-09-18T03:45', commit: {} } } } },
}));

const now = new Date('2026-09-18T12:00:00');

describe('buildStampLabel', () => {
  it('дата и коммит', () => {
    expect(buildStampLabel({ builtAt: '2026-09-18T03:45', commit: 'a1b2c3d' }, now)).toBe(
      'сборка 18.09 03:45 · a1b2c3d',
    );
  });

  it('без коммита — только дата', () => {
    expect(buildStampLabel({ builtAt: '2026-09-18T03:45', commit: null }, now)).toBe('сборка 18.09 03:45');
  });

  it('нет метки, мусор или дата из будущего — пусто', () => {
    expect(buildStampLabel({ builtAt: null, commit: 'a1b2c3d' }, now)).toBe('');
    expect(buildStampLabel({ builtAt: 'не дата', commit: null }, now)).toBe('');
    expect(buildStampLabel({ builtAt: '2030-01-01T00:00', commit: null }, now)).toBe('');
  });
});

describe('buildStamp', () => {
  // Expo сериализует `null` в пустой объект — из конфига могут прийти не строки.
  it('берёт только строки, пустой объект вместо коммита игнорирует', () => {
    expect(buildStamp()).toEqual({ builtAt: '2026-09-18T03:45', commit: null });
  });
});
