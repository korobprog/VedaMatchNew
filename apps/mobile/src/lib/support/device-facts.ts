import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { appVariant } from '@/config/app-variant';
import type { DeviceFacts } from './device-report';

/**
 * Факты об устройстве для обращения в поддержку (VED-336) — всё, что уже
 * знает сама сборка, без новых зависимостей: версия и versionCode лежат в
 * конфиге Expo (`app.config.ts`), модель и версия системы — в
 * `Platform.constants`, канал — в варианте сборки. Запись словами —
 * `device-report.ts`, у неё свои тесты.
 */
export function readDeviceFacts(): DeviceFacts {
  const constants = Platform.constants as unknown as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value : null);
  const code = Constants.expoConfig?.android?.versionCode;

  let channel: DeviceFacts['channel'] = null;
  try {
    channel = appVariant().channel;
  } catch {
    // Сборка без варианта (тест, веб-заглушка) — канал просто не пишем.
  }

  return {
    appVersion: text(Constants.expoConfig?.version),
    versionCode: typeof code === 'number' ? code : null,
    channel,
    platform: Platform.OS,
    // Android кладёт номер выпуска в `Release` («14»), iOS — в `osVersion`.
    osVersion: text(constants.Release) ?? text(constants.osVersion) ?? (Platform.OS === 'web' ? null : String(Platform.Version)),
    brand: text(constants.Brand) ?? text(constants.Manufacturer),
    model: text(constants.Model),
  };
}
