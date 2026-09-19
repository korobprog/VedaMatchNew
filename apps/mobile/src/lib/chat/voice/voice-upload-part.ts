import { File } from 'expo-file-system';
import { VOICE_UPLOAD_FILE_NAME, VOICE_UPLOAD_MIME_TYPE } from './voice-recording-options';

/** Часть `FormData` — минимум, который `expo`-fetch распознаёт как файл (см. `voice-upload-part.spec.ts`). */
export interface VoiceUploadPart {
  name: string;
  type: string;
  bytes: () => Promise<Uint8Array>;
}

/**
 * Строит часть `FormData` для голосового не через
 * `chat-upload-rules.ts: buildUploadFilePart` (`{uri, name, type}` — форма,
 * которую понимает классический `fetch`/`FormData` React Native), а через
 * сырые байты файла.
 *
 * Причина: `expo` с SDK 53+ ставит на `global.fetch` собственную
 * "winter"-реализацию (`node_modules/expo/src/winter/runtime.native.ts`,
 * условие на `EXPO_PUBLIC_USE_RN_FETCH` — переменная нигде в этом
 * приложении не задана, значит подмена активна). Её `installFormDataPatch`
 * переписывает `FormData.prototype.append`/`entries` БЕЗУСЛОВНО, ДО этой
 * проверки, так что даже вернуть classic `fetch` через переменную окружения
 * не спасло бы: `entries()` начинает отдавать сырые значения `_parts`
 * напрямую, минуя `getParts()` React Native, на который рассчитан
 * `{uri,name,type}` (`client.ts: send()`, комментарий «RN сам подставит…»).
 * Расширить переменной окружения этот проект тоже не вариант — прод
 * получает переменные только из `docker-compose`/CI-окружения, а `.env`
 * файлы в репозитории закрыты правилом `.gitignore` (`.env`/`.env.*`) — то
 * есть у любой будущей сборки, собранной не с той же самой локальной
 * машины, переменной просто не будет.
 *
 * `convertFormData.ts` (`expo/src/winter/fetch/convertFormData.ts`)
 * принимает часть формы, только если это строка, `instanceof Blob`, или
 * объект с методом `.bytes()` — то, что вернёт эта функция. `expo-file-
 * system`'s `File` тоже подошёл бы (`implements Blob`, есть `.bytes()`), но
 * его `.type` определяется по расширению нативным `MimeTypeMap` и не
 * гарантированно даёт ровно `audio/mp4`, которого ждёт сервер
 * (`ALLOWED_VOICE_MIME`, точное сравнение) — а присвоить `.type` самим
 * нельзя: это свойство без сеттера (`Property("type")` без `.set{}` в
 * `FileSystemModule.kt`, тот же класс проблемы, что `player.playbackRate`,
 * `voice-player-rate.ts`). Плоский объект с явным `type` полностью
 * подконтролен.
 */
export async function buildVoiceUploadPart(uri: string): Promise<VoiceUploadPart> {
  const bytes = await new File(uri).bytes();
  return {
    name: VOICE_UPLOAD_FILE_NAME,
    type: VOICE_UPLOAD_MIME_TYPE,
    bytes: async () => bytes,
  };
}
