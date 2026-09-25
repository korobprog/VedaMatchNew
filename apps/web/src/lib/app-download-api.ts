import { parseAppManifest, type AppManifest } from "./app-download";
import { toInternalStorageUrl } from "./storage-internal-url";

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
/**
 * Предел ожидания хранилища. Лендинг рендерится на сервере, и зависший
 * запрос держал весь ответ: 24.09 манифест читался через media.vedamatch.ru —
 * сервер ходил сам к себе через публичный адрес, запрос не возвращался,
 * healthcheck (`wget /` с таймаутом 5 с) падал, и Traefik снимал сайт с
 * маршрута. Меньше таймаута healthcheck с запасом.
 */
const FETCH_TIMEOUT_MS = 2_500;

export async function getAppManifest(): Promise<AppManifest | null> {
  const base = process.env.APP_DOWNLOAD_BASE_URL?.trim();
  if (!base) return null;

  try {
    const url = toInternalStorageUrl(
      `${base.replace(/\/$/, "")}/${MANIFEST_PATH}`,
    );
    const response = await fetch(url, {
      next: { revalidate: REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const raw: unknown = await response.json();
    return parseAppManifest(raw);
  } catch {
    // Хранилище недоступно, не ответило за FETCH_TIMEOUT_MS или отдало не
    // JSON — карточка Android покажет «скоро», а не уронит лендинг.
    return null;
  }
}
