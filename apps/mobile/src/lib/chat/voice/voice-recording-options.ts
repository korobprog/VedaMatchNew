import type { RecordingOptions } from 'expo-audio';

/**
 * Значения `IOSOutputFormat.MPEG4AAC` и `AudioQuality.MEDIUM`
 * (`node_modules/expo-audio/src/RecordingConstants.ts`) вписаны буквально,
 * а не импортированы: сам пакет `expo-audio` дальше по цепочке требует
 * нативный модуль уже при импорте (`ExpoAudio.ts` читает
 * `NativeAudioModule.AudioPlayer.prototype`), которого нет под Jest
 * (`jest-expo` не подключает `expo-modules-core`'s мок для него) — этот
 * файл нарочно тянет только тип (`import type`, стирается компилятором) и
 * поэтому проверяется тестом, как обычная чистая логика.
 */
const IOS_OUTPUT_FORMAT_MPEG4AAC = 'aac ';
const AUDIO_QUALITY_MEDIUM = 0x40;

/**
 * Формат записи голосового — AAC в контейнере `.m4a` (MIME `audio/mp4`),
 * а не `.webm/Opus`, как пишет браузер на сайте:
 *
 * - Сервер уже принимает `audio/mp4` наравне с `audio/webm`
 *   (`apps/api/src/modules/chat/chat-upload-rules.ts: ALLOWED_VOICE_MIME`,
 *   правка не понадобилась) — расширение файла на S3 подставляется из имени
 *   (`voice.m4a`, `chat-uploads.service.ts: extensionFor`), значит и
 *   `Content-Type` в бакете будет верным.
 * - `expo-audio` на Android поддерживает запись `.webm/Opus` только через
 *   отдельный `AndroidOutputFormat: 'webm'` — экспериментальный путь
 *   Media3, не входящий в `RecordingPresets` библиотеки; `.m4a/aac` — путь
 *   `MediaRecorder` с `MPEG_4`/`AAC`, тот же, что использует стандартный
 *   Android-рекордер голосовых много лет, и он же в примерах и пресетах
 *   самой `expo-audio` (`RecordingPresets.HIGH_QUALITY`).
 * - Воспроизведение чужого `.webm/Opus` с сайта работает и без записи в
 *   этом формате на телефоне: плеер (`voice-message-player.tsx`) отдаёт URL
 *   в `expo-audio`, а на Android под капотом `ExoPlayer` (Media3) —
 *   контейнер WebM с кодеком Opus у него в списке поддерживаемых из
 *   коробки (расширяемый `DefaultExtractorsFactory` включает
 *   `MatroskaExtractor`, который читает и WebM, декодер Opus —
 *   `MediaCodec`-реализация есть на всех Android start с 5.0). Разбирать и
 *   переигрывать самим не нужно.
 *
 * Один канал вместо стерео (пресеты сайта дают стерео) — голос не выигрывает
 * от второго канала, а файл легче вдвое; 64 кбит/с — привычное качество
 * голосовых сообщений (WhatsApp/Telegram используют Opus на близких битрейтах).
 */
export const VOICE_RECORDING_OPTIONS: RecordingOptions = {
  extension: '.m4a',
  sampleRate: 44100,
  numberOfChannels: 1,
  bitRate: 64000,
  isMeteringEnabled: true,
  android: {
    outputFormat: 'mpeg4',
    audioEncoder: 'aac',
  },
  ios: {
    outputFormat: IOS_OUTPUT_FORMAT_MPEG4AAC,
    audioQuality: AUDIO_QUALITY_MEDIUM,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: 'audio/webm',
    bitsPerSecond: 64000,
  },
};

/** Имя и MIME файла для отправки — `chat-upload-rules.ts` распознаёт по MIME, расширение сервер берёт из имени. */
export const VOICE_UPLOAD_FILE_NAME = 'voice.m4a';
export const VOICE_UPLOAD_MIME_TYPE = 'audio/mp4';
