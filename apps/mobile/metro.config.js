// Две подмены модулей на уровне резолвера Metro:
//  - веб-сборка (ios.vedamatch.com): нативные пакеты без поддержки браузера
//    подменяются тонкими обёртками из web-shims/;
//  - сборка витрины (APP_CHANNEL=store, VED-207): модули возможностей, которых
//    на канале `store` быть не должно, подменяются заглушками из
//    channel-shims/ — чтобы их не было и в бандле, а не только на экране.
// Android и iOS канала `site` не затрагиваются.
const { getDefaultConfig } = require('expo/metro-config');
const { channelShimPath } = require('./channel-shims/resolve.cjs');
const { webShimPath } = require('./web-shims/resolve.cjs');

const config = getDefaultConfig(__dirname);

// Канал читается один раз при старте Metro: в сборку он зашивается той же
// переменной окружения в app.config.ts и посреди бандлинга не меняется.
const channel = process.env.APP_CHANNEL;

const upstream = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const shim = webShimPath(moduleName, platform) ?? channelShimPath(moduleName, channel);
  if (shim) return { type: 'sourceFile', filePath: shim };
  return (upstream ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
