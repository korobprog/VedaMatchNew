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
    // все перегенерируются одним скриптом из фирменных исходников бренд-кита
    // для соцсетей (`assets/brand-src/mark-transparent*.png`, см. README там
    // же): `pnpm --filter @vedamatch/mobile generate:brand-assets`
    // (`scripts/generate-brand-assets.mjs`).
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
      // Входящий звонок при свёрнутом/закрытом приложении (VED-221,
      // docs/mobile-calls-native.md §3). MANAGE_OWN_CALLS и
      // FOREGROUND_SERVICE(_PHONE_CALL) — «обычные», Android выдаёт их
      // автоматически по объявлению; USE_FULL_SCREEN_INTENT с Android 14
      // может не выдаться молча (`canUseFullScreenIntent()`,
      // `native-call-bridge.ts`) — деградация до heads-up описана в
      // `docs/mobile-calls-native.md`. POST_NOTIFICATIONS уже приходит из
      // плагина `expo-notifications` ниже.
      // FOREGROUND_SERVICE_MICROPHONE/_CAMERA — служба «Идёт звонок» на
      // время разговора (VED-222, `docs/mobile-calls-native.md` §12):
      // Android 14 требует объявлять каждый используемый
      // `foregroundServiceType` отдельным разрешением, иначе
      // `startForeground(..., type)` бросает `SecurityException` в рантайме
      // (манифест собирает оба типа статически, `CallForegroundService`
      // на видеозвонке передаёт оба, на аудио — только `phoneCall|microphone`).
      permissions: [
        'android.permission.MANAGE_OWN_CALLS',
        'android.permission.USE_FULL_SCREEN_INTENT',
        'android.permission.FOREGROUND_SERVICE',
        'android.permission.FOREGROUND_SERVICE_PHONE_CALL',
        'android.permission.FOREGROUND_SERVICE_MICROPHONE',
        'android.permission.FOREGROUND_SERVICE_CAMERA',
      ],
    },
    plugins: [
      // Правки манифеста для VED-221 (см. комментарий в самом файле) должны
      // выполниться последними среди всех `withAndroidManifest`-плагинов
      // ниже — а `@expo/config-plugins` компилирует их в порядке, ОБРАТНОМ
      // регистрации (каждый новый `withAndroidManifest` оборачивает
      // предыдущий и вызывается раньше него, см. `withMod`/`withBaseMod` в
      // `@expo/config-plugins`): поэтому плагин стоит здесь, первым в
      // списке, а не последним, как было бы естественно ожидать по имени
      // файла.
      './plugins/with-native-calls.js',
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
            // «M» в mark-transparent.png запечена тёмно-синим и тонет на
            // тёмном фоне — нужен отдельный файл с перекрашенной буквой
            // (mark-transparent-dark.png из бренд-кита), а не фильтр.
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
          // Не false: false у этого плагина не просто молчит, а вписывает
          // RECORD_AUDIO в blockedPermissions всего приложения, и звонки
          // остаются без микрофона. Текст нужен iOS для видео с камеры.
          microphonePermission: 'Разрешите доступ к микрофону, чтобы говорить в звонках и снимать видео со звуком.',
        },
      ],
      // Ставит разрешения WebRTC на Android (CAMERA, RECORD_AUDIO и т.д. —
      // список зашит в плагине) и подписи для iOS Info.plist. Android не
      // читает эти тексты для системного диалога разрешений — рационале
      // показывает экран звонка сам, словами, по нажатию (этап 1).
      [
        '@config-plugins/react-native-webrtc',
        {
          cameraPermission: 'VedaMatch использует камеру для видеозвонков.',
          microphonePermission: 'VedaMatch использует микрофон для звонков.',
        },
      ],
      // Рингтон звонка (`lib/calls/ringtone.ts`, этап 1, VED-219). Без записи
      // звука — `recordAudioAndroid: false`, RECORD_AUDIO и так уже просит
      // плагин webrtc выше. Без фоновой службы воспроизведения — рингтон
      // играет, только пока приложение на экране; звонок в свёрнутом
      // приложении — этап 2 (VED-221), другой механизм.
      [
        'expo-audio',
        {
          recordAudioAndroid: false,
          enableBackgroundPlayback: false,
        },
      ],
      // Входящий звонок в свёрнутом/закрытом приложении (этап 2, VED-221,
      // docs/mobile-calls-native.md §3-4). Плагин `@react-native-firebase/app`
      // копирует `google-services.json` и подключает Gradle-плагин Google
      // Services — без файла (см. `withFirebase` выше) он падает на
      // `withDangerousMod`, поэтому подключаем условно, как и сам файл;
      // нативные модули RNFB при этом всё равно собираются автолинкингом
      // (это не зависит от плагина) — без файла FCM просто не инициализируется.
      ...(withFirebase ? ['@react-native-firebase/app'] : []),
    ],
    experiments: { typedRoutes: true, reactCompiler: true },
    extra: { variant },
  };
};
