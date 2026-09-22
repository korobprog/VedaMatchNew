import { File } from 'expo-file-system';

/** Локальный файл, который уходит на сервер: те же три поля, что были у `UploadFilePart` переписки. */
export interface UploadSource {
  uri: string;
  name: string;
  type: string;
}

/** Часть `FormData`, которую `expo`-fetch распознаёт как файл — см. большой комментарий ниже. */
export interface UploadFormPart {
  name: string;
  type: string;
  bytes: () => Promise<Uint8Array>;
}

/**
 * Строит часть `FormData` для ЛЮБОЙ отправки файла из приложения — вложения
 * переписки (фото, документ, голосовое) и аватара профиля (VED-332) — не через `{uri, name, type}` (`UploadFilePart` — форма,
 * рассчитанная на классический `fetch`/`FormData` React Native,
 * `client.ts: send()`, комментарий «RN сам подставит…»), а через сырые
 * байты файла.
 *
 * Общий модуль — до VED-286 (feedback-003) байтовый путь был только у
 * голосового (`voice/voice-upload-part.ts`), а фото/файлы
 * (`app/chat/[id].tsx: performUpload`) продолжали слать `{uri,name,type}`
 * и падали ровно с той же ошибкой, что до этого падало голосовое —
 * подтверждено живой проверкой сборки 1023. Причина одна на все виды
 * вложений, значит и лечится в одном месте:
 *
 * `expo` с SDK 53+ ставит на `global.fetch` собственную "winter"-реализацию
 * (`node_modules/expo/src/winter/runtime.native.ts`, условие на
 * `EXPO_PUBLIC_USE_RN_FETCH` — переменная нигде в этом приложении не
 * задана, значит подмена активна). Её `installFormDataPatch` переписывает
 * `FormData.prototype.append`/`entries` БЕЗУСЛОВНО, ДО этой проверки, так
 * что даже вернуть classic `fetch` переменной окружения не спасло бы:
 * `entries()` начинает отдавать сырые значения `_parts` напрямую, минуя
 * `getParts()` React Native, на который рассчитан `{uri,name,type}`.
 * Обойти конфигурацией тоже нельзя — прод получает переменные только из
 * `docker-compose`/CI-окружения, а `.env`-файлы в репозитории закрыты
 * правилом `.gitignore` (`.env`/`.env.*`).
 *
 * `convertFormData.ts` (`expo/src/winter/fetch/convertFormData.ts`)
 * принимает часть формы, только если это строка, `instanceof Blob`, или
 * объект с методом `.bytes()` — то, что возвращает эта функция.
 * `expo-file-system`'s `File` тоже подошёл бы напрямую (`implements Blob`,
 * есть `.bytes()`), но его `.type` определяется по расширению нативным
 * `MimeTypeMap` и не гарантированно совпадает с тем, что ждёт сервер
 * (точное сравнение по `Set`, `chat-upload-rules.ts`/серверный
 * `ALLOWED_*_MIME`) — а присвоить `.type` самим нельзя, это свойство без
 * сеттера (`Property("type")` без `.set{}` в `FileSystemModule.kt`, тот же
 * класс проблемы, что `player.playbackRate`, `voice/voice-player-rate.ts`).
 * Плоский объект с явным `type` из уже определённого на клиенте MIME
 * (`normalizePickedImage`/`normalizePickedDocument`/голосовые константы)
 * полностью подконтролен.
 *
 * Лежит не в `lib/chat/`, а отдельно: с VED-332 этим же путём уходит аватар
 * профиля (`lib/profile/avatar-rules.ts`), и второй такой же строитель в
 * профиле означал бы второй экземпляр этой же ловушки. `lib/chat/chat-upload-part.ts`
 * оставлен тонким реэкспортом, чтобы переписка и её тесты не переезжали.
 *
 * Память: тело читается в `Uint8Array` целиком, не потоково. Потолки
 * сервера — 10 МБ (фото), 25 МБ (файлы), 15 МБ (голосовые)
 * (`apps/api/src/modules/chat/chat-upload-rules.ts`), 5 МБ (аватар,
 * `users.service.ts`) — ни один не превышает
 * порог, начиная с которого стоило бы городить потоковую загрузку через
 * `expo-file-system`'s `UploadTask` вместо чтения в память (обычно это
 * актуально для файлов от десятков МБ и больше); разовое выделение до
 * 25 МБ — не стриминг видео и не повторяется в цикле.
 */
export async function buildUploadFormPart(part: UploadSource): Promise<UploadFormPart> {
  const bytes = await new File(part.uri).bytes();
  return { name: part.name, type: part.type, bytes: async () => bytes };
}
