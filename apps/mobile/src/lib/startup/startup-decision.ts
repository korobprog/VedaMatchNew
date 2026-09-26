/**
 * Что показать на старте, пока сессия восстанавливается, и как вести себя
 * без сети — отдельно от экранов, чистыми функциями.
 *
 * Факт с устройства (Realme, Android 12, сеть выключена): приложение
 * открывалось пустым белым экраном и так и оставалось. Корневой стек
 * (`root-shell-stack.tsx`) ничего не рисовал, пока `status === 'loading'`, а
 * восстановление с сохранённым токеном ждало `GET /users/me`. У `fetch` в
 * React Native на Android нет своего таймаута (OkHttp приложения собран с
 * нулевыми), поэтому запрос мог висеть сколько угодно, и выхода из
 * «загрузки» не было.
 *
 * Правила теперь такие:
 * - гость сети не ждёт вовсе: токена нет — экран входа сразу;
 * - с сохранённым токеном и заведомо без сети — во вкладки сразу, с плашкой
 *   «Нет соединения», профиль догрузится, когда сеть появится;
 * - с токеном и сетью — ждём профиль не дольше `PROFILE_RESTORE_TIMEOUT_MS`,
 *   дальше тоже во вкладки (так `session.tsx` и раньше поступал при сетевой
 *   ошибке — токен никто не стирает);
 * - если «загрузка» всё равно затянулась дольше `STARTUP_STALL_MS` (завис
 *   не запрос, а, например, чтение защищённого хранилища) — экран «Нет
 *   соединения» с кнопкой «Повторить», а не пустота.
 *
 * Разлогинивает по-прежнему только явный отказ сервера (401/403 на обновлении
 * токена, `token-authority.ts`) — не отсутствие сети.
 */

export type Connectivity = 'online' | 'offline' | 'unknown';

/** То, что отдаёт `expo-network` (`NetworkState`), — только нужные поля. */
export interface NetworkStateLike {
  isConnected?: boolean | null;
  isInternetReachable?: boolean | null;
}

/**
 * Сколько ждать профиль при запуске, если сеть есть или о ней ничего не
 * известно. Дольше — пускаем во вкладки с тем, что есть.
 */
export const PROFILE_RESTORE_TIMEOUT_MS = 8_000;

/**
 * Сколько ждать ответа `expo-network` о состоянии сети. Нативный вызов
 * обычно отвечает за миллисекунды; если нет — считаем состояние неизвестным
 * и просто ждём профиль с таймаутом выше.
 */
export const NETWORK_PROBE_TIMEOUT_MS = 1_500;

/**
 * Страховка корневого стека: сколько максимум показывать пустой фон
 * «восстанавливаем сессию», прежде чем показать экран повтора. Больше суммы
 * двух таймаутов выше — в обычном ходе событий сессия успевает решить сама.
 */
export const STARTUP_STALL_MS = 12_000;

/**
 * Состояние сети по `expo-network`. «Нет сети» — только когда платформа это
 * утверждает: либо подключения нет вовсе, либо оно есть, но интернет за ним
 * недоступен (Wi-Fi без выхода наружу — Android проверяет это сам). Пустой
 * объект (`useNetworkState()` до первого ответа) и `null`/`undefined` в полях
 * — «не знаем», а не «нет».
 */
export function connectivityFromState(state: NetworkStateLike | null | undefined): Connectivity {
  if (!state) return 'unknown';
  if (state.isConnected === false) return 'offline';
  if (state.isInternetReachable === false) return 'offline';
  if (state.isConnected === true) return 'online';
  return 'unknown';
}

export type ProfileRestorePlan =
  /** Не ждать профиль: пустить во вкладки сразу, профиль догрузится позже. */
  | 'enter-now'
  /** Ждать профиль, но не дольше `PROFILE_RESTORE_TIMEOUT_MS`. */
  | 'wait';

/**
 * Как восстанавливать сессию, когда токен в хранилище есть. Без сети ждать
 * ответа сервера бессмысленно — только держать человека перед пустым экраном.
 */
export function profileRestorePlan(connectivity: Connectivity): ProfileRestorePlan {
  return connectivity === 'offline' ? 'enter-now' : 'wait';
}

export type SessionStatusLike = 'loading' | 'guest' | 'signed';

export type StartupView =
  /** Сессия восстанавливается: фон темы, без мигания экрана входа. */
  | 'splash'
  /** Восстановление затянулось: «Нет соединения» и «Повторить». */
  | 'stalled'
  /** Решено: экран входа или вкладки. */
  | 'app';

export function decideStartupView(input: { status: SessionStatusLike; loadingForMs: number }): StartupView {
  if (input.status !== 'loading') return 'app';
  return input.loadingForMs >= STARTUP_STALL_MS ? 'stalled' : 'splash';
}

/**
 * Плашка «Нет соединения» над вкладками. Только у вошедшего: экран входа
 * без сети и так скажет об ошибке на нажатии, а в «загрузке» есть свой экран.
 */
export function shouldShowOfflineBanner(input: { status: SessionStatusLike; connectivity: Connectivity }): boolean {
  return input.status === 'signed' && input.connectivity === 'offline';
}

/**
 * Сеть вернулась: переход в `'online'` из любого другого состояния. Первый
 * ответ `expo-network` (`unknown → online`) тоже считается — к этому моменту
 * стартовый запрос профиля мог уже не пройти.
 */
export function cameOnline(previous: Connectivity, current: Connectivity): boolean {
  return current === 'online' && previous !== 'online';
}

/**
 * Догрузить профиль, когда сеть вернулась: вошёл, профиля нет (пустили без
 * сети или по таймауту) и сеть только что появилась.
 */
export function shouldReloadProfile(input: {
  status: SessionStatusLike;
  hasUser: boolean;
  previous: Connectivity;
  current: Connectivity;
}): boolean {
  return input.status === 'signed' && !input.hasUser && cameOnline(input.previous, input.current);
}

/**
 * Экран в состоянии ошибки перечитывает себя сам, когда сеть вернулась, —
 * тем же сигналом, что снимает плашку «Нет соединения». Без этого вкладка
 * «Чаты» оставалась с ошибкой после включения сети (Realme, сборка 1034),
 * хотя плашка ушла и соседние полосы перечитались. Экран без ошибки не
 * трогаем: лишний запрос на каждую смену сети незачем.
 */
export function shouldReloadOnReconnect(input: {
  failed: boolean;
  previous: Connectivity;
  current: Connectivity;
}): boolean {
  return input.failed && cameOnline(input.previous, input.current);
}

/** Повторить восстановление само, когда на экране повтора появилась сеть. */
export function shouldAutoRetryRestore(input: {
  view: StartupView;
  previous: Connectivity;
  current: Connectivity;
}): boolean {
  return input.view === 'stalled' && cameOnline(input.previous, input.current);
}

export interface StalledCopy {
  title: string;
  body: string;
}

/** Слова экрана повтора: без сети — про сеть, с сетью — про сервер. */
export function stalledCopy(connectivity: Connectivity): StalledCopy {
  if (connectivity === 'offline') {
    return {
      title: 'Нет соединения',
      body: 'Включите интернет — приложение продолжит само. Из аккаунта вы не вышли.',
    };
  }
  return {
    title: 'Нет соединения',
    body: 'Не получается связаться с сервером. Попробуйте ещё раз — из аккаунта вы не вышли.',
  };
}

export const OFFLINE_BANNER_TEXT = 'Нет соединения. Обновим, когда появится сеть.';

/**
 * Обещание с потолком по времени: `null`, если не успело. Исходное обещание
 * не отменяется — `fetch` без сигнала отменить нечем, — его результат
 * просто перестаёт кого-то ждать.
 */
export function settleWithin<T>(promise: Promise<T>, ms: number): Promise<{ ok: true; value: T } | { ok: false; error: unknown } | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve({ ok: true, value });
      },
      (error: unknown) => {
        clearTimeout(timer);
        resolve({ ok: false, error });
      },
    );
  });
}
