import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
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

test('тело карточки содержит чек-лист из трёх пунктов', () => {
  const body = buildCardBody({
    service: 'market',
    prUrl: 'https://example.invalid/pr/1',
    prTitle: 'x',
    changedPaths: ['a'],
  });
  assert.match(body, /- \[ \] перенести в приложение/);
  assert.match(body, /- \[ \] в приложении это ссылка — проверить, что ссылка жива/);
  assert.match(body, /- \[ \] не нужно в приложении/);
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
