/**
 * versionCode/versionName Android для самообновления с сайта (VED-176,
 * channel=site). Google Play не разрешает переустановку через незнакомый
 * пакет, поэтому самообновление — это просто «скачал файл новее», а «новее»
 * решает исключительно `versionCode`: он обязан расти от сборки к сборке.
 *
 * Источник роста — CI (`.github/workflows/mobile-apk.yml`): туда приходит
 * `github.run_number` (растёт на каждый запуск воркфлоу, включая ручные) со
 * смещением, чтобы не начинать с единицы поверх версий, выпущенных раньше
 * этим же способом. Локально переменной нет — versionCode остаётся 1,
 * сборка для эмулятора самообновление не проверяет.
 *
 * Модуль чистый: его читает `app.config.ts` в Node во время сборки, и тесты.
 */

export type AppVersionEnv = Record<string, string | undefined>;

export function resolveVersionCode(env: AppVersionEnv): number {
  const raw = env.APP_VERSION_CODE?.trim();
  if (!raw) return 1;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(
      `APP_VERSION_CODE="${raw}" должен быть положительным целым числом`,
    );
  }
  return parsed;
}

/**
 * versionName — для человека, а не для системы самообновления: номер пакета
 * из `package.json` плюс короткий sha сборки, чтобы отличить два APK с
 * одним и тем же номером версии между релизами. Без sha (локальная сборка)
 * остаётся голый номер пакета.
 */
export function resolveVersionName(
  packageVersion: string,
  env: AppVersionEnv,
): string {
  const sha = env.APP_VERSION_SHA?.trim();
  if (!sha) return packageVersion;
  return `${packageVersion}+${sha.slice(0, 7)}`;
}
