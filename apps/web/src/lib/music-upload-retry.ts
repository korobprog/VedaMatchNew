// Политика повторов заливки записи: чистые функции без обращения к сети.
//
// Зачем. На телефоне при переключении в другое приложение браузер
// приостанавливает страницу и рвёт идущий XHR — заливка падает с
// `onerror`. Веб-страница в фоне по-настоящему грузить не может, поэтому
// делаем лучшее из возможного: не считаем обрыв окончательной ошибкой,
// ждём возвращения в приложение и связи и льём файл заново.

/** Всего попыток PUT (первая + повторы). */
export const UPLOAD_MAX_ATTEMPTS = 3;

/** Паузы перед второй и третьей попыткой, мс. */
export const UPLOAD_BACKOFF_MS = [1000, 3000] as const;

/** Запас до истечения подписи: PUT на сотню мегабайт длится минуты. */
export const PRESIGN_SAFETY_MS = 30_000;

export const UPLOAD_INTERRUPTED_MESSAGE =
  "Загрузка прервалась — телефон приостановил страницу или пропала связь.";

/**
 * Обрыв на уровне сети (onerror, onabort, timeout). Отказ хранилища с
 * HTTP-кодом — обычная `Error`: повтор того же PUT дал бы тот же 403.
 */
export class UploadNetworkError extends Error {
  constructor(message: string = UPLOAD_INTERRUPTED_MESSAGE) {
    super(message);
    this.name = "UploadNetworkError";
  }
}

export function isRetryableUploadError(error: unknown): boolean {
  return error instanceof Error && error.name === "UploadNetworkError";
}

/** Пауза после неудачной попытки `failedAttempt` (с единицы); `null` — попытки кончились. */
export function backoffDelay(failedAttempt: number): number | null {
  if (failedAttempt >= UPLOAD_MAX_ATTEMPTS) return null;
  return UPLOAD_BACKOFF_MS[failedAttempt - 1] ?? null;
}

/** Подписанная ссылка могла истечь — перед повтором нужна новая. */
export function presignExpired(
  issuedAtMs: number,
  nowMs: number,
  expiresInSeconds: number,
  safetyMs: number = PRESIGN_SAFETY_MS,
): boolean {
  return nowMs - issuedAtMs >= expiresInSeconds * 1000 - safetyMs;
}

type DocLike = Pick<Document, "visibilityState">;
type NavLike = Pick<Navigator, "onLine">;
type EventTargetLike = Pick<
  EventTarget,
  "addEventListener" | "removeEventListener"
>;

/** Страница на экране и есть связь — можно лить. */
export function isPageReady(doc: DocLike, nav: NavLike): boolean {
  return doc.visibilityState !== "hidden" && nav.onLine !== false;
}

/**
 * Ждёт, пока страница снова станет видимой, а связь появится.
 * Зависимости передаются снаружи, чтобы проверять без браузера.
 * `doc` слушает `visibilitychange`, `win` — `online`/`offline`.
 */
export function waitUntilVisibleAndOnline(
  doc: DocLike & EventTargetLike,
  nav: NavLike,
  win: EventTargetLike,
): Promise<void> {
  if (isPageReady(doc, nav)) return Promise.resolve();
  return new Promise((resolve) => {
    const check = () => {
      if (!isPageReady(doc, nav)) return;
      doc.removeEventListener("visibilitychange", check);
      win.removeEventListener("online", check);
      resolve();
    };
    doc.addEventListener("visibilitychange", check);
    win.addEventListener("online", check);
  });
}

type WakeLockSentinelLike = { release: () => Promise<void> };
type WakeLockNav = {
  wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
};

/**
 * Не даёт экрану погаснуть, пока идёт заливка. Не поддерживается или
 * отказано — молча ничего не делаем: это подсказка браузеру, не условие.
 * Браузер сам снимает блокировку, когда страница скрыта, поэтому берём её
 * заново при возвращении. Возвращает функцию отпускания.
 */
export function keepScreenAwake(
  nav: WakeLockNav,
  doc: DocLike & EventTargetLike,
): () => void {
  if (!nav.wakeLock) return () => {};
  let sentinel: WakeLockSentinelLike | null = null;
  let stopped = false;
  const acquire = async () => {
    try {
      const next = await nav.wakeLock!.request("screen");
      if (stopped) {
        await next.release().catch(() => {});
      } else {
        sentinel = next;
      }
    } catch {
      // Экономия заряда или запрет политики — заливке это не мешает.
    }
  };
  const onVisible = () => {
    if (doc.visibilityState === "visible" && !stopped) void acquire();
  };
  doc.addEventListener("visibilitychange", onVisible);
  void acquire();
  return () => {
    stopped = true;
    doc.removeEventListener("visibilitychange", onVisible);
    void sentinel?.release().catch(() => {});
    sentinel = null;
  };
}
