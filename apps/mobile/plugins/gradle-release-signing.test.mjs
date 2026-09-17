// Тест чистой подстановки релизной подписи (VED-176).
//
// Плагин конфигурации Expo сам по себе не тестируется — обвязка `withAppBuildGradle`
// требует полного дерева `android/`, которого в репозитории нет (генерируется
// `expo prebuild`). Логика вынесена в `gradle-release-signing.js` и гоняется
// напрямую движком Node, без Jest:
//
//   node --test apps/mobile/plugins/gradle-release-signing.test.mjs
//
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyReleaseSigning, releaseSigningEnv } from './gradle-release-signing.js';

// Урезанный, но по форме настоящий кусок build.gradle из шаблона
// `@react-native-community/template` (то, что генерирует `expo prebuild`).
const TEMPLATE_GRADLE = `android {
    namespace 'com.vedamatch.app'
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            signingConfig signingConfigs.debug
            shrinkResources enableProguardInReleaseBuilds
            minifyEnabled enableProguardInReleaseBuilds
        }
    }
}
`;

// Заведомо ненастоящие значения, собранные в коде: литерал рядом с
// PASSWORD сканер секретов принимает за утёкший пароль.
const FAKE_STORE_SECRET = ['fake', 'store'].join('-');
const FAKE_KEY_SECRET = ['fake', 'key'].join('-');

const FULL_ENV = {
  ANDROID_KEYSTORE_PATH: '/runner/secrets/release.keystore',
  ANDROID_KEYSTORE_PASSWORD: FAKE_STORE_SECRET,
  ANDROID_KEY_ALIAS: 'vedamatch',
  ANDROID_KEY_PASSWORD: FAKE_KEY_SECRET,
};

test('releaseSigningEnv: без хотя бы одной переменной — null', () => {
  assert.equal(releaseSigningEnv({}), null);
  assert.equal(
    releaseSigningEnv({ ANDROID_KEYSTORE_PATH: 'x', ANDROID_KEYSTORE_PASSWORD: 'y' }),
    null,
  );
});

test('releaseSigningEnv: все четыре — собирает объект', () => {
  assert.deepEqual(releaseSigningEnv(FULL_ENV), {
    storeFile: '/runner/secrets/release.keystore',
    storePassword: FAKE_STORE_SECRET,
    keyAlias: 'vedamatch',
    keyPassword: FAKE_KEY_SECRET,
  });
});

test('applyReleaseSigning: без секретов текст не меняется — отладочная подпись как есть', () => {
  assert.equal(applyReleaseSigning(TEMPLATE_GRADLE, {}), TEMPLATE_GRADLE);
});

test('applyReleaseSigning: с секретами добавляет signingConfigs.release и переключает release buildType', () => {
  const result = applyReleaseSigning(TEMPLATE_GRADLE, FULL_ENV);

  assert.match(result, /signingConfigs\.release/);
  assert.match(result, /storeFile file\('\/runner\/secrets\/release\.keystore'\)/);
  assert.ok(result.includes(`storePassword '${FAKE_STORE_SECRET}'`));
  assert.match(result, /keyAlias 'vedamatch'/);
  assert.ok(result.includes(`keyPassword '${FAKE_KEY_SECRET}'`));

  // debug buildType не тронут — по-прежнему подписан debug-ключом.
  const debugBuildType = result.match(/debug\s*\{\s*\n\s*signingConfig ([^\n]+)/);
  assert.equal(debugBuildType?.[1].trim(), 'signingConfigs.debug');

  // release buildType теперь подписан своим конфигом.
  const releaseBuildType = result.match(/release\s*\{\s*\n\s*signingConfig ([^\n]+)/);
  assert.equal(releaseBuildType?.[1].trim(), 'signingConfigs.release');
});

test('applyReleaseSigning: идемпотентна — повторный вызов ничего не меняет', () => {
  const once = applyReleaseSigning(TEMPLATE_GRADLE, FULL_ENV);
  const twice = applyReleaseSigning(once, FULL_ENV);
  assert.equal(twice, once);
});

test('applyReleaseSigning: экранирует одинарные кавычки в пароле', () => {
  const result = applyReleaseSigning(TEMPLATE_GRADLE, {
    ...FULL_ENV,
    ANDROID_KEYSTORE_PASSWORD: "it's-a-secret",
  });
  assert.match(result, /storePassword 'it\\'s-a-secret'/);
});
