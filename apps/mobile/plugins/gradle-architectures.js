// Набор процессорных архитектур Android-сборки — чистая логика для
// `with-android-architectures.js`, покрыта node:test.
//
// Шаблон Expo собирает нативный код под четыре архитектуры, и APK с сайта
// получается «универсальным»: 155 МБ, из которых ~71 МБ — x86 и x86_64,
// нужные только эмуляторам и Chromebook. Телефонам хватает двух ARM-наборов.
// Google Play раздаёт AAB по архитектурам сам, для него это не критично.

const PROPERTY = 'reactNativeArchitectures';
const DEFAULT_ARCHITECTURES = ['armeabi-v7a', 'arm64-v8a'];
const KNOWN_ARCHITECTURES = ['armeabi-v7a', 'arm64-v8a', 'x86', 'x86_64'];

/**
 * Список архитектур из переменной окружения `ANDROID_ARCHITECTURES`
 * (через запятую) — например, `x86_64` для сборки под эмулятор. Пусто —
 * умолчание для телефонов. Неизвестное имя — ошибка: опечатка иначе молча
 * дала бы APK, который не ставится ни на один телефон.
 */
function resolveArchitectures(envValue) {
  const list = [
    ...new Set(
      (envValue ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
  if (list.length === 0) return [...DEFAULT_ARCHITECTURES];
  const unknown = list.filter((item) => !KNOWN_ARCHITECTURES.includes(item));
  if (unknown.length > 0) {
    throw new Error(
      `ANDROID_ARCHITECTURES: неизвестная архитектура ${unknown.join(', ')}; допустимы ${KNOWN_ARCHITECTURES.join(', ')}`,
    );
  }
  return list;
}

/**
 * Ставит `reactNativeArchitectures` в свойства gradle.properties (формат
 * `withGradleProperties`: массив `{ type: 'property', key, value }` и
 * `{ type: 'comment', value }`). Существующее значение заменяется на месте,
 * отсутствующее дописывается в конец. Исходный массив не меняется.
 */
function applyArchitectures(properties, architectures) {
  const value = architectures.join(',');
  let found = false;
  const next = properties.map((item) => {
    if (item.type === 'property' && item.key === PROPERTY) {
      found = true;
      return { ...item, value };
    }
    return item;
  });
  if (!found) next.push({ type: 'property', key: PROPERTY, value });
  return next;
}

module.exports = {
  DEFAULT_ARCHITECTURES,
  KNOWN_ARCHITECTURES,
  resolveArchitectures,
  applyArchitectures,
};
