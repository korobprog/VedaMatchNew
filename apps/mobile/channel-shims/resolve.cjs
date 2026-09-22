// Какие модули подменяются заглушкой в сборке витрины (`APP_CHANNEL=store`,
// VED-207) и чем. Отдельно от metro.config.js, чтобы проверять без Metro:
// channel-shims/resolve.test.mjs. Устроено так же, как web-shims/resolve.cjs.
//
// Зачем подмена, если экран и так закрыт проверкой возможности: `if` в JSX
// прячет кнопку, но не выкидывает модуль из бандла. Код самообновления,
// адрес манифеста `latest.json` и подписи вроде «Скачать» остаются в APK
// витрины и видны любому, кто его распакует, — а Google Play читает и
// строки тоже. Подмена на уровне резолвера убирает из графа сам модуль:
// `use-self-update.ts`, загрузчик и установщик APK становятся недостижимы и
// в бандл не попадают.
//
// Правило: подменяется то, что экран рендерит по возможности канала, и
// подменяется целиком компонентом-заглушкой с той же сигнатурой.
const path = require('node:path');

/** Спецификатор импорта → файл заглушки рядом с этим модулем. */
const STORE_SHIMS = {
  '@/components/self-update/self-update-section': 'self-update-section.tsx',
};

/**
 * Путь к заглушке или `null` — модуль резолвится как обычно.
 *
 * Канал приходит сырой строкой из окружения: подменяем только на точном
 * `store`, всё остальное (пусто, мусор, `site`) — обычная сборка с сайта.
 * Ругаться на мусор здесь незачем — это делает `resolveVariant` в
 * `app.config.ts`, и сборка падает там раньше, чем Metro дойдёт до графа.
 */
function channelShimPath(moduleName, channel) {
  if (channel !== 'store') return null;
  const file = STORE_SHIMS[moduleName];
  return file ? path.join(__dirname, file) : null;
}

module.exports = { STORE_SHIMS, channelShimPath };
