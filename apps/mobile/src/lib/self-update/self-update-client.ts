import { appVariant } from '@/config/app-variant';
import { parseAppManifest, type AppManifest } from './manifest-validation';

/**
 * `GET` манифеста самообновления (VED-176). Публичный файл в
 * S3-совместимом хранилище портала, как на сайте
 * (`apps/web/src/lib/app-download-api.ts`) — без `credentials`, без
 * `Authorization`, обычный `fetch` мимо `lib/api/client.ts` (тот клиент
 * заточен под API портала с access-токеном и refresh, здесь он не нужен и
 * только всё усложнил бы). Контур/канал и базовый адрес — из
 * `appVariant()`, не хардкод «ru-site», как в `MANIFEST_PATH` веба: иначе
 * `com-site` не заработает без правки этого файла.
 */
const MANIFEST_FILE = 'latest.json';

export function manifestUrl(): string {
  const { downloadBaseUrl, contour, channel } = appVariant();
  return `${downloadBaseUrl.replace(/\/+$/, '')}/mobile/android/${contour}-${channel}/${MANIFEST_FILE}`;
}

/**
 * `null` на любой сетевой сбой или неразобравшийся манифест — вызывающий
 * код (`use-self-update.ts`) не различает «хранилища нет» и «манифест
 * пуст/битый», в обоих случаях секция говорит человеку одно и то же: «Не
 * получилось проверить обновление».
 */
export async function fetchAppManifest(fetchImpl: typeof fetch = fetch): Promise<AppManifest | null> {
  try {
    const response = await fetchImpl(manifestUrl());
    if (!response.ok) return null;
    const raw: unknown = await response.json();
    return parseAppManifest(raw);
  } catch {
    return null;
  }
}
