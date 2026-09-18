// Config-плагин Expo: собирать нативный код только под ARM-телефоны.
//
// Регистрируется в `app.config.ts`. Логика — чистые функции в
// `gradle-architectures.js`, покрытые node:test; здесь только обвязка
// `withGradleProperties`. Под эмулятор: `ANDROID_ARCHITECTURES=x86_64`
// перед `expo prebuild`.
const { withGradleProperties } = require('expo/config-plugins');
const {
  applyArchitectures,
  resolveArchitectures,
} = require('./gradle-architectures');

/** @type {import('expo/config-plugins').ConfigPlugin} */
function withAndroidArchitectures(config) {
  const architectures = resolveArchitectures(process.env.ANDROID_ARCHITECTURES);
  return withGradleProperties(config, (modConfig) => {
    modConfig.modResults = applyArchitectures(
      modConfig.modResults,
      architectures,
    );
    return modConfig;
  });
}

module.exports = withAndroidArchitectures;
