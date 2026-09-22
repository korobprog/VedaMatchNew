import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import resolve from './resolve.cjs';

const { STORE_SHIMS, channelShimPath } = resolve;
const here = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.join(here, '..');

test('на канале store подменяемые модули ведут на существующие заглушки', () => {
  for (const name of Object.keys(STORE_SHIMS)) {
    const file = channelShimPath(name, 'store');
    assert.ok(file, name);
    assert.ok(existsSync(file), file);
  }
});

test('на канале site и без канала подмены нет', () => {
  for (const channel of ['site', undefined, '', 'STORE', 'мусор']) {
    for (const name of Object.keys(STORE_SHIMS)) {
      assert.equal(channelShimPath(name, channel), null, `${channel}: ${name}`);
    }
  }
});

test('прочие модули не трогаются даже на store', () => {
  assert.equal(channelShimPath('react-native', 'store'), null);
  assert.equal(channelShimPath('@/components/self-update/self-update-section/extra', 'store'), null);
  assert.equal(channelShimPath('@/config/capabilities', 'store'), null);
});

// Подмена бессмысленна, если настоящий модуль импортируют под другим
// спецификатором: тогда store-сборка потянет его в обход заглушки.
test('подменяемый модуль импортируется в коде ровно тем спецификатором, что в таблице', () => {
  const importers = readFileSync(path.join(mobileRoot, 'src/app/(tabs)/services.tsx'), 'utf8');
  for (const name of Object.keys(STORE_SHIMS)) {
    assert.ok(importers.includes(`from '${name}'`), `${name} больше не импортируется этим спецификатором`);
  }
});
