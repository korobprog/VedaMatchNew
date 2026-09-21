/**
 * Как назвать точку доставки в разделе админки (VED-314).
 *
 * У веб-подписки нет ничего, кроме `user-agent` браузера, а `endpoint`
 * показывать нельзя: это секрет, по которому подписке можно отправить пуш.
 * Поэтому «Chrome, Android» — и по такой подписи администратор понимает, о
 * каком устройстве человек говорит по телефону.
 *
 * Не полноценный разбор `user-agent`, и не нужен: задача — отличить браузеры
 * одного человека друг от друга, а не построить статистику.
 */

/** Порядок важен: Edge и Opera представляются ещё и как Chrome, Chrome —
 *  как Safari, а Safari честно зовётся Safari только сам. */
const BROWSERS: Array<[RegExp, string]> = [
  [/\bEdg[A-Z]?\//, 'Edge'],
  [/\b(OPR|Opera)\//, 'Opera'],
  [/\bYaBrowser\//, 'Яндекс.Браузер'],
  [/\bSamsungBrowser\//, 'Samsung Internet'],
  [/\bFirefox\//, 'Firefox'],
  [/\bChrome\//, 'Chrome'],
  [/\bSafari\//, 'Safari'],
];

const PLATFORMS: Array<[RegExp, string]> = [
  [/\bAndroid\b/, 'Android'],
  [/\b(iPhone|iPad|iOS)\b/, 'iOS'],
  [/\b(Mac OS X|Macintosh)\b/, 'macOS'],
  [/\bWindows\b/, 'Windows'],
  [/\b(Linux|X11)\b/, 'Linux'],
];

function match(source: string, table: Array<[RegExp, string]>): string | null {
  for (const [pattern, name] of table) {
    if (pattern.test(source)) return name;
  }
  return null;
}

/**
 * Подпись веб-подписки. Пустой или неизвестный `user-agent` — «браузер»:
 * строка приходит от клиента, и полагаться на её формат нельзя.
 */
export function describeWebSubscription(userAgent: string | null): string {
  const source = (userAgent ?? '').trim();
  if (!source) return 'Браузер';
  const browser = match(source, BROWSERS);
  const platform = match(source, PLATFORMS);
  if (browser && platform) return `${browser}, ${platform}`;
  return browser ?? platform ?? 'Браузер';
}

/**
 * Подпись телефона с приложением: платформа, служба доставки и сборка —
 * ровно то, что о нём известно из регистрации токена. Слово «приложение»
 * сюда не входит: его говорит вид точки доставки рядом, и в строке получалось
 * «Приложение: Приложение, Android».
 */
export function describeAppDevice(device: {
  provider: string;
  platform: string;
  appVariant: string | null;
}): string {
  const platform = device.platform === 'ios' ? 'iOS' : 'Android';
  const provider = device.provider === 'rustore' ? 'RuStore' : 'FCM';
  const parts = [platform, provider];
  if (device.appVariant) parts.push(device.appVariant);
  return parts.join(' · ');
}
