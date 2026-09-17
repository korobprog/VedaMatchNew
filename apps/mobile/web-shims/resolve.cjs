// Какие нативные пакеты подменяются в веб-сборке и чем. Отдельно от
// metro.config.js, чтобы проверять без Metro: web-shims/resolve.test.mjs.
const path = require('node:path');

const WEB_SHIMS = {
  'react-native-webrtc': 'react-native-webrtc.tsx',
  'react-native-incall-manager': 'react-native-incall-manager.ts',
  '@react-native-firebase/messaging': 'firebase-messaging.ts',
};

/** Путь к подмене или `null` — пакет разрешается как обычно. */
function webShimPath(moduleName, platform) {
  if (platform !== 'web') return null;
  const file = WEB_SHIMS[moduleName];
  return file ? path.join(__dirname, file) : null;
}

module.exports = { WEB_SHIMS, webShimPath };
