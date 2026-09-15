import { existsSync } from 'node:fs';
import type { ConfigContext, ExpoConfig } from 'expo/config';
import { resolveVariant } from './src/config/variant.ts';

/**
 * Одна кодовая база, четыре сборки: контур `APP_CONTOUR` (ru, com) на канал
 * `APP_CHANNEL` (site, store). Пакет один на все сборки: приложение
 * зарегистрировано в Firebase как com.vedamatch.app.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const variant = resolveVariant(process.env);
  // Настройки Firebase не в репозитории: локально файл лежит рядом (он в
  // .gitignore), в CI путь приходит переменной. Без файла сборка всё равно
  // собирается, только без пушей FCM.
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON ?? './google-services.json';
  const withFirebase = existsSync(googleServicesFile);

  return {
    ...config,
    name: 'VedaMatch',
    slug: 'vedamatch',
    version: '0.1.0',
    orientation: 'portrait',
    // Иконка, слои adaptive-иконки, силуэт уведомлений и знак сплэша ниже —
    // все перегенерируются одним скриптом из фирменных исходников веба
    // (`apps/web/public/brand/mark*.png`): `pnpm --filter @vedamatch/mobile
    // generate:brand-assets` (`scripts/generate-brand-assets.mjs`).
    icon: './assets/images/icon.png',
    scheme: 'vedamatch',
    userInterfaceStyle: 'automatic',
    android: {
      package: 'com.vedamatch.app',
      ...(withFirebase ? { googleServicesFile } : {}),
      versionCode: 1,
      adaptiveIcon: {
        // theme/tokens.ts: light.bg0 — фон под фирменным знаком, одинаков в
        // обеих темах интерфейса (это подложка самой иконки, а не
        // темизируемый UI-фон); тот же цвет, что и у icon.png/сплэша.
        // Раньше здесь стоял тёмно-фиолетовый light.text0 (#180F2C) — на
        // ревью на устройстве тёмно-синий шеврон «M» на нём читался плохо
        // (виден был только глобус, буква тонула в тёмном фоне). backgroundImage
        // ниже перекрывает этот цвет (`@expo/prebuild-config` всегда
        // предпочитает backgroundImage, если он задан), но оставляем
        // backgroundColor как запасной путь.
        backgroundColor: '#FBF9FF',
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
        'expo-notifications',
        {
          // theme/tokens.ts: light.magenta — заливка иконки в шторке.
          color: '#D71A80',
          defaultChannel: 'messages',
          // Обязателен плоский белый силуэт на прозрачном фоне: Android
          // рисует иконку статус-бара одним цветом по альфа-каналу, а любой
          // не-белый пиксель источника превращается в сплошной прямоугольник
          // (системное ограничение, не баг) — см. VED-173 в gan-harness/spec.md.
          icon: './assets/images/notification-icon.png',
        },
      ],
      [
        'expo-splash-screen',
        {
          backgroundColor: '#FBF9FF',
          dark: {
            backgroundColor: '#0A0614',
            // «M» в mark.png запечена тёмно-синим и тонет на тёмном фоне —
            // как и на вебе (recolorMark в generate-icons.mjs), нужен
            // отдельный файл с перекрашенной буквой, а не фильтр.
            image: './assets/images/splash-icon-dark.png',
          },
          image: './assets/images/splash-icon.png',
          // Знак без подписи «VEDA MATCH» — места на неё при таком размере
          // нет: имя приложения даёт системный сплэш стек.
          imageWidth: 132,
        },
      ],
      // Тексты разрешений — только для iOS Info.plist (плагин их и добавляет);
      // на Android пакет сам просит CAMERA/READ_MEDIA_IMAGES без этих строк.
      // Приложение сейчас только под Android, но плагин обязателен, чтобы
      // `expo prebuild` вообще собрал модуль камеры/галереи в APK.
      [
        'expo-image-picker',
        {
          photosPermission: 'Разрешите доступ к фото, чтобы прикладывать их к сообщениям.',
          cameraPermission: 'Разрешите доступ к камере, чтобы снимать фото прямо в переписке.',
          microphonePermission: false,
        },
      ],
    ],
    experiments: { typedRoutes: true, reactCompiler: true },
    extra: { variant },
  };
};
