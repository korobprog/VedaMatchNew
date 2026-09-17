// Веб-сборка (ios.vedamatch.com): нативные пакеты без поддержки браузера
// подменяются тонкими обёртками из web-shims/. Android и iOS не затрагиваются.
const { getDefaultConfig } = require('expo/metro-config');
const { webShimPath } = require('./web-shims/resolve.cjs');

const config = getDefaultConfig(__dirname);

const upstream = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const shim = webShimPath(moduleName, platform);
  if (shim) return { type: 'sourceFile', filePath: shim };
  return (upstream ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
