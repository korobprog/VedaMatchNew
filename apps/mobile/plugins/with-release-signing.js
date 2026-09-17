// Config-плагин Expo: релизная подпись Android из секретов CI (VED-176).
//
// Регистрируется в `app.config.ts`. Сама подстановка текста — чистая функция
// в `gradle-release-signing.js`, покрытая node:test; здесь только обвязка
// `withAppBuildGradle`, которую без сгенерированного `android/` не запустить.
const { withAppBuildGradle } = require('expo/config-plugins');
const { applyReleaseSigning } = require('./gradle-release-signing');

/** @type {import('expo/config-plugins').ConfigPlugin} */
function withReleaseSigning(config) {
  return withAppBuildGradle(config, (modConfig) => {
    modConfig.modResults.contents = applyReleaseSigning(
      modConfig.modResults.contents,
      process.env,
    );
    return modConfig;
  });
}

module.exports = withReleaseSigning;
