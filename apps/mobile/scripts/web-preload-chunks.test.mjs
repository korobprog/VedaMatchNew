// node --test apps/mobile/scripts/web-preload-chunks.test.mjs
// (или `pnpm --filter @vedamatch/mobile test:web-preload-chunks`).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isDeadNativeLayoutChunk, selectPreloadChunks } from './web-preload-chunks.mjs';

test('selectPreloadChunks: берёт оба layout, login и auth', () => {
  const files = [
    '__common-abc123.js',
    '__expo-metro-runtime-abc123.js',
    'index-abc123.js', // корневой entry-бандл (уже загружен тегом <script>)
    '_layout-111.js',
    '_layout-222.js',
    'login-333.js',
    'auth-444.js',
    'account-555.js',
    'calls-probe-666.js',
    'communities-777.js',
    '[id]-888.js',
  ];
  assert.deepEqual(selectPreloadChunks(files), ['_layout-111.js', '_layout-222.js', 'auth-444.js', 'login-333.js']);
});

test('selectPreloadChunks: игнорирует не-.js файлы', () => {
  const files = ['login-abc.js.map', 'login-abc.js'];
  assert.deepEqual(selectPreloadChunks(files), ['login-abc.js']);
});

test('selectPreloadChunks: пустой список чанков — пустой результат, без исключений', () => {
  assert.deepEqual(selectPreloadChunks([]), []);
});

test('isDeadNativeLayoutChunk: находит по пути пакета @expo-google-fonts', () => {
  assert.equal(isDeadNativeLayoutChunk('n(require("../node_modules/@expo-google-fonts/manrope/400Regular"))'), true);
});

test('isDeadNativeLayoutChunk: веб-версия layout без useFonts — не дубль', () => {
  assert.equal(isDeadNativeLayoutChunk('function RootLayout(){return React.createElement(Stack,null)}'), false);
});
