/**
 * Аудиомаршруты (динамик, гарнитура, датчик приближения) в браузере
 * недоступны — большинство методов молча ничего не делают.
 *
 * Исключение — `setKeepScreenOn` (VED-222, п.4 на нативе: «не гаснет экран
 * во время видео», `keep-awake.ts`): на вебе за это отвечает `app/call/[id].tsx`
 * тем же вызовом (`InCallManager.setKeepScreenOn(...)`), так что вместо ещё
 * одного платформенного файла ради одного метода он честно реализован прямо
 * здесь через `navigator.wakeLock` (Screen Wake Lock API) — на
 * поддерживающих браузерах (Chrome/Edge, Android WebView; Safari без него)
 * экран во время видеозвонка действительно не гаснет, на остальных — тот же
 * спокойный no-op, что и у всего файла: звонок не должен падать из-за
 * отсутствия API, максимум — экран погаснет чуть раньше обычного.
 */

interface WakeLockSentinelLike {
  release: () => Promise<void>;
  addEventListener: (type: 'release', cb: () => void) => void;
}
type NavigatorWithWakeLock = Navigator & {
  wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
};

let sentinel: WakeLockSentinelLike | null = null;
/** Что попросили в последний раз — используется, чтобы вернуть лок после
 *  возврата вкладки на передний план: браузер сам снимает его, когда вкладка
 *  уходит в фон, и не восстанавливает сам. */
let requested = false;

async function acquire(): Promise<void> {
  const nav = typeof navigator === 'undefined' ? undefined : (navigator as NavigatorWithWakeLock);
  if (!nav?.wakeLock || sentinel) return;
  try {
    const next = await nav.wakeLock.request('screen');
    // Запрос отменили (`release()` уже вызван), пока `await` шёл, — не
    // держим лишний лок, отпускаем сразу же.
    if (!requested) {
      void next.release().catch(() => undefined);
      return;
    }
    sentinel = next;
    sentinel.addEventListener('release', () => {
      sentinel = null;
    });
  } catch {
    // Отклонено политикой браузера (вкладка не видна, нет фокуса) — молча,
    // это не повод ронять звонок; `visibilitychange` ниже попробует снова.
  }
}

function release(): void {
  const current = sentinel;
  sentinel = null;
  if (current) void current.release().catch(() => undefined);
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (requested && document.visibilityState === 'visible') void acquire();
  });
}

const overrides: Record<string, (...args: unknown[]) => unknown> = {
  setKeepScreenOn: (on: unknown) => {
    requested = Boolean(on);
    if (requested) void acquire();
    else release();
  },
};

const noop = () => undefined;
const InCallManager = new Proxy({} as Record<string, unknown>, {
  get: (_target, prop: string) => overrides[prop] ?? noop,
});
export default InCallManager;
