import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  EXCLUDED_SERVICES,
  servicesFromPaths,
} from './changed-paths-to-services.mjs';

test('веб-путь без маршрутной группы → сервис', () => {
  assert.deepEqual(
    servicesFromPaths(['apps/web/src/app/library/page.tsx']),
    ['library'],
  );
});

test('веб-путь внутри маршрутной группы Next.js → сервис', () => {
  assert.deepEqual(
    servicesFromPaths(['apps/web/src/app/(portal)/market/page.tsx']),
    ['market'],
  );
});

test('веб-путь с несколькими вложенными группами → сервис', () => {
  assert.deepEqual(
    servicesFromPaths(['apps/web/src/app/(portal)/(sub)/market/page.tsx']),
    ['market'],
  );
});

test('путь компонентов веба → сервис', () => {
  assert.deepEqual(
    servicesFromPaths(['apps/web/src/components/market/price-tag.tsx']),
    ['market'],
  );
});

test('путь API-модуля → сервис', () => {
  assert.deepEqual(
    servicesFromPaths(['apps/api/src/modules/market/market.controller.ts']),
    ['market'],
  );
});

test('путь портальной инфраструктуры не попадает в список', () => {
  for (const service of EXCLUDED_SERVICES) {
    assert.deepEqual(
      servicesFromPaths([`apps/api/src/modules/${service}/x.ts`]),
      [],
      `${service} должен быть исключён`,
    );
  }
});

test('несервисный путь не попадает в список', () => {
  assert.deepEqual(
    servicesFromPaths(['packages/shared/src/index.ts', '.github/workflows/ci.yml']),
    [],
  );
});

test('файл прямо в корне app/ или группы — не сервис', () => {
  assert.deepEqual(
    servicesFromPaths([
      'apps/web/src/app/layout.tsx',
      'apps/web/src/app/(portal)/layout.tsx',
    ]),
    [],
  );
});

test('один и тот же сервис из веба и API схлопывается в одну запись', () => {
  assert.deepEqual(
    servicesFromPaths([
      'apps/web/src/app/market/page.tsx',
      'apps/api/src/modules/market/market.controller.ts',
      'apps/web/src/components/market/price-tag.tsx',
    ]),
    ['market'],
  );
});

test('путь apps/mobile/** не считается вебом', () => {
  assert.deepEqual(
    servicesFromPaths(['apps/mobile/src/app/(tabs)/services.tsx']),
    [],
  );
});

test('несколько разных сервисов сохраняют порядок появления', () => {
  assert.deepEqual(
    servicesFromPaths([
      'apps/api/src/modules/notices/notices.controller.ts',
      'apps/web/src/app/(portal)/market/page.tsx',
    ]),
    ['notices', 'market'],
  );
});

test('пустой и не-массивовый вход не бросает исключение', () => {
  assert.deepEqual(servicesFromPaths([]), []);
  assert.deepEqual(servicesFromPaths(undefined), []);
});
