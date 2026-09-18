import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CATALOG_SERVICES } from './changed-paths-to-services.mjs';
import {
  CHECKLIST_ITEMS,
  SERVICE_NAMES,
  buildCardBody,
  buildCardFullTitle,
  buildCardTitle,
  buildCommentBody,
} from './card-content.mjs';

test('заголовок для известного сервиса — человеческое имя', () => {
  assert.equal(buildCardTitle('market'), 'ДОГНАТЬ. Рынок:');
});

test('заголовок для сервиса без записи в маппинге — fallback на слаг, не бросает исключение', () => {
  assert.equal(buildCardTitle('gitabase'), 'ДОГНАТЬ. gitabase:');
});

test('каждый сервис каталога имеет русское имя', () => {
  for (const [slug, name] of Object.entries(SERVICE_NAMES)) {
    assert.ok(name.length > 0, `${slug} должен иметь непустое имя`);
  }
});

test('SERVICE_NAMES покрывает ровно CATALOG_SERVICES — ни пропуска, ни лишнего', () => {
  assert.deepEqual(
    Object.keys(SERVICE_NAMES).sort(),
    [...CATALOG_SERVICES].sort(),
  );
});

test('полный заголовок дополняет префикс summary из PR', () => {
  assert.equal(
    buildCardFullTitle('market', 'Новый фильтр по цене'),
    'ДОГНАТЬ. Рынок: Новый фильтр по цене',
  );
});

test('полный заголовок без summary — просто префикс', () => {
  assert.equal(buildCardFullTitle('market', ''), 'ДОГНАТЬ. Рынок:');
  assert.equal(buildCardFullTitle('market', undefined), 'ДОГНАТЬ. Рынок:');
});

test('тело карточки содержит ссылку на PR и хотя бы один путь', () => {
  const body = buildCardBody({
    service: 'market',
    prUrl: 'https://github.com/korobprog/VedaMatchNew/pull/400',
    prTitle: 'Фильтр по цене',
    changedPaths: ['apps/web/src/app/market/page.tsx'],
  });
  assert.match(body, /https:\/\/github\.com\/korobprog\/VedaMatchNew\/pull\/400/);
  assert.match(body, /apps\/web\/src\/app\/market\/page\.tsx/);
});

// Раунд 001, Н5: три взаимоисключающих пункта в одном markdown-чек-листе
// сбивали исполнителя карточки. Настоящий чек-лист доски («перенести в
// приложение» / «не нужно в приложении») заводится отдельным запросом в
// run.mjs (CHECKLIST_ITEMS), а в теле — только пояснение для сервисов,
// которые в приложении пока открываются внешней ссылкой.
test('CHECKLIST_ITEMS — ровно два пункта настоящего чек-листа доски', () => {
  assert.deepEqual(CHECKLIST_ITEMS, ['перенести в приложение', 'не нужно в приложении']);
});

test('тело карточки не содержит markdown-чекбоксов — только пояснение про ссылку', () => {
  const body = buildCardBody({
    service: 'market',
    prUrl: 'https://example.invalid/pr/1',
    prTitle: 'x',
    changedPaths: ['a'],
  });
  assert.doesNotMatch(body, /- \[ \]/);
  assert.match(body, /достаточно проверить, что ссылка жива/);
});

test('длинный список путей (>15) обрезается с «и ещё N»', () => {
  const changedPaths = Array.from({ length: 18 }, (_, i) => `apps/web/src/app/market/file-${i}.tsx`);
  const body = buildCardBody({
    service: 'market',
    prUrl: 'https://example.invalid/pr/1',
    prTitle: 'x',
    changedPaths,
  });
  assert.match(body, /и ещё 3 путей/);
  // Ровно 15 путей показаны построчно, а не все 18.
  assert.equal((body.match(/^- `apps\/web/gm) ?? []).length, 15);
});

test('пустой список путей не бросает исключение', () => {
  const body = buildCardBody({
    service: 'market',
    prUrl: 'https://example.invalid/pr/1',
    prTitle: 'x',
    changedPaths: [],
  });
  assert.match(body, /список путей пуст/);
});

test('комментарий к существующей карточке содержит ссылку на новый PR и пути, без чек-листа', () => {
  const comment = buildCommentBody({
    prUrl: 'https://example.invalid/pr/2',
    prTitle: 'Второй PR',
    changedPaths: ['apps/api/src/modules/market/market.controller.ts'],
  });
  assert.match(comment, /https:\/\/example\.invalid\/pr\/2/);
  assert.match(comment, /apps\/api\/src\/modules\/market\/market\.controller\.ts/);
  assert.doesNotMatch(comment, /перенести в приложение/);
});
