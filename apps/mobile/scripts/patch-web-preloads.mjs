#!/usr/bin/env node
// Постобработка `expo export --platform web` (веха 6 «Скорость»,
// gan-harness/spec.md, запускается из `export:web` сразу после экспорта).
//
// С `asyncRoutes.web` (app.config.ts) маршрутизатор режет каждый файл
// `src/app/**` на отдельный чанк и запрашивает их динамически в рантайме —
// то есть браузер узнаёт о существовании чанка входа/layout'ов только после
// того, как ВЫПОЛНИТСЯ весь уже загруженный JS. На медленной сети (веха
// мерялась при 1,6 Мбит) это лишний оборот сети на каждый такой файл — а
// чанки экрана входа и обоих layout'ов маршрутизатора нужны в 100% случаев,
// гость там пользователь или уже вошёл. Тег `<link rel="preload" as="script">`
// в `<head>` запускает их закачку сразу, параллельно с `__common`/
// entry-бандлом, а не после него.
//
// Не `rel="modulepreload"`: чанки Metro — не нативные ES-модули, рантайм
// (`@expo/metro-runtime`) грузит их обычным `document.createElement('script')`
// (classic script, без `type="module"`). Ресурс из `modulepreload` браузер
// кладёт в отдельный кэш как модуль и не отдаёт его этому запросу — итог
// ровно тот же полный повторный поход в сеть, который мы хотим убрать
// (проверено вручную через CDP-трейс: без этой правки преднагруженные чанки
// не переиспользовались рантаймом и грузились дважды).
//
// Список того, что предзагружать, — в web-preload-chunks.mjs (там же тест).
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDeadNativeLayoutChunk, selectPreloadChunks } from './web-preload-chunks.mjs';

const distDir = join(import.meta.dirname, '..', 'dist-web');
const jsDir = join(distDir, '_expo/static/js/web');
const indexPath = join(distDir, 'index.html');

function readJsChunkNames(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function main() {
  const chunkNames = readJsChunkNames(jsDir);
  if (chunkNames === null) {
    // Async-чанков нет вовсе (asyncRoutes выключены/сборка изменилась) —
    // предзагружать нечего, весь JS и так в одном бандле.
    console.warn(`patch-web-preloads: ${jsDir} не найден, пропускаю`);
    return;
  }

  const candidates = selectPreloadChunks(chunkNames);
  if (candidates.length === 0) {
    console.warn('patch-web-preloads: не нашли чанки login/auth/_layout — экспорт изменился?');
    return;
  }

  // `_layout.native.tsx` (см. комментарий в файле) даёт свой чанк, но веб
  // ни разу его не запрашивает в рантайме — предзагружать нечего греть,
  // это просто отбирало бы полосу у нужных файлов на медленной сети.
  const preload = candidates.filter((name) => !isDeadNativeLayoutChunk(readFileSync(join(jsDir, name), 'utf8')));

  let html = readFileSync(indexPath, 'utf8');
  if (html.includes('data-web-speed-preload')) return; // уже пропатчено

  const links = preload
    .map((name) => `    <link rel="preload" as="script" href="/_expo/static/js/web/${name}" data-web-speed-preload />`)
    .join('\n');
  html = html.replace('</head>', `${links}\n  </head>`);
  writeFileSync(indexPath, html);
  console.log(`patch-web-preloads: добавлено ${preload.length} preload as=script (${preload.join(', ')})`);
}

main();
