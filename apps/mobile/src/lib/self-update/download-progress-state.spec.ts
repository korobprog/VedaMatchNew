import {
  FILE_CORRUPTED_MESSAGE,
  IDLE_DOWNLOAD_STATE,
  reduceDownloadState,
  type DownloadState,
} from './download-progress-state';

describe('reduceDownloadState — полный happy path', () => {
  it('idle → confirm-metered → downloading → progress → verifying → ready → installing', () => {
    let state = reduceDownloadState(IDLE_DOWNLOAD_STATE, { type: 'start' });
    expect(state.phase).toBe('confirm-metered');

    state = reduceDownloadState(state, { type: 'network-metered-confirmed' });
    expect(state.phase).toBe('downloading');
    expect(state.bytesWritten).toBe(0);

    state = reduceDownloadState(state, { type: 'progress', bytesWritten: 20, totalBytes: 100 });
    expect(state.phase).toBe('downloading');
    expect(state.bytesWritten).toBe(20);
    expect(state.totalBytes).toBe(100);

    state = reduceDownloadState(state, { type: 'progress', bytesWritten: 100, totalBytes: 100 });
    expect(state.bytesWritten).toBe(100);

    state = reduceDownloadState(state, { type: 'download-complete', localUri: 'file:///cache/vedamatch.apk' });
    expect(state.phase).toBe('verifying');
    expect(state.localUri).toBe('file:///cache/vedamatch.apk');

    state = reduceDownloadState(state, { type: 'hash-verified' });
    expect(state.phase).toBe('ready');
    expect(state.localUri).toBe('file:///cache/vedamatch.apk');

    state = reduceDownloadState(state, { type: 'install-started' });
    expect(state.phase).toBe('installing');
  });
});

describe('reduceDownloadState — Wi-Fi проходит confirm-metered мгновенно', () => {
  it('start сразу за network-metered-confirmed без промежуточного экрана диалога', () => {
    let state = reduceDownloadState(IDLE_DOWNLOAD_STATE, { type: 'start' });
    state = reduceDownloadState(state, { type: 'network-metered-confirmed' });
    expect(state.phase).toBe('downloading');
  });
});

describe('reduceDownloadState — отмена на каждом промежуточном состоянии', () => {
  const startedConfirm = () => reduceDownloadState(IDLE_DOWNLOAD_STATE, { type: 'start' });
  const downloading = () => reduceDownloadState(startedConfirm(), { type: 'network-metered-confirmed' });
  const verifying = () =>
    reduceDownloadState(downloading(), { type: 'download-complete', localUri: 'file:///cache/a.apk' });
  const ready = () => reduceDownloadState(verifying(), { type: 'hash-verified' });

  it('cancel в confirm-metered — cancelled', () => {
    expect(reduceDownloadState(startedConfirm(), { type: 'cancel' }).phase).toBe('cancelled');
  });

  it('cancel в downloading — cancelled, localUri сброшен', () => {
    const cancelled = reduceDownloadState(downloading(), { type: 'cancel' });
    expect(cancelled.phase).toBe('cancelled');
    expect(cancelled.localUri).toBeNull();
  });

  it('cancel в verifying — cancelled', () => {
    expect(reduceDownloadState(verifying(), { type: 'cancel' }).phase).toBe('cancelled');
  });

  it('cancel в ready — cancelled (файл готов, но человек передумал устанавливать)', () => {
    expect(reduceDownloadState(ready(), { type: 'cancel' }).phase).toBe('cancelled');
  });

  it('cancel в idle — no-op, состояние не меняется (даже ссылкой)', () => {
    expect(reduceDownloadState(IDLE_DOWNLOAD_STATE, { type: 'cancel' })).toBe(IDLE_DOWNLOAD_STATE);
  });

  it('cancel в installing — no-op: системный установщик уже открыт, отменить нельзя', () => {
    const installing = reduceDownloadState(ready(), { type: 'install-started' });
    expect(reduceDownloadState(installing, { type: 'cancel' })).toBe(installing);
  });

  it('cancel в cancelled — no-op, повторная отмена не ломает состояние', () => {
    const cancelled = reduceDownloadState(downloading(), { type: 'cancel' });
    expect(reduceDownloadState(cancelled, { type: 'cancel' })).toBe(cancelled);
  });
});

describe('reduceDownloadState — hash-mismatch', () => {
  it('возвращает в error, очищает localUri и ставит понятное русское сообщение', () => {
    let state = reduceDownloadState(IDLE_DOWNLOAD_STATE, { type: 'start' });
    state = reduceDownloadState(state, { type: 'network-metered-confirmed' });
    state = reduceDownloadState(state, { type: 'download-complete', localUri: 'file:///cache/bad.apk' });
    const afterMismatch = reduceDownloadState(state, { type: 'hash-mismatch' });

    expect(afterMismatch.phase).toBe('error');
    expect(afterMismatch.localUri).toBeNull();
    expect(afterMismatch.errorMessage).toBe(FILE_CORRUPTED_MESSAGE);
  });

  it('hash-mismatch вне verifying — no-op', () => {
    expect(reduceDownloadState(IDLE_DOWNLOAD_STATE, { type: 'hash-mismatch' })).toBe(IDLE_DOWNLOAD_STATE);
  });
});

describe('reduceDownloadState — защита от гонки: progress после cancel игнорируется', () => {
  it('cancelled + progress — состояние не меняется, включая ссылку на объект', () => {
    let state = reduceDownloadState(IDLE_DOWNLOAD_STATE, { type: 'start' });
    state = reduceDownloadState(state, { type: 'network-metered-confirmed' });
    state = reduceDownloadState(state, { type: 'progress', bytesWritten: 10, totalBytes: 100 });
    const cancelled = reduceDownloadState(state, { type: 'cancel' });

    const afterLateProgress = reduceDownloadState(cancelled, {
      type: 'progress',
      bytesWritten: 99,
      totalBytes: 100,
    });
    expect(afterLateProgress).toBe(cancelled);
  });

  it('progress в idle (закачка не начата) — тоже no-op', () => {
    const afterProgress = reduceDownloadState(IDLE_DOWNLOAD_STATE, {
      type: 'progress',
      bytesWritten: 1,
      totalBytes: 100,
    });
    expect(afterProgress).toBe(IDLE_DOWNLOAD_STATE);
  });
});

describe('reduceDownloadState — ошибка сети во время закачки', () => {
  it('downloading + error — error с сообщением, localUri пуст', () => {
    let state = reduceDownloadState(IDLE_DOWNLOAD_STATE, { type: 'start' });
    state = reduceDownloadState(state, { type: 'network-metered-confirmed' });
    const failed = reduceDownloadState(state, { type: 'error', message: 'Нет связи с сервером.' });
    expect(failed.phase).toBe('error');
    expect(failed.errorMessage).toBe('Нет связи с сервером.');
    expect(failed.localUri).toBeNull();
  });

  it('error после cancel не переоткрывает отменённую закачку', () => {
    let state = reduceDownloadState(IDLE_DOWNLOAD_STATE, { type: 'start' });
    const cancelled = reduceDownloadState(state, { type: 'cancel' });
    const afterLateError = reduceDownloadState(cancelled, { type: 'error', message: 'опоздавшая ошибка' });
    expect(afterLateError).toBe(cancelled);
  });
});

describe('reduceDownloadState — повторный тап «Скачать» не перезапускает активную закачку', () => {
  it('start во время downloading — no-op', () => {
    let state: DownloadState = reduceDownloadState(IDLE_DOWNLOAD_STATE, { type: 'start' });
    state = reduceDownloadState(state, { type: 'network-metered-confirmed' });
    expect(reduceDownloadState(state, { type: 'start' })).toBe(state);
  });

  it('start после error — можно начать заново (новый confirm-metered)', () => {
    let state = reduceDownloadState(IDLE_DOWNLOAD_STATE, { type: 'start' });
    state = reduceDownloadState(state, { type: 'network-metered-confirmed' });
    state = reduceDownloadState(state, { type: 'error', message: 'сбой' });
    const restarted = reduceDownloadState(state, { type: 'start' });
    expect(restarted.phase).toBe('confirm-metered');
    expect(restarted.errorMessage).toBeNull();
  });
});
