// Тесты чистой геометрии генератора ассетов (VED-173).
//
// Это НЕ *.spec.ts под jest-expo: скрипт живёт в `scripts/`, а
// `apps/mobile/package.json` гоняет jest только по `src/**/*.spec.ts`
// (см. `jest.testMatch`). Кладём модуль и тест рядом в `scripts/` и гоняем
// его напрямую движком Node (`node:test`), без Jest и без сборки:
//
//   node --test apps/mobile/scripts/brand-geometry.test.mjs
//
// (или `pnpm --filter @vedamatch/mobile test:brand-geometry`, см. package.json).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { maxCornerDistanceFromMask, safeContainRatio, silhouettePixel } from './brand-geometry.mjs';

test('maxCornerDistanceFromMask: пустая маска даёт 0', () => {
  const mask = new Uint8Array(4 * 4);
  assert.equal(maxCornerDistanceFromMask(mask, 4, 4), 0);
});

test('maxCornerDistanceFromMask: один пиксель в геометрическом центре 2×2 — расстояние от центра холста до центра пикселя', () => {
  // Холст 2×2, центр (1,1). Пиксель (0,0) — центр пикселя в (0.5,0.5).
  const mask = [1, 0, 0, 0];
  const d = maxCornerDistanceFromMask(mask, 2, 2);
  assert.ok(Math.abs(d - Math.hypot(0.5, 0.5)) < 1e-9);
});

test('maxCornerDistanceFromMask: берёт САМЫЙ дальний пиксель, а не любой', () => {
  // 4×4, центр (2,2). Пиксель (3,3) дальше, чем (2,2)/(2,3).
  const width = 4;
  const height = 4;
  const mask = new Uint8Array(width * height);
  const set = (x, y) => {
    mask[y * width + x] = 1;
  };
  set(2, 2);
  set(3, 3);
  const near = Math.hypot(0.5, 0.5); // (2,2) -> центр пикселя (2.5,2.5)
  const far = Math.hypot(1.5, 1.5); // (3,3) -> центр пикселя (3.5,3.5)
  assert.ok(far > near);
  assert.equal(maxCornerDistanceFromMask(mask, width, height), far);
});

test('maxCornerDistanceFromMask: несовпадение длины маски с width*height — ошибка', () => {
  assert.throws(() => maxCornerDistanceFromMask([1, 0, 0], 2, 2));
});

test('safeContainRatio: воспроизводит расчёт из VED-173 (обрезанный знак 488×438, круг 66%, запас 0.9)', () => {
  // Числа сняты со `apps/web/public/brand/mark.png` при пороге альфы 10:
  // после `sharp().trim()` рамка 488×438, самый дальний пиксель («хвост»
  // левого плеча шеврона) на расстоянии ~326.53 от центра рамки.
  const ratio = safeContainRatio({
    maxCornerDistance: 326.5348373451139,
    referenceDimension: 488,
    safeDiameterRatio: 0.66,
    margin: 0.9,
  });
  // 0.33 * 488 * 0.9 / 326.5348... ≈ 0.4437
  assert.ok(Math.abs(ratio - 0.4437) < 0.001, `неожиданный ratio: ${ratio}`);
});

test('safeContainRatio: margin=1 кладёт самый дальний пиксель ровно на границу безопасного круга', () => {
  const maxCornerDistance = 100;
  const referenceDimension = 200;
  const safeDiameterRatio = 0.5;
  const ratio = safeContainRatio({ maxCornerDistance, referenceDimension, safeDiameterRatio, margin: 1 });
  // Доля (ratio * maxCornerDistance) от referenceDimension — это то, на какую
  // долю холста «дотягивается» самый дальний пиксель после масштабирования;
  // при margin=1 она должна совпасть точно с радиусом безопасной зоны
  // (половиной safeDiameterRatio), без запаса.
  const scaledMaxDistanceShare = (ratio * maxCornerDistance) / referenceDimension;
  assert.ok(Math.abs(scaledMaxDistanceShare - safeDiameterRatio / 2) < 1e-9);
});

test('safeContainRatio: меньший margin даёт меньший (более безопасный) ratio', () => {
  const base = { maxCornerDistance: 300, referenceDimension: 500, safeDiameterRatio: 0.66 };
  const loose = safeContainRatio({ ...base, margin: 1 });
  const tight = safeContainRatio({ ...base, margin: 0.9 });
  assert.ok(tight < loose);
});

test('safeContainRatio: отрицательные/нулевые входы — ошибка', () => {
  assert.throws(() => safeContainRatio({ maxCornerDistance: 0, referenceDimension: 10, safeDiameterRatio: 0.5 }));
  assert.throws(() => safeContainRatio({ maxCornerDistance: 10, referenceDimension: 10, safeDiameterRatio: 0 }));
  assert.throws(() => safeContainRatio({ maxCornerDistance: 10, referenceDimension: 10, safeDiameterRatio: 1.5 }));
});

test('silhouettePixel: непрозрачный пиксель получает новый цвет и сохраняет альфу', () => {
  assert.deepEqual(
    silhouettePixel([10, 20, 30, 255], { color: [255, 255, 255] }),
    [255, 255, 255, 255],
  );
});

test('silhouettePixel: полупрозрачный край выше порога — цвет меняется, альфа сохраняется (без ореола)', () => {
  assert.deepEqual(
    silhouettePixel([10, 20, 30, 40], { color: [255, 255, 255], threshold: 10 }),
    [255, 255, 255, 40],
  );
});

test('silhouettePixel: пиксель на/ниже порога стирается полностью (не оставляет полупрозрачный шум)', () => {
  assert.deepEqual(
    silhouettePixel([10, 20, 30, 10], { color: [255, 255, 255], threshold: 10 }),
    [0, 0, 0, 0],
  );
  assert.deepEqual(
    silhouettePixel([10, 20, 30, 0], { color: [255, 255, 255] }),
    [0, 0, 0, 0],
  );
});

test('silhouettePixel: color не из трёх компонент — ошибка', () => {
  assert.throws(() => silhouettePixel([1, 2, 3, 255], { color: [255, 255] }));
});
