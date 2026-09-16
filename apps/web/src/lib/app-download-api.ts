import { parseAppManifest, type AppManifest } from "./app-download";

/**
 * Манифест Android-сборки, раздаваемой с сайта (VED-176).
 *
 * Файл лежит не в нашем API, а прямо в S3-хранилище портала — тот же бакет,
 * что и обложки Музыки/картинки Рынка (`apps/api` не участвует, воркфлоу
 * `.github/workflows/mobile-apk.yml` кладёт объект напрямую). Поэтому здесь
 * обычный `fetch` по публичному адресу, а не клиент `lib/api.ts`.
 *
 * Контур сейчас всегда `ru-site`: `vedamatch.ru` — единственный сайт с
 * раздачей самообновляемого APK, `.com` появится отдельно (см. README
 * apps/mobile). `APP_DOWNLOAD_BASE_URL` — публичный адрес бакета
 * (переменная контейнера web, задаётся в `portal/docker-compose.dokploy.yml`);
 * пусто — раздачи ещё нет, карточка Android покажет «скоро».
 */
const MANIFEST_PATH = "mobile/android/ru-site/latest.json";
/** Каждые 10 минут: свежая версия не обязана появляться мгновенно. */
const REVALIDATE_SECONDS = 600;

export async function getAppManifest(): Promise<AppManifest | null> {
  const base = process.env.APP_DOWNLOAD_BASE_URL?.trim();
  if (!base) return null;

  try {
    const response = await fetch(`${base.replace(/\/$/, "")}/${MANIFEST_PATH}`, {
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!response.ok) return null;
    const raw: unknown = await response.json();
    return parseAppManifest(raw);
  } catch {
    // Хранилище недоступно или отдало не JSON — карточка Android покажет
    // «скоро», а не уронит лендинг.
    return null;
  }
}
