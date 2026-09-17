// Тесты чистой части манифеста самообновления (VED-176):
//
//   node --test apps/mobile/scripts/app-manifest.test.mjs
//
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  apkObjectKey,
  buildAppManifest,
  DEFAULT_MIN_ANDROID,
  manifestObjectKey,
  objectKeyPrefix,
} from './app-manifest.mjs';

const VALID = {
  versionName: '0.1.0+abc1234',
  versionCode: 21042,
  sizeBytes: 42 * 1024 * 1024,
  sha256: 'a'.repeat(64),
  url: 'https://cdn.example.com/mobile/android/ru-site/vedamatch-0.1.0-21042.apk',
  commit: 'abc1234',
  builtAt: '2026-09-17T12:00:00.000Z',
};

test('objectKeyPrefix: контур и канал через дефис', () => {
  assert.equal(objectKeyPrefix('ru', 'site'), 'mobile/android/ru-site');
  assert.equal(objectKeyPrefix('com', 'store'), 'mobile/android/com-store');
});

test('apkObjectKey: путь несёт версию и код версии', () => {
  assert.equal(
    apkObjectKey('ru', 'site', '0.1.0+abc1234', 21042),
    'mobile/android/ru-site/vedamatch-0.1.0+abc1234-21042.apk',
  );
});

test('manifestObjectKey: один и тот же файл для контура и канала', () => {
  assert.equal(manifestObjectKey('ru', 'site'), 'mobile/android/ru-site/latest.json');
});

test('buildAppManifest: собирает полный объект и подставляет minAndroid по умолчанию', () => {
  const manifest = buildAppManifest(VALID);
  assert.deepEqual(manifest, { ...VALID, minAndroid: DEFAULT_MIN_ANDROID });
});

test('buildAppManifest: принимает свой minAndroid', () => {
  const manifest = buildAppManifest({ ...VALID, minAndroid: '8.0' });
  assert.equal(manifest.minAndroid, '8.0');
});

test('buildAppManifest: отказывает без versionName', () => {
  assert.throws(() => buildAppManifest({ ...VALID, versionName: '' }));
});

test('buildAppManifest: отказывает на нецелом versionCode', () => {
  assert.throws(() => buildAppManifest({ ...VALID, versionCode: 1.5 }));
  assert.throws(() => buildAppManifest({ ...VALID, versionCode: 0 }));
});

test('buildAppManifest: отказывает на нецелом sizeBytes', () => {
  assert.throws(() => buildAppManifest({ ...VALID, sizeBytes: 0 }));
});

test('buildAppManifest: отказывает на невалидном sha256', () => {
  assert.throws(() => buildAppManifest({ ...VALID, sha256: 'not-a-hash' }));
  assert.throws(() => buildAppManifest({ ...VALID, sha256: 'A'.repeat(64) }));
});

test('buildAppManifest: отказывает без url и commit', () => {
  assert.throws(() => buildAppManifest({ ...VALID, url: '' }));
  assert.throws(() => buildAppManifest({ ...VALID, commit: '' }));
});

test('buildAppManifest: отказывает на невалидной builtAt', () => {
  assert.throws(() => buildAppManifest({ ...VALID, builtAt: 'вчера' }));
});
