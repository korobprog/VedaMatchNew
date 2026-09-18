import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const {
  DEFAULT_ARCHITECTURES,
  applyArchitectures,
  resolveArchitectures,
} = require('./gradle-architectures.js');

test('по умолчанию — только ARM, без x86 и x86_64', () => {
  assert.deepEqual(resolveArchitectures(undefined), ['armeabi-v7a', 'arm64-v8a']);
  assert.deepEqual(resolveArchitectures(''), ['armeabi-v7a', 'arm64-v8a']);
  assert.deepEqual(resolveArchitectures(' , '), ['armeabi-v7a', 'arm64-v8a']);
});

test('умолчание не отдаётся общим массивом, который можно испортить', () => {
  const first = resolveArchitectures('');
  first.push('x86');
  assert.deepEqual(resolveArchitectures(''), ['armeabi-v7a', 'arm64-v8a']);
  assert.deepEqual(DEFAULT_ARCHITECTURES, ['armeabi-v7a', 'arm64-v8a']);
});

test('переменная окружения задаёт свой набор, пробелы и повторы убираются', () => {
  assert.deepEqual(resolveArchitectures('x86_64'), ['x86_64']);
  assert.deepEqual(resolveArchitectures(' arm64-v8a , x86_64,arm64-v8a '), [
    'arm64-v8a',
    'x86_64',
  ]);
});

test('неизвестная архитектура — ошибка с её именем', () => {
  assert.throws(() => resolveArchitectures('arm64'), /arm64/);
  assert.throws(() => resolveArchitectures('arm64-v8a,mips'), /mips/);
});

test('существующее свойство заменяется на месте, остальное не трогается', () => {
  const input = [
    { type: 'comment', value: 'шаблон' },
    {
      type: 'property',
      key: 'reactNativeArchitectures',
      value: 'armeabi-v7a,arm64-v8a,x86,x86_64',
    },
    { type: 'property', key: 'newArchEnabled', value: 'true' },
  ];
  const snapshot = structuredClone(input);
  const out = applyArchitectures(input, ['armeabi-v7a', 'arm64-v8a']);
  assert.deepEqual(out, [
    { type: 'comment', value: 'шаблон' },
    {
      type: 'property',
      key: 'reactNativeArchitectures',
      value: 'armeabi-v7a,arm64-v8a',
    },
    { type: 'property', key: 'newArchEnabled', value: 'true' },
  ]);
  assert.deepEqual(input, snapshot, 'исходный массив не изменён');
});

test('отсутствующее свойство дописывается в конец ровно один раз', () => {
  const out = applyArchitectures(
    [{ type: 'property', key: 'hermesEnabled', value: 'true' }],
    ['arm64-v8a'],
  );
  assert.deepEqual(out, [
    { type: 'property', key: 'hermesEnabled', value: 'true' },
    { type: 'property', key: 'reactNativeArchitectures', value: 'arm64-v8a' },
  ]);
});

test('комментарий с тем же текстом не считается свойством', () => {
  const out = applyArchitectures(
    [{ type: 'comment', value: 'reactNativeArchitectures' }],
    ['arm64-v8a'],
  );
  assert.equal(out.length, 2);
  assert.equal(out[1].key, 'reactNativeArchitectures');
});
