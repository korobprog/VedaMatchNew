// node --test apps/mobile/scripts/release-version.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_VERSION_CODE,
  PRODUCTION_VERSION_CODE_BASE,
  resolveDownloadBaseUrl,
  resolveVersionCode,
} from './release-version.mjs';

test('по умолчанию боевая база 1000 + номер запуска', () => {
  assert.equal(PRODUCTION_VERSION_CODE_BASE, 1000);
  assert.equal(resolveVersionCode({ base: '', runNumber: '42', publish: true, testFolder: false }), 1042);
  assert.equal(resolveVersionCode({ base: undefined, runNumber: 42, publish: false, testFolder: false }), 1042);
  assert.equal(resolveVersionCode({ base: '1000', runNumber: '12', publish: true, testFolder: false }), 1012);
});

test('ведущий ноль запрещён — никакой восьмеричной ловушки', () => {
  assert.throws(() => resolveVersionCode({ base: '0100', runNumber: '1', publish: false, testFolder: true }), /без ведущих нулей/);
  assert.throws(() => resolveVersionCode({ base: '08', runNumber: '1', publish: false, testFolder: true }), /без ведущих нулей/);
  assert.throws(() => resolveVersionCode({ base: '0', runNumber: '1', publish: false, testFolder: true }), /без ведущих нулей/);
});

test('не число — понятная ошибка', () => {
  for (const base of ['abc', '1e3', '-5', '10.5', '0x10', '1 000']) {
    assert.throws(() => resolveVersionCode({ base, runNumber: '1', publish: false, testFolder: false }), /целое десятичное/, base);
  }
});

test('большая база без test_folder при publish=true запрещена', () => {
  assert.throws(
    () => resolveVersionCode({ base: '2000', runNumber: '12', publish: true, testFolder: false }),
    /publish=true без test_folder=true запрещена/,
  );
  // Меньшая база при боевой публикации — тоже нет: только 1000.
  assert.throws(() => resolveVersionCode({ base: '500', runNumber: '12', publish: true, testFolder: false }), /запрещена/);
});

test('большая база разрешена с тестовой папкой или без публикации', () => {
  assert.equal(resolveVersionCode({ base: '2000', runNumber: '12', publish: true, testFolder: true }), 2012);
  assert.equal(resolveVersionCode({ base: '2000', runNumber: '12', publish: false, testFolder: false }), 2012);
});

test('номер запуска обязателен и положителен', () => {
  assert.throws(() => resolveVersionCode({ base: '1000', runNumber: '', publish: false, testFolder: false }), /GITHUB_RUN_NUMBER/);
  assert.throws(() => resolveVersionCode({ base: '1000', runNumber: '0', publish: false, testFolder: false }), /GITHUB_RUN_NUMBER/);
});

test('потолок versionCode Android', () => {
  assert.equal(resolveVersionCode({ base: String(MAX_VERSION_CODE - 1), runNumber: '1', publish: false, testFolder: true }), MAX_VERSION_CODE);
  assert.throws(
    () => resolveVersionCode({ base: String(MAX_VERSION_CODE), runNumber: '1', publish: false, testFolder: true }),
    /больше предела/,
  );
});

test('адрес раздачи: только site, хвостовой слэш не удваивается, test_folder добавляет /test', () => {
  const s3 = 'https://s3.example.com/bucket';
  assert.equal(resolveDownloadBaseUrl({ channel: 'site', s3PublicUrl: s3, testFolder: false }), s3);
  assert.equal(resolveDownloadBaseUrl({ channel: 'site', s3PublicUrl: `${s3}/`, testFolder: true }), `${s3}/test`);
  assert.equal(resolveDownloadBaseUrl({ channel: 'site', s3PublicUrl: `${s3}//`, testFolder: false }), s3);
  assert.equal(resolveDownloadBaseUrl({ channel: 'store', s3PublicUrl: s3, testFolder: true }), '');
  assert.equal(resolveDownloadBaseUrl({ channel: 'site', s3PublicUrl: '', testFolder: true }), '');
});
