// Чистая логика подстановки релизной подписи в текст `android/app/build.gradle`
// (VED-176: раздача APK с сайта). Вынесена из `with-release-signing.js` в
// отдельный CommonJS-модуль без зависимости на `expo/config-plugins`, чтобы
// гонять её тестом node:test напрямую, без Jest и без Expo-раннера — тот же
// приём, что и `scripts/brand-geometry.mjs` рядом с воркером, который тестом
// не покрыть.
//
// Без всех четырёх переменных окружения подпись остаётся отладочной — так
// собирается APK у любого разработчика локально, и `expo prebuild` без них
// работает точно как раньше.

/** @type {readonly string[]} */
const REQUIRED_ENV_NAMES = [
  'ANDROID_KEYSTORE_PATH',
  'ANDROID_KEYSTORE_PASSWORD',
  'ANDROID_KEY_ALIAS',
  'ANDROID_KEY_PASSWORD',
];

/**
 * Достаёт из окружения четвёрку релизной подписи. `null`, если задана не
 * вся четвёрка целиком: наполовину заданный секрет — почти всегда опечатка
 * в имени переменной CI, а не осознанный выбор оставить часть по умолчанию.
 *
 * @param {NodeJS.ProcessEnv} env
 * @returns {{ storeFile: string; storePassword: string; keyAlias: string; keyPassword: string } | null}
 */
function releaseSigningEnv(env) {
  const values = REQUIRED_ENV_NAMES.map((name) => env[name]?.trim());
  if (values.some((value) => !value)) return null;
  const [storeFile, storePassword, keyAlias, keyPassword] = values;
  return {
    storeFile: /** @type {string} */ (storeFile),
    storePassword: /** @type {string} */ (storePassword),
    keyAlias: /** @type {string} */ (keyAlias),
    keyPassword: /** @type {string} */ (keyPassword),
  };
}

/** Экранирует одинарную кавычку для литерала Groovy/Gradle. */
function quoteGroovy(value) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * Подставляет `signingConfigs.release` в текст build.gradle и переключает
 * на него `buildTypes.release`, если в окружении есть все четыре секрета.
 * Без них текст возвращается без изменений — отладочная подпись шаблона
 * Expo (`signingConfigs.debug`) остаётся как есть.
 *
 * Идемпотентна: повторный вызов на уже пропатченном тексте ничего не меняет
 * (`expo prebuild --clean` всё равно каждый раз генерирует файл заново, но
 * плагин может быть вызван и без --clean в другом сценарии).
 *
 * @param {string} gradleText
 * @param {NodeJS.ProcessEnv} env
 * @returns {string}
 */
function applyReleaseSigning(gradleText, env) {
  const signing = releaseSigningEnv(env);
  if (!signing) return gradleText;
  if (gradleText.includes('signingConfigs.release')) return gradleText;

  const releaseSigningBlock =
    `        release {\n` +
    `            storeFile file('${quoteGroovy(signing.storeFile)}')\n` +
    `            storePassword '${quoteGroovy(signing.storePassword)}'\n` +
    `            keyAlias '${quoteGroovy(signing.keyAlias)}'\n` +
    `            keyPassword '${quoteGroovy(signing.keyPassword)}'\n` +
    `        }\n`;

  let result = gradleText;
  if (/signingConfigs\s*\{/.test(result)) {
    // Кладём release первым внутри существующего блока — рядом с debug,
    // который сгенерировал шаблон Expo.
    result = result.replace(/signingConfigs\s*\{\s*\n/, (match) => `${match}${releaseSigningBlock}`);
  } else {
    // Блока нет вовсе — заводим перед buildTypes.
    result = result.replace(
      /buildTypes\s*\{/,
      `signingConfigs {\n${releaseSigningBlock}    }\n\n    buildTypes {`,
    );
  }

  // Внутри buildTypes.release заменяем именно его signingConfig, а не
  // случайно попавшийся в buildTypes.debug: нежадный поиск после "release {"
  // останавливается на первом же вхождении, которое и есть строка блока
  // release — debug стоит в исходнике раньше и в этот срез не попадает.
  result = result.replace(
    /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig\s+signingConfigs\.debug/,
    '$1signingConfig signingConfigs.release',
  );

  return result;
}

module.exports = { REQUIRED_ENV_NAMES, releaseSigningEnv, applyReleaseSigning };
