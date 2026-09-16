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
});
