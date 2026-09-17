// Веб-сборка (ios.vedamatch.com): нативные пакеты без поддержки браузера
// подменяются тонкими обёртками из web-shims/. Android и iOS не затрагиваются.
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const WEB_SHIMS = {
  'react-native-webrtc': 'react-native-webrtc.tsx',
  'react-native-incall-manager': 'react-native-incall-manager.ts',
  '@react-native-firebase/messaging': 'firebase-messaging.ts',
};

const upstream = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && WEB_SHIMS[moduleName]) {
    return { type: 'sourceFile', filePath: path.join(__dirname, 'web-shims', WEB_SHIMS[moduleName]) };
  }
  return (upstream ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
