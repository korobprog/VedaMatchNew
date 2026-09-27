// Config-плагин Expo: русские подписи уведомления «Идёт показ экрана»
// (VED-360). Логика — в `screen-share-strings.js`, здесь только обвязка.
// Остальная нативная часть показа экрана — заплатка react-native-webrtc
// (`patches/react-native-webrtc@124.0.8.patch`) и разрешение
// FOREGROUND_SERVICE_MEDIA_PROJECTION в `app.config.ts`, см.
// `docs/chat-group-calls-plan.md`, раздел «Показ экрана с Android».
const { withStringsXml } = require('expo/config-plugins');
const { applyScreenShareStrings } = require('./screen-share-strings');

/** @type {import('expo/config-plugins').ConfigPlugin} */
function withScreenShare(config) {
  return withStringsXml(config, (modConfig) => {
    modConfig.modResults = applyScreenShareStrings(modConfig.modResults);
    return modConfig;
  });
}

module.exports = withScreenShare;
