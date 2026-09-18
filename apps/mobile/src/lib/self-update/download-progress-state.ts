/**
 * Стейт-машина закачки APK (VED-176) — чистый редьюсер, без единого
 * побочного эффекта: сама закачка (`apk-downloader.ts`), хеширование и
 * системный установщик (`apk-installer.ts`) живут снаружи и только
 * диспатчат события по её результатам.
 *
 * Состояния: `idle` (ничего не начато) → `confirm-metered` (после тапа
 * «Скачать», ждём подтверждения на не-Wi-Fi ИЛИ мгновенно проходим дальше на
 * Wi-Fi — эту развилку решает вызывающий хук через `metered-network-gate.ts`
 * и синхронно шлёт `network-metered-confirmed` следом за `start`, если сеть
 * не метрируется, — секция экрана просто не успевает отрисовать диалог) →
 * `downloading` (прогресс 0→100) → `verifying` (SHA-256) → `ready`
 * (совпало, ждём тапа «Установить») → `installing` (открыт системный
 * диалог) либо `error`/`cancelled` на любом шаге.
 */
export type DownloadPhase =
  | 'idle'
  | 'confirm-metered'
  | 'downloading'
  | 'verifying'
  | 'ready'
  | 'installing'
  | 'error'
  | 'cancelled';

export interface DownloadState {
  phase: DownloadPhase;
  bytesWritten: number;
  totalBytes: number;
  /** Путь к скачанному файлу — очищается на `hash-mismatch`, чтобы вызывающий
   *  код не мог по ошибке передать непроверенный файл в установщик. */
  localUri: string | null;
  errorMessage: string | null;
  /** Сколько байт файла уже прохешировано в фазе `verifying` («Проверяем файл… N %»). */
  bytesVerified: number;
}

export const IDLE_DOWNLOAD_STATE: DownloadState = {
  phase: 'idle',
  bytesWritten: 0,
  totalBytes: 0,
  localUri: null,
  errorMessage: null,
  bytesVerified: 0,
};

export type DownloadEvent =
  | { type: 'start' }
  | { type: 'network-metered-confirmed' }
  | { type: 'progress'; bytesWritten: number; totalBytes: number }
  | { type: 'download-complete'; localUri: string }
  | { type: 'verify-progress'; bytesVerified: number }
  | { type: 'hash-verified' }
  | { type: 'hash-mismatch' }
  | { type: 'install-started' }
  /** Системный установщик закрылся, а приложение живо — человек отказался или установка не удалась. */
  | { type: 'install-returned' }
  | { type: 'cancel' }
  | { type: 'error'; message: string }
  /** Новая ручная проверка: забыть закончившуюся ошибкой/отменённую попытку. */
  | { type: 'reset' };

export const FILE_CORRUPTED_MESSAGE = 'Файл повреждён при скачивании, попробуйте ещё раз';

const BUSY_PHASES: readonly DownloadPhase[] = ['downloading', 'verifying', 'installing'];
/**
 * Фазы, в которых идёт работа или лежит проверенный файл, — новая проверка
 * обновления их не сбрасывает (и строка «Проверить обновление» в это время
 * не запускает её вовсе).
 */
export const ACTIVE_PHASES: readonly DownloadPhase[] = ['confirm-metered', 'downloading', 'verifying', 'ready', 'installing'];

export function isDownloadActive(phase: DownloadPhase): boolean {
  return ACTIVE_PHASES.includes(phase);
}

const NON_CANCELLABLE_PHASES: readonly DownloadPhase[] = ['idle', 'cancelled', 'error', 'installing'];

export function reduceDownloadState(state: DownloadState, event: DownloadEvent): DownloadState {
  switch (event.type) {
    case 'start':
      // Повторный тап «Скачать», пока закачка/проверка/установка уже идёт —
      // игнорируем, а не перезапускаем поверх текущей.
      if (BUSY_PHASES.includes(state.phase)) return state;
      return { ...IDLE_DOWNLOAD_STATE, phase: 'confirm-metered' };

    case 'network-metered-confirmed':
      if (state.phase !== 'confirm-metered') return state;
      return { ...state, phase: 'downloading', bytesWritten: 0, totalBytes: 0 };

    case 'progress':
      // Защита от гонки: асинхронная закачка могла прислать последний
      // прогресс уже после отмены/ошибки — событие тихо игнорируется, само
      // состояние (включая ссылку на объект) не меняется.
      if (state.phase !== 'downloading') return state;
      return { ...state, bytesWritten: event.bytesWritten, totalBytes: event.totalBytes };

    case 'download-complete':
      if (state.phase !== 'downloading') return state;
      return { ...state, phase: 'verifying', localUri: event.localUri, bytesVerified: 0 };

    case 'verify-progress':
      // Хеширование идёт кусками с паузами (`chunked-hash.ts`) — после отмены
      // последний кусок ещё может отчитаться; такой прогресс игнорируется.
      if (state.phase !== 'verifying') return state;
      return { ...state, bytesVerified: event.bytesVerified };

    case 'hash-verified':
      if (state.phase !== 'verifying') return state;
      return { ...state, phase: 'ready' };

    case 'hash-mismatch':
      if (state.phase !== 'verifying') return state;
      // localUri очищается: вызывающий код не должен получить возможность
      // передать непроверенный файл системному установщику.
      return { ...state, phase: 'error', localUri: null, errorMessage: FILE_CORRUPTED_MESSAGE };

    case 'install-started':
      if (state.phase !== 'ready') return state;
      return { ...state, phase: 'installing' };

    case 'install-returned':
      // Успешная установка перезапускает процесс, и это событие не приходит.
      // Пришло — значит установщик закрыли без установки: возвращаем кнопку
      // «Установить», файл уже проверен, повторно качать не нужно.
      if (state.phase !== 'installing') return state;
      return { ...state, phase: 'ready' };

    case 'cancel':
      if (NON_CANCELLABLE_PHASES.includes(state.phase)) return state;
      return { ...IDLE_DOWNLOAD_STATE, phase: 'cancelled' };

    case 'error':
      // Отменённую закачку не переводим в ошибку — «Отмена» уже финальна.
      if (state.phase === 'cancelled') return state;
      return { ...state, phase: 'error', errorMessage: event.message, localUri: null };

    case 'reset':
      if (isDownloadActive(state.phase) || state === IDLE_DOWNLOAD_STATE) return state;
      return IDLE_DOWNLOAD_STATE;

    default:
      return state;
  }
}
