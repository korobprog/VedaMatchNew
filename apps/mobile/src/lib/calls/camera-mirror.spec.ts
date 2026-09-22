import { nextCameraFacing, shouldMirrorVideo } from './camera-mirror';

describe('shouldMirrorVideo', () => {
  it('своё окошко с фронтальной камерой — зеркалим: человек привык к зеркалу', () => {
    expect(shouldMirrorVideo({ surface: 'local-preview', facing: 'user' })).toBe(true);
  });

  it('своё окошко с тыловой камерой — не зеркалим (VED-347)', () => {
    expect(shouldMirrorVideo({ surface: 'local-preview', facing: 'environment' })).toBe(false);
  });

  it('камера неизвестна — считаем фронтальной, с неё звонок и начинается', () => {
    expect(shouldMirrorVideo({ surface: 'local-preview', facing: null })).toBe(true);
  });

  it('картинку собеседника не зеркалим никогда, ни при какой камере', () => {
    for (const facing of ['user', 'environment', null] as const)
      expect(shouldMirrorVideo({ surface: 'remote', facing })).toBe(false);
  });
});

describe('nextCameraFacing', () => {
  it('переключение идёт по кругу фронтальная ↔ тыловая', () => {
    expect(nextCameraFacing('user')).toBe('environment');
    expect(nextCameraFacing('environment')).toBe('user');
  });
});
