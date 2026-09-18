/**
 * Сравнение версий Android-сборки по `versionCode` (VED-176, самообновление
 * с сайта). `versionName` — только для отображения человеку («0.1.0+a1b2c3d»
 * может быть равным или даже меньшим по времени сборки, sha не монотонен);
 * единственный надёжный критерий «новее/старее» — целое `versionCode`, оно
 * обязано расти от сборки к сборке (`apps/mobile/src/config/app-version.ts`).
 */

/** -1 — a старше b, 0 — версии равны, 1 — a новее b. */
export function compareVersionCode(a: number, b: number): -1 | 0 | 1 {
  if (a === b) return 0;
  return a > b ? 1 : -1;
}

/**
 * true, только если версия на сервере целочисленная, положительная и
 * действительно новее установленной. Защита от испорченного манифеста —
 * дробное/нулевое/отрицательное/NaN значение с любой стороны никогда не
 * считается «новее», иначе повреждённый `latest.json` мог бы предложить
 * обновление в никуда или, наоборот, скрыть настоящее.
 */
export function isNewerVersion(remoteCode: number, localCode: number): boolean {
  if (!Number.isInteger(remoteCode) || remoteCode <= 0) return false;
  if (!Number.isInteger(localCode) || localCode <= 0) return false;
  return compareVersionCode(remoteCode, localCode) === 1;
}
