/**
 * Машина состояний записи голосового — кнопка микрофона в композере.
 * Вынесена из компонента, чтобы переходы («нельзя остановить то, что не
 * записывается», «входящий звонок обрывает запись без отправки») были
 * проверены без `expo-audio` и таймеров.
 */
export type VoiceRecorderPhase = 'idle' | 'recording' | 'uploading' | 'error';

export interface VoiceRecorderState {
  phase: VoiceRecorderPhase;
  elapsedSec: number;
  error: string | null;
}

export const INITIAL_VOICE_RECORDER_STATE: VoiceRecorderState = {
  phase: 'idle',
  elapsedSec: 0,
  error: null,
};

export type VoiceRecorderAction =
  | { type: 'start' }
  | { type: 'tick'; elapsedSec: number }
  | { type: 'cancel' }
  | { type: 'stop' }
  | { type: 'sent' }
  | { type: 'failed'; message: string }
  /**
   * Отдельно от `failed`: та ветка — провал ЗАГРУЗКИ уже записанного файла
   * (переход только из `uploading`). Эта — провал САМОГО СТАРТА записи
   * (переход только из `idle`) — раньше `voice-recorder-control.tsx`
   * ошибочно слал сюда же `failed`, из-за чего защитный `if (state.phase
   * === 'uploading')` молча отбрасывал переход и состояние оставалось
   * "idle" даже если нативный рекордер к этому моменту уже реально начал
   * писать (живая проверка сборки 5004: панель записи не появлялась
   * НИКОГДА, при этом `MediaRecorderJNI: start` в логе — запись шла
   * невидимо, пока повторный тап не останавливал и не отправлял её).
   */
  | { type: 'startFailed'; message: string }
  | { type: 'dismiss' }
  /** Входящий звонок или потеря разрешения на середине записи. */
  | { type: 'interrupt' };

export function reduceVoiceRecorder(
  state: VoiceRecorderState,
  action: VoiceRecorderAction,
): VoiceRecorderState {
  switch (action.type) {
    case 'start':
      return state.phase === 'idle' || state.phase === 'error'
        ? { phase: 'recording', elapsedSec: 0, error: null }
        : state;
    case 'tick':
      return state.phase === 'recording' ? { ...state, elapsedSec: action.elapsedSec } : state;
    case 'cancel':
      return state.phase === 'recording' ? INITIAL_VOICE_RECORDER_STATE : state;
    case 'stop':
      return state.phase === 'recording' ? { ...state, phase: 'uploading' } : state;
    case 'sent':
      return state.phase === 'uploading' ? INITIAL_VOICE_RECORDER_STATE : state;
    case 'failed':
      return state.phase === 'uploading'
        ? { phase: 'error', elapsedSec: 0, error: action.message }
        : state;
    case 'startFailed':
      return state.phase === 'idle' ? { phase: 'error', elapsedSec: 0, error: action.message } : state;
    case 'dismiss':
      return state.phase === 'error' ? INITIAL_VOICE_RECORDER_STATE : state;
    case 'interrupt':
      return state.phase === 'recording' || state.phase === 'uploading'
        ? INITIAL_VOICE_RECORDER_STATE
        : state;
    default:
      return state;
  }
}

/**
 * Потолок записи одним файлом. Явного лимита на длительность нет ни на
 * сайте, ни на сервере — есть только предел размера файла голосового
 * (`MAX_VOICE_BYTES`, 15 МБ, `apps/api/src/modules/chat/chat-upload-rules.ts`).
 * AAC-моно 64 кбит/с (см. `voice-recording-options.ts`) даёт ~8 КБ/с, и 10
 * минут — это ~4,8 МБ, втрое меньше потолка с запасом на неточность
 * кодирования; более длинная запись — редкий случай, который лучше прервать
 * с понятным «отправлено», чем упереться в отказ сервера при отправке.
 */
export const VOICE_RECORD_MAX_SECONDS = 600;

export function shouldAutoStopRecording(elapsedSec: number, maxSec: number = VOICE_RECORD_MAX_SECONDS): boolean {
  return elapsedSec >= maxSec;
}
