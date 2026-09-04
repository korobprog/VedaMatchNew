import { INGEST_MAX_ATTEMPTS } from './ingest-state';
import {
  mimeFromStorageKey,
  nextStateAfterFailure,
} from './ingest-process-rules';

describe('mimeFromStorageKey', () => {
  it('узнаёт оба принимаемых типа по расширению ключа', () => {
    expect(mimeFromStorageKey('music/portal/b1/x.mp3')).toBe('audio/mpeg');
    expect(mimeFromStorageKey('music/portal/b1/x.m4a')).toBe('audio/mp4');
    expect(mimeFromStorageKey('music/portal/b1/x.mp4')).toBe('audio/mp4');
  });

  it('не путается в регистре: ключ пришёл из чужого архива', () => {
    expect(mimeFromStorageKey('music/portal/b1/X.MP3')).toBe('audio/mpeg');
  });

  it('чужое расширение и ключ без него — не наш тип', () => {
    expect(mimeFromStorageKey('music/portal/b1/x.flac')).toBeNull();
    expect(mimeFromStorageKey('music/portal/b1/x')).toBeNull();
    expect(mimeFromStorageKey(null)).toBeNull();
  });

  it('точка в папке не считается расширением файла', () => {
    expect(mimeFromStorageKey('music/portal/b.1/x')).toBeNull();
  });
});

describe('nextStateAfterFailure', () => {
  it('первая неудача возвращает позицию в очередь', () => {
    expect(nextStateAfterFailure(1, 'Файл не найден')).toEqual({
      status: 'waiting',
      failureReason: 'Файл не найден',
    });
  });

  it('после последней попытки позиция признаётся упавшей', () => {
    expect(
      nextStateAfterFailure(INGEST_MAX_ATTEMPTS, 'Файл не найден'),
    ).toEqual({ status: 'failed', failureReason: 'Файл не найден' });
  });

  it('счётчик сверх предела тоже падение, а не новый круг', () => {
    // `attempts` растёт и при возврате зависших: считать надо «не меньше».
    expect(nextStateAfterFailure(INGEST_MAX_ATTEMPTS + 5, 'Обрыв').status).toBe(
      'failed',
    );
  });

  it('длинная причина обрезается: колонка в базе не резиновая', () => {
    const reason = 'я'.repeat(500);
    expect(nextStateAfterFailure(1, reason).failureReason).toHaveLength(200);
  });

  it('пустая причина не превращается в пустую строку в таблице', () => {
    expect(nextStateAfterFailure(1, '   ').failureReason).toBeNull();
  });
});
