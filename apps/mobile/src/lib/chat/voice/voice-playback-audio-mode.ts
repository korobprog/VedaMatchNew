import type { AudioMode } from 'expo-audio';
import { APP_PLAYBACK_AUDIO_MODE, ensurePlaybackAudioMode as ensureAppPlaybackAudioMode } from '@/lib/audio/app-audio-mode';

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
 *
 * С Медиатекой (VED-331) режим стал общим на всё приложение и переехал в
 * `lib/audio/app-audio-mode.ts`: голосовые теперь берут аудиофокус
 * (`doNotMix` вместо `mixWithOthers`) и не выключают фон — иначе первое же
 * голосовое глушило бы Медиатеку при сворачивании. Здесь остались прежние
 * имена, чтобы плеер и рекордер голосовых не менялись.
 */
export const PLAYBACK_AUDIO_MODE: AudioMode = APP_PLAYBACK_AUDIO_MODE;

/**
 * Плеер (`voice-message-player.tsx`) вызывает сам, перед стартом
 * воспроизведения — не полагаясь на то, что рекордер (`voice-recorder-
 * control.tsx: restoreAudioMode()`) успел и не забыл вернуть режим в
 * пригодное для игры состояние.
 */
export async function ensurePlaybackAudioMode(): Promise<void> {
  await ensureAppPlaybackAudioMode();
}
