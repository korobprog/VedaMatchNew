import type { ConfigContext, ExpoConfig } from 'expo/config';
import { resolveVariant } from './src/config/variant.ts';

/**
 * Одна кодовая база, четыре сборки: контур `APP_CONTOUR` (ru, com) на канал
 * `APP_CHANNEL` (site, store). Пакет один на все сборки: приложение
 * зарегистрировано в Firebase как com.vedamatch.app.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const variant = resolveVariant(process.env);

  return {
    ...config,
    name: 'VedaMatch',
    slug: 'vedamatch',
    version: '0.1.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'vedamatch',
    userInterfaceStyle: 'automatic',
    android: {
      package: 'com.vedamatch.app',
      versionCode: 1,
      adaptiveIcon: {
        backgroundColor: '#180F2C',
        foregroundImage: './assets/images/android-icon-foreground.png',
        backgroundImage: './assets/images/android-icon-background.png',
        monochromeImage: './assets/images/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
      // Шаблон Expo тянет эти разрешения по умолчанию. Показ поверх окон и
      // доступ к общему хранилищу приложению не нужны, а Google Play требует
      // объяснять каждое такое разрешение.
      blockedPermissions: [
        'android.permission.SYSTEM_ALERT_WINDOW',
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.WRITE_EXTERNAL_STORAGE',
      ],
    },
    plugins: [
      'expo-router',
      'expo-secure-store',
      'expo-font',
      'expo-image',
      'expo-status-bar',
      'expo-web-browser',
      [
        'expo-splash-screen',
        {
          backgroundColor: '#FBF9FF',
          dark: { backgroundColor: '#0A0614' },
          image: './assets/images/splash-icon.png',
          imageWidth: 76,
        },
      ],
    ],
    experiments: { typedRoutes: true, reactCompiler: true },
    extra: { variant },
  };
};
