import {
  cameOnline,
  connectivityFromState,
  decideStartupView,
  NETWORK_PROBE_TIMEOUT_MS,
  PROFILE_RESTORE_TIMEOUT_MS,
  profileRestorePlan,
  settleWithin,
  shouldAutoRetryRestore,
  shouldReloadProfile,
  shouldShowOfflineBanner,
  stalledCopy,
  STARTUP_STALL_MS,
} from './startup-decision';

/**
 * Старт без сети (Realme, Android 12): раньше — вечный белый экран. Здесь
 * проверяется, что любой путь старта заканчивается видимым экраном и что
 * отсутствие сети ни на каком шаге не превращается в «вышел из аккаунта».
 */

describe('connectivityFromState', () => {
  it('нет подключения — нет сети', () => {
    expect(connectivityFromState({ isConnected: false, isInternetReachable: false })).toBe('offline');
  });

  it('Wi-Fi без выхода в интернет — тоже нет сети', () => {
    expect(connectivityFromState({ isConnected: true, isInternetReachable: false })).toBe('offline');
  });

  it('подключение есть, о доступности интернета ещё не знаем — считаем, что есть', () => {
    expect(connectivityFromState({ isConnected: true })).toBe('online');
    expect(connectivityFromState({ isConnected: true, isInternetReachable: null })).toBe('online');
  });

  it('до первого ответа expo-network — не знаем, а не «нет сети»', () => {
    expect(connectivityFromState({})).toBe('unknown');
    expect(connectivityFromState(null)).toBe('unknown');
    expect(connectivityFromState(undefined)).toBe('unknown');
  });
});

describe('profileRestorePlan', () => {
  it('без сети не ждём сервер — во вкладки сразу', () => {
    expect(profileRestorePlan('offline')).toBe('enter-now');
  });

  it('с сетью и в неизвестности ждём профиль (с таймаутом)', () => {
    expect(profileRestorePlan('online')).toBe('wait');
    expect(profileRestorePlan('unknown')).toBe('wait');
  });
});

describe('decideStartupView', () => {
  it('гость и вошедший — приложение (экран входа или вкладки)', () => {
    expect(decideStartupView({ status: 'guest', loadingForMs: 0 })).toBe('app');
    expect(decideStartupView({ status: 'signed', loadingForMs: 60_000 })).toBe('app');
  });

  it('первые секунды восстановления — фон темы, без мигания экрана входа', () => {
    expect(decideStartupView({ status: 'loading', loadingForMs: 0 })).toBe('splash');
    expect(decideStartupView({ status: 'loading', loadingForMs: STARTUP_STALL_MS - 1 })).toBe('splash');
  });

  it('затянувшееся восстановление — экран повтора, а не пустота', () => {
    expect(decideStartupView({ status: 'loading', loadingForMs: STARTUP_STALL_MS })).toBe('stalled');
    expect(decideStartupView({ status: 'loading', loadingForMs: 10 * 60_000 })).toBe('stalled');
  });

  it('страховка срабатывает позже, чем сессия успевает решить сама', () => {
    expect(STARTUP_STALL_MS).toBeGreaterThan(PROFILE_RESTORE_TIMEOUT_MS + NETWORK_PROBE_TIMEOUT_MS);
  });
});

describe('shouldShowOfflineBanner', () => {
  it('у вошедшего без сети — плашка', () => {
    expect(shouldShowOfflineBanner({ status: 'signed', connectivity: 'offline' })).toBe(true);
  });

  it('с сетью или в неизвестности — нет', () => {
    expect(shouldShowOfflineBanner({ status: 'signed', connectivity: 'online' })).toBe(false);
    expect(shouldShowOfflineBanner({ status: 'signed', connectivity: 'unknown' })).toBe(false);
  });

  it('гостю и в загрузке — нет: у них свои экраны', () => {
    expect(shouldShowOfflineBanner({ status: 'guest', connectivity: 'offline' })).toBe(false);
    expect(shouldShowOfflineBanner({ status: 'loading', connectivity: 'offline' })).toBe(false);
  });
});

describe('cameOnline', () => {
  it('переход в «есть сеть» из «нет» и из «не знаем»', () => {
    expect(cameOnline('offline', 'online')).toBe(true);
    expect(cameOnline('unknown', 'online')).toBe(true);
  });

  it('сеть была и есть, или пропала — не возвращение', () => {
    expect(cameOnline('online', 'online')).toBe(false);
    expect(cameOnline('online', 'offline')).toBe(false);
    expect(cameOnline('offline', 'unknown')).toBe(false);
  });
});

describe('shouldReloadProfile', () => {
  const base = { status: 'signed', hasUser: false, previous: 'offline', current: 'online' } as const;

  it('пустили без профиля, сеть вернулась — догружаем', () => {
    expect(shouldReloadProfile(base)).toBe(true);
  });

  it('профиль уже есть — не трогаем', () => {
    expect(shouldReloadProfile({ ...base, hasUser: true })).toBe(false);
  });

  it('сеть не возвращалась — не трогаем', () => {
    expect(shouldReloadProfile({ ...base, previous: 'online' })).toBe(false);
    expect(shouldReloadProfile({ ...base, current: 'offline' })).toBe(false);
  });

  it('гость и загрузка — не наше дело', () => {
    expect(shouldReloadProfile({ ...base, status: 'guest' })).toBe(false);
    expect(shouldReloadProfile({ ...base, status: 'loading' })).toBe(false);
  });
});

describe('shouldAutoRetryRestore', () => {
  it('на экране повтора сеть вернулась — повторяем сами', () => {
    expect(shouldAutoRetryRestore({ view: 'stalled', previous: 'offline', current: 'online' })).toBe(true);
  });

  it('на других экранах и без возвращения сети — нет', () => {
    expect(shouldAutoRetryRestore({ view: 'splash', previous: 'offline', current: 'online' })).toBe(false);
    expect(shouldAutoRetryRestore({ view: 'app', previous: 'offline', current: 'online' })).toBe(false);
    expect(shouldAutoRetryRestore({ view: 'stalled', previous: 'online', current: 'online' })).toBe(false);
  });
});

describe('stalledCopy', () => {
  it('без сети просит включить интернет и не пугает выходом из аккаунта', () => {
    const copy = stalledCopy('offline');
    expect(copy.title).toBe('Нет соединения');
    expect(copy.body).toMatch(/интернет/);
    expect(copy.body).toMatch(/не вышли/);
  });

  it('с сетью говорит про сервер', () => {
    expect(stalledCopy('online').body).toMatch(/сервером/);
    expect(stalledCopy('unknown').body).toMatch(/сервером/);
  });
});

describe('settleWithin', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('успевшее обещание отдаёт значение', async () => {
    const result = settleWithin(Promise.resolve(42), 1_000);
    await expect(result).resolves.toEqual({ ok: true, value: 42 });
  });

  it('упавшее обещание отдаёт ошибку, а не бросает', async () => {
    const error = new Error('Network request failed');
    await expect(settleWithin(Promise.reject(error), 1_000)).resolves.toEqual({ ok: false, error });
  });

  it('зависшее обещание — null по таймауту', async () => {
    const result = settleWithin(new Promise(() => undefined), 1_000);
    jest.advanceTimersByTime(1_000);
    await expect(result).resolves.toBeNull();
  });
});
