import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import resolve from './resolve.cjs';

const { WEB_SHIMS, webShimPath } = resolve;

test('на вебе нативные пакеты подменяются существующими файлами', () => {
  for (const name of Object.keys(WEB_SHIMS)) {
    const file = webShimPath(name, 'web');
    assert.ok(file, name);
    assert.ok(existsSync(file), file);
  }
});

test('Android и iOS получают настоящие пакеты', () => {
  for (const platform of ['android', 'ios']) {
    for (const name of Object.keys(WEB_SHIMS)) {
      assert.equal(webShimPath(name, platform), null, `${platform}: ${name}`);
    }
  }
});

test('прочие пакеты на вебе не трогаются', () => {
  assert.equal(webShimPath('react-native', 'web'), null);
  assert.equal(webShimPath('react-native-webrtc/lib', 'web'), null);
});
