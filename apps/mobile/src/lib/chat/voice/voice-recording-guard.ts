/**
 * Взаимное исключение записи и воспроизведения голосовых (живая проверка
 * сборки 5004, Samsung A51): пока идёт запись, микрофон устройства занят
 * `MediaRecorder`, и попытка тут же запустить `AudioPlayer` для чужого или
 * своего голосового в ленте либо тихо проваливается, либо конфликтует на
 * уровне аудиосессии — человек видит ровно жалобу «записал голосовую, но
 * не воспроизводится» (или наоборот).
 *
 * Правило простое и одностороннее:
 * - Старт записи (`voice-recorder-control.tsx: start()`) явно останавливает
 *   активное воспроизведение через `stopActiveVoicePlayback`
 *   (`voice-playback-registry.ts`) — так же, как это уже делает входящий
 *   звонок.
 * - Старт воспроизведения (`voice-message-player.tsx: play()`/`seek()`)
 *   проверяет этот модуль и, пока запись активна, отказывается стартовать
 *   вообще, а не пытается сама остановить чужой рекордер — тап по чужому
 *   голосовому не должен обрывать то, что человек сейчас надиктовывает.
 *
 * Модуль-синглтон, не React-контекст — по той же причине, что
 * `voice-playback-registry.ts`: `VoiceRecorderControl` и `VoiceMessagePlayer`
 * не имеют общего родителя ближе экрана целиком, а плееров на экране может
 * быть много одновременно (лента голосовых).
 */
let recordingActive = false;

/** Вызывает `VoiceRecorderControl` при каждом реальном старте/останове записи. */
export function setRecordingActive(active: boolean): void {
  recordingActive = active;
}

/** Вызывает `VoiceMessagePlayer` перед стартом воспроизведения. */
export function isRecordingActive(): boolean {
  return recordingActive;
}

/** Только для тестов — синглтон переживает между ними. */
export function resetVoiceRecordingGuardForTests(): void {
  recordingActive = false;
}
