import { setAudioModeAsync, type AudioMode } from 'expo-audio';

/**
 * Полный набор полей режима, пригодного для воспроизведения — НЕ частичный
 * объект вроде `{ allowsRecording: false }`, каким раньше ограничивался
 * `restoreAudioMode()` в `voice-recorder-control.tsx`.
 *
 * Настоящий дефект, найденный чтением исходников `expo-audio` (Android) и
 * `expo-modules-core` (не гаданием): `setAudioModeAsync` строит `AudioMode`
 * через `RecordTypeConverter` (`expo-modules-core/.../records/
 * RecordTypeConverter.kt`), а тот сперва аллоцирует объект «пустым
 * конструктором» (`getObjectConstructor(kClass).construct()` — БЕЗ вызова
 * тела Kotlin-конструктора), а потом заполняет только те поля, что реально
 * пришли из JS; отсутствующий в присланном объекте ключ просто пропускается
 * (`return@forEach`). Для полей, чей Kotlin-дефолт совпадает с нулевым
 * значением JVM, разницы нет — но `playsInSilentMode` в Android-версии
 * `AudioMode` объявлен как `= true` (`expo-audio/android/.../
 * AudioRecords.kt`), а раз тело конструктора с этим значением никогда не
 * выполняется, при отсутствии ключа в JS поле остаётся ГОЛЫМ ДЕФОЛТОМ JVM
 * ДЛЯ BOOLEAN — то есть `false`, а не документированным `true`.
 *
 * `playsInSilentMode` — поле МОДУЛЯ `AudioModule.kt`, ГЛОБАЛЬНОЕ для всего
 * процесса (`private var playsInSilentMode`), общее для всех плееров и
 * рекордеров разом, не привязанное к конкретному инстансу. Значение
 * читается заново при каждом вызове `Function("play")`
 * (`shouldPlayInSilentMode() = playsInSilentMode || ringerMode == NORMAL`),
 * и при `false` этот вызов молча возвращается (`return@Function`, БЕЗ
 * единого лога) на устройстве в тихом/вибро-режиме — сброшенное поле после
 * записи (`{allowsRecording:false}` — единственное поле, и то не
 * существующее в Android-версии `AudioMode` вовсе, см. `AudioRecords.kt`:
 * `allowsRecording` там нет, это iOS-only) блокировало воспроизведение ЛЮБОГО
 * голосового в приложении до перезапуска процесса, который возвращает
 * Kotlin-дефолт `true`, потому что поле инициализируется при создании
 * самого класса `AudioModule`, а не через `Record`-конвертацию.
 */
export const PLAYBACK_AUDIO_MODE: Partial<AudioMode> = {
  allowsRecording: false,
  playsInSilentMode: true,
  shouldRouteThroughEarpiece: false,
  interruptionMode: 'mixWithOthers',
};

/**
 * Плеер (`voice-message-player.tsx`) вызывает сам, перед стартом
 * воспроизведения — не полагаясь на то, что рекордер (`voice-recorder-
 * control.tsx: restoreAudioMode()`) успел и не забыл вернуть режим в
 * пригодное для игры состояние. Обе стороны используют один и тот же
 * набор полей намеренно: несогласованный частичный объект с любой стороны
 * воспроизвёл бы тот же дефект снова.
 */
export async function ensurePlaybackAudioMode(): Promise<void> {
  try {
    await setAudioModeAsync(PLAYBACK_AUDIO_MODE);
  } catch {
    // Не мешаем самому воспроизведению — `player.play()` всё равно попробует,
    // а провал переключения режима не должен блокировать тап целиком.
  }
}
