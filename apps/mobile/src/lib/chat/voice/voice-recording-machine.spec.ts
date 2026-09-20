import {
  INITIAL_VOICE_RECORDER_STATE,
  reduceVoiceRecorder,
  shouldAutoStopRecording,
  VOICE_RECORD_MAX_SECONDS,
} from './voice-recording-machine';

describe('reduceVoiceRecorder', () => {
  it('idle → recording → uploading → idle (успешная отправка)', () => {
    let state = INITIAL_VOICE_RECORDER_STATE;
    state = reduceVoiceRecorder(state, { type: 'start' });
    expect(state.phase).toBe('recording');
    state = reduceVoiceRecorder(state, { type: 'tick', elapsedSec: 3 });
    expect(state.elapsedSec).toBe(3);
    state = reduceVoiceRecorder(state, { type: 'stop' });
    expect(state.phase).toBe('uploading');
    state = reduceVoiceRecorder(state, { type: 'sent' });
    expect(state).toEqual(INITIAL_VOICE_RECORDER_STATE);
  });

  it('отмена во время записи возвращает в idle без отправки', () => {
    const recording = reduceVoiceRecorder(INITIAL_VOICE_RECORDER_STATE, { type: 'start' });
    expect(reduceVoiceRecorder(recording, { type: 'cancel' })).toEqual(INITIAL_VOICE_RECORDER_STATE);
  });

  it('неудачная загрузка — ошибка, дальше можно закрыть её и начать заново', () => {
    let state = reduceVoiceRecorder(INITIAL_VOICE_RECORDER_STATE, { type: 'start' });
    state = reduceVoiceRecorder(state, { type: 'stop' });
    state = reduceVoiceRecorder(state, { type: 'failed', message: 'Голосовое не отправилось' });
    expect(state).toEqual({ phase: 'error', elapsedSec: 0, error: 'Голосовое не отправилось' });
    state = reduceVoiceRecorder(state, { type: 'dismiss' });
    expect(state).toEqual(INITIAL_VOICE_RECORDER_STATE);
    state = reduceVoiceRecorder(state, { type: 'start' });
    expect(state.phase).toBe('recording');
  });

  it('входящий звонок обрывает запись и загрузку без отправки', () => {
    const recording = reduceVoiceRecorder(INITIAL_VOICE_RECORDER_STATE, { type: 'start' });
    expect(reduceVoiceRecorder(recording, { type: 'interrupt' })).toEqual(INITIAL_VOICE_RECORDER_STATE);

    const uploading = reduceVoiceRecorder(recording, { type: 'stop' });
    expect(reduceVoiceRecorder(uploading, { type: 'interrupt' })).toEqual(INITIAL_VOICE_RECORDER_STATE);
  });

  it('нельзя остановить то, что не записывается, и другие переходы вне фазы игнорируются', () => {
    expect(reduceVoiceRecorder(INITIAL_VOICE_RECORDER_STATE, { type: 'stop' })).toEqual(INITIAL_VOICE_RECORDER_STATE);
    expect(reduceVoiceRecorder(INITIAL_VOICE_RECORDER_STATE, { type: 'cancel' })).toEqual(INITIAL_VOICE_RECORDER_STATE);
    expect(reduceVoiceRecorder(INITIAL_VOICE_RECORDER_STATE, { type: 'tick', elapsedSec: 5 })).toEqual(
      INITIAL_VOICE_RECORDER_STATE,
    );
  });
});

describe('shouldAutoStopRecording', () => {
  it('срабатывает по достижении потолка по умолчанию', () => {
    expect(shouldAutoStopRecording(VOICE_RECORD_MAX_SECONDS - 1)).toBe(false);
    expect(shouldAutoStopRecording(VOICE_RECORD_MAX_SECONDS)).toBe(true);
  });

  it('принимает свой потолок', () => {
    expect(shouldAutoStopRecording(30, 30)).toBe(true);
    expect(shouldAutoStopRecording(29, 30)).toBe(false);
  });
});
