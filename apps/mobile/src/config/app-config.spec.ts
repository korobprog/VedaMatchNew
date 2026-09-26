import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ExpoConfig } from 'expo/config';
import appConfig from '../../app.config';

type PluginEntry = string | [string, Record<string, unknown>];

function pluginOptions(config: ExpoConfig, name: string): Record<string, unknown> | undefined {
  const entry = (config.plugins as PluginEntry[] | undefined)?.find((p) =>
    Array.isArray(p) ? p[0] === name : p === name,
  );
  return Array.isArray(entry) ? entry[1] : undefined;
}

describe('app.config', () => {
  const config = appConfig({ config: {} } as never);

  // Звонкам нужны микрофон и камера. Плагины Expo умеют не только добавлять
  // разрешения, но и запрещать их для всего приложения, и такой запрет
  // молча побеждает плагин WebRTC.
  it('не запрещает микрофон и камеру', () => {
    expect(config.android?.blockedPermissions ?? []).not.toEqual(
      expect.arrayContaining(['android.permission.RECORD_AUDIO']),
    );
    expect(config.android?.blockedPermissions ?? []).not.toEqual(
      expect.arrayContaining(['android.permission.CAMERA']),
    );
  });

  it('плагин выбора фото не выключает микрофон и камеру', () => {
    const picker = pluginOptions(config, 'expo-image-picker');
    expect(picker?.microphonePermission).not.toBe(false);
    expect(picker?.cameraPermission).not.toBe(false);
  });

  it('WebRTC подключён', () => {
    const plugins = (config.plugins as PluginEntry[]).map((p) => (Array.isArray(p) ? p[0] : p));
    expect(plugins).toContain('@config-plugins/react-native-webrtc');
  });

  // VED-286: голосовые сообщения записывает `expo-audio` — `recordAudioAndroid:
  // false` не запрещает RECORD_AUDIO (его и так просит плагин webrtc выше),
  // но не даёт плагину `expo-audio` дописать `MODIFY_AUDIO_SETTINGS`.
  it('плагин expo-audio не выключает запись на Android', () => {
    const audio = pluginOptions(config, 'expo-audio');
    expect(audio?.recordAudioAndroid).not.toBe(false);
  });

  // VED-331: Медиатека играет в фоне и на экране блокировки — служба
  // переднего плана `mediaPlayback` объявляется плагином `expo-audio`.
  it('плагин expo-audio включает фоновое воспроизведение', () => {
    const audio = pluginOptions(config, 'expo-audio');
    expect(audio?.enableBackgroundPlayback).toBe(true);
  });

  it('плеер держит сеть, пока играет с погашенным экраном', () => {
    expect(config.android?.permissions ?? []).toEqual(expect.arrayContaining(['android.permission.WAKE_LOCK']));
  });

  // VED-221: входящий звонок при свёрнутом/закрытом приложении.
  it('просит разрешения self-managed ConnectionService и полноэкранного intent', () => {
    expect(config.android?.permissions ?? []).toEqual(
      expect.arrayContaining([
        'android.permission.MANAGE_OWN_CALLS',
        'android.permission.USE_FULL_SCREEN_INTENT',
        'android.permission.FOREGROUND_SERVICE',
        'android.permission.FOREGROUND_SERVICE_PHONE_CALL',
      ]),
    );
  });

  // VED-222: служба «Идёт звонок» на время разговора — Android 14 требует
  // разрешение под каждый заявленный foregroundServiceType.
  it('просит разрешения foreground-службы разговора (микрофон и камера)', () => {
    expect(config.android?.permissions ?? []).toEqual(
      expect.arrayContaining([
        'android.permission.FOREGROUND_SERVICE_MICROPHONE',
        'android.permission.FOREGROUND_SERVICE_CAMERA',
      ]),
    );
  });

  // `@expo/config-plugins` выполняет несколько `withAndroidManifest`-плагинов
  // в порядке, ОБРАТНОМ их регистрации в `plugins` (`withMod`/`withBaseMod`:
  // новый мод оборачивает предыдущий и вызывается раньше него) — чтобы
  // `with-native-calls.js` видел уже дописанные `expo-notifications`
  // `<meta-data>` (`plugins/with-native-calls.js`, п.2), он обязан стоять
  // РАНЬШЕ нее в массиве, а не позже.
  it('манифест правится раньше expo-notifications в списке — значит позже по факту выполнения', () => {
    const plugins = (config.plugins as PluginEntry[]).map((p) => (Array.isArray(p) ? p[0] : p));
    const notificationsIndex = plugins.indexOf('expo-notifications');
    const nativeCallsIndex = plugins.indexOf('./plugins/with-native-calls.js');
    expect(notificationsIndex).toBeGreaterThanOrEqual(0);
    expect(nativeCallsIndex).toBeGreaterThanOrEqual(0);
    expect(nativeCallsIndex).toBeLessThan(notificationsIndex);
  });

  // VED-176: самообновление ставит APK через системный установщик — нужно
  // REQUEST_INSTALL_PACKAGES, но только там, где секция вообще есть.
  describe('REQUEST_INSTALL_PACKAGES (VED-176)', () => {
    const previousChannel = process.env.APP_CHANNEL;

    afterEach(() => {
      if (previousChannel === undefined) delete process.env.APP_CHANNEL;
      else process.env.APP_CHANNEL = previousChannel;
    });

    it('канал site (по умолчанию) — разрешение объявлено', () => {
      delete process.env.APP_CHANNEL;
      const siteConfig = appConfig({ config: {} } as never);
      expect(siteConfig.android?.permissions ?? []).toEqual(
        expect.arrayContaining(['android.permission.REQUEST_INSTALL_PACKAGES']),
      );
    });

    it('канал store — разрешения нет вовсе (не только скрытая кнопка)', () => {
      process.env.APP_CHANNEL = 'store';
      const storeConfig = appConfig({ config: {} } as never);
      expect(storeConfig.android?.permissions ?? []).not.toEqual(
        expect.arrayContaining(['android.permission.REQUEST_INSTALL_PACKAGES']),
      );
    });
  });
});

// Сборка разработчика — отдельный пакет рядом с боевой (Samsung A51: ручная
// сборка `com.vedamatch.app` с versionCode 5025 не давала поставить ни одну
// сборку с сайта). Логика — `build-kind.ts`, здесь — что `app.config.ts`
// действительно её применяет.
describe('пакет сборки: боевая или разработчика', () => {
  const saved = { kind: process.env.APP_BUILD_KIND, gs: process.env.GOOGLE_SERVICES_JSON };
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'vm-app-config-'));
  });

  afterEach(() => {
    if (saved.kind === undefined) delete process.env.APP_BUILD_KIND;
    else process.env.APP_BUILD_KIND = saved.kind;
    if (saved.gs === undefined) delete process.env.GOOGLE_SERVICES_JSON;
    else process.env.GOOGLE_SERVICES_JSON = saved.gs;
  });

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  let fileCounter = 0;
  function configWith(env: { kind?: string; googleServices?: unknown }): ExpoConfig {
    if (env.kind === undefined) delete process.env.APP_BUILD_KIND;
    else process.env.APP_BUILD_KIND = env.kind;
    if (env.googleServices === undefined) {
      process.env.GOOGLE_SERVICES_JSON = join(dir, 'missing.json');
    } else {
      fileCounter += 1;
      const file = join(dir, `google-services-${fileCounter}.json`);
      writeFileSync(file, JSON.stringify(env.googleServices));
      process.env.GOOGLE_SERVICES_JSON = file;
    }
    return appConfig({ config: {} } as never);
  }

  const plugins = (config: ExpoConfig) =>
    (config.plugins as PluginEntry[]).map((p) => (Array.isArray(p) ? p[0] : p));
  const firebaseFor = (...packages: string[]) => ({
    project_info: { project_id: 'vedamathai' },
    client: packages.map((package_name) => ({ client_info: { android_client_info: { package_name } } })),
  });

  it('без APP_BUILD_KIND — сборка разработчика: свой пакет, имя и схема', () => {
    const config = configWith({});
    expect(config.android?.package).toBe('com.vedamatch.app.dev');
    expect(config.name).toBe('VedaMatch Dev');
    expect(config.scheme).toBe('vedamatch-dev');
  });

  it('APP_BUILD_KIND=release — боевой пакет, как у сборок с сайта и витрин', () => {
    const config = configWith({ kind: 'release' });
    expect(config.android?.package).toBe('com.vedamatch.app');
    expect(config.name).toBe('VedaMatch');
    expect(config.scheme).toBe('vedamatch');
  });

  it('опечатка в APP_BUILD_KIND роняет сборку, а не тихо даёт не тот пакет', () => {
    expect(() => configWith({ kind: 'prod' })).toThrow(/APP_BUILD_KIND/);
  });

  it('боевой сборке файл Firebase подключается, как раньше', () => {
    const config = configWith({ kind: 'release', googleServices: firebaseFor('com.vedamatch.app') });
    expect(config.android?.googleServicesFile).toBeDefined();
    expect(plugins(config)).toContain('@react-native-firebase/app');
  });

  it('сборке разработчика файл на боевой пакет не подключается — gradle не упадёт', () => {
    const config = configWith({ googleServices: firebaseFor('com.vedamatch.app') });
    expect(config.android?.googleServicesFile).toBeUndefined();
    expect(plugins(config)).not.toContain('@react-native-firebase/app');
  });

  it('заведут в Firebase и dev-пакет — пуши появятся и у сборки разработчика', () => {
    const config = configWith({ googleServices: firebaseFor('com.vedamatch.app', 'com.vedamatch.app.dev') });
    expect(config.android?.googleServicesFile).toBeDefined();
    expect(plugins(config)).toContain('@react-native-firebase/app');
  });
});

// Боевые сборки обязаны явно сказать, что они боевые: иначе CI выпустит
// «VedaMatch Dev», который не встанет поверх установленного приложения.
describe('боевые сборки помечены APP_BUILD_KIND=release', () => {
  const root = join(__dirname, '..', '..', '..', '..');

  it('воркфлоу Mobile APK', () => {
    const workflow = readFileSync(join(root, '.github', 'workflows', 'mobile-apk.yml'), 'utf8');
    expect(workflow).toMatch(/^\s+APP_BUILD_KIND: release$/m);
  });

  it('веб-сборка (ios.vedamatch.com)', () => {
    const dockerfile = readFileSync(join(root, 'apps', 'mobile', 'Dockerfile.web'), 'utf8');
    expect(dockerfile).toMatch(/APP_BUILD_KIND=release/);
  });
});
