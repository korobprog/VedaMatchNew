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
});
