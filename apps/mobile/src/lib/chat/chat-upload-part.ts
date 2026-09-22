/**
 * Строитель части `FormData` для вложений переписки.
 *
 * Сам код переехал в `lib/upload/upload-form-part.ts` (VED-332): тем же
 * путём теперь уходит аватар профиля, а он не вложение чата. Здесь остался
 * реэкспорт — переписка, голосовые и их тесты ссылаются на этот файл, и
 * переносить их заодно значило бы трогать код, к профилю отношения не
 * имеющий. Разбор ловушки `expo`-fetch — в новом файле.
 */
export {
  buildUploadFormPart,
  type UploadFormPart,
  type UploadFormPart as ChatUploadFormPart,
} from '../upload/upload-form-part';
