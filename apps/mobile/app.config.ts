import { existsSync } from 'node:fs';
import type { ConfigContext, ExpoConfig } from 'expo/config';
import { capabilitiesFor } from './src/config/capabilities.ts';
import { resolveVariant } from './src/config/variant.ts';
import { resolveVersionCode, resolveVersionName } from './src/config/app-version.ts';
import { version as packageVersion } from './package.json';

/**
 * Одна кодовая база, четыре сборки: контур `APP_CONTOUR` (ru, com) на канал
 * `APP_CHANNEL` (site, store). Пакет один на все сборки: приложение
 * зарегистрировано в Firebase как com.vedamatch.app.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const variant = resolveVariant(process.env);
  // Что этой сборке разрешено (VED-207). Разрешения манифеста и плагины
  // гейтятся той же таблицей, что и экраны, — иначе «в интерфейсе выключено,
  // а в манифесте просим» расходятся и ловятся уже на ревью витрины.
  const capabilities = capabilitiesFor(variant);
  // Настройки Firebase не в репозитории: локально файл лежит рядом (он в
  // .gitignore), в CI путь приходит переменной. Без файла сборка всё равно
  // собирается, только без пушей FCM.
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON ?? './google-services.json';
  const withFirebase = existsSync(googleServicesFile);

  return {
    ...config,
    name: 'VedaMatch',
    slug: 'vedamatch',
    // versionName человека: номер пакета (+короткий sha в сборках CI).
    // versionCode системы самообновления — ниже, в android.versionCode.
    version: resolveVersionName(packageVersion, process.env),
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
      // Обязан расти от сборки к сборке — иначе самообновление с сайта
      // (channel=site) сочтёт новый файл не новее уже установленного.
      // Источник роста и подробности — src/config/app-version.ts.
      versionCode: resolveVersionCode(process.env),
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
      // ACCESS_WIFI_STATE/CHANGE_NETWORK_STATE — правка по факту живой
      // проверки (BUG C, VED-222, Samsung Galaxy A51): ни react-native-webrtc,
      // ни сам .aar `org.jitsi:webrtc` их не декларируют (проверено по
      // распакованным манифестам обоих — там вообще нет <uses-permission>),
      // до этой правки в итоговом манифесте была только ACCESS_NETWORK_STATE
      // (от другой зависимости). Обе — «normal», Android выдаёт их
      // автоматически без диалога, ничего общего с READ_PHONE_STATE/
      // READ_PHONE_NUMBERS (те специально не добавлены нигде в этом файле —
      // см. §12.15). Без ACCESS_WIFI_STATE `NetworkMonitorAutoDetect`
      // (react-native-webrtc/libwebrtc, org.webrtc.NetworkMonitorAutoDetect)
      // не может спросить Wi-Fi-специфичные данные о текущей сети
      // (`WifiManagerDelegate`) при построении списка сетей для нативного
      // ICE-гатерера; без CHANGE_NETWORK_STATE тот же монитор ловит
      // `SecurityException` на `ConnectivityManager.requestNetwork()` для
      // отдельного отслеживания сотовой сети (лог этого прогона: `Unable to
      // obtain permission to request a cellular network`) — оба тихо
      // проглатываются (try/catch), поэтому раньше не проявлялись явной
      // ошибкой, а сбор STUN/TURN просто не происходил.
      permissions: [
        'android.permission.MANAGE_OWN_CALLS',
        'android.permission.USE_FULL_SCREEN_INTENT',
        'android.permission.FOREGROUND_SERVICE',
        'android.permission.FOREGROUND_SERVICE_PHONE_CALL',
        'android.permission.FOREGROUND_SERVICE_MICROPHONE',
        'android.permission.FOREGROUND_SERVICE_CAMERA',
        'android.permission.ACCESS_WIFI_STATE',
        'android.permission.CHANGE_NETWORK_STATE',
        // Самообновление с сайта (VED-176): открыть системный установщик по
        // `content://` требует REQUEST_INSTALL_PACKAGES с Android 8+, иначе
        // `startActivityAsync(ACTION_INSTALL_PACKAGE)` откроет системный
        // экран «Разрешить установку неизвестных приложений» и завершится,
        // не установив файл. Только канал `site` — на `store` (RuStore,
        // Google Play) секции «Проверить обновление» вовсе нет
        // (`capabilities.selfUpdate`), и это разрешение там не нужно и не должно
        // просить пользователя: Google Play отдельно проверяет использование
        // REQUEST_INSTALL_PACKAGES декларацией назначения в консоли и не
        // пропустит его без обоснования у приложения, которое само не умеет
        // ставить APK на этом канале.
        ...(capabilities.selfUpdate ? ['android.permission.REQUEST_INSTALL_PACKAGES'] : []),
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
      // Сканер состава «Здоровья» (VED-335). Видоискатель с чтением
      // штрихкода — отдельный модуль, `expo-image-picker` его не заменяет:
      // тот снимает фото, а здесь нужен поток кадров с распознаванием.
      //
      // `recordAudioAndroid: false` — сканер молчит, звук ему не нужен. В
      // отличие от плагина `expo-image-picker` выше, здесь `false` безопасен:
      // он просто не добавляет RECORD_AUDIO (в `blockedPermissions` ничего не
      // вписывается, см. `expo-camera/plugin/build/withCamera.js`), а само
      // разрешение и так приходит от плагина WebRTC ниже и от `expo-audio`.
      [
        'expo-camera',
        {
          cameraPermission: 'Разрешите доступ к камере, чтобы читать штрихкод с упаковки. Снимок никуда не отправляется — на сервер уходит только сам код.',
          recordAudioAndroid: false,
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
      // Рингтон звонка (`lib/calls/ringtone.ts`, этап 1, VED-219) и голосовые
      // сообщения переписки (`lib/chat/voice/**`, VED-286).
      // `recordAudioAndroid: true` (было `false`, когда пакет отвечал
      // только за рингтон): RECORD_AUDIO в манифесте и так уже просит плагин
      // webrtc выше, но это разрешение самого плагина `expo-audio`
      // управляет ещё и тем, войдёт ли `MODIFY_AUDIO_SETTINGS` в манифест
      // (`node_modules/expo-audio/plugin/src/withAudio.ts`) — без него
      // Android может не дать `AudioRecorder` выставить формат записи.
      // Без фоновой службы воспроизведения — рингтон и голосовое играют,
      // только пока приложение на экране (осознанно, «Звук из фона не
      // нужен» для голосовых); звонок в свёрнутом приложении — отдельный
      // механизм этапа 2 (VED-221), с записью и плеером сообщений не связан.
      [
        'expo-audio',
        {
          recordAudioAndroid: true,
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
      // Релизная подпись из секретов CI (VED-176). Без всех четырёх
      // ANDROID_KEYSTORE_* остаётся отладочная подпись шаблона, как раньше —
      // см. apps/mobile/plugins/with-release-signing.js. Строкой, а не
      // импортом функции: ExpoConfig.plugins типизирован только под путь к
      // модулю (@expo/config-types), Expo резолвит и вызывает его сам.
      './plugins/with-release-signing.js',
      // Нативный код только под ARM-телефоны: x86/x86_64 (эмуляторы,
      // Chromebook) добавляли к APK с сайта ~71 МБ из 155. Под эмулятор —
      // ANDROID_ARCHITECTURES=x86_64, см. plugins/gradle-architectures.js.
      './plugins/with-android-architectures.js',
    ],
    // Веб-версия (ios.vedamatch.com): одностраничная сборка `expo export
    // --platform web`. Шаблон страницы, манифест, иконки и service worker —
    // в `public/`; подмены нативных пакетов — `metro.config.js`.
    web: {
      bundler: 'metro',
      output: 'single',
      name: 'VedaMatch',
      shortName: 'VedaMatch',
      lang: 'ru',
      themeColor: '#FBF9FF',
      backgroundColor: '#FBF9FF',
    },
    experiments: { typedRoutes: true, reactCompiler: true },
    // Отметка сборки — видна на экране входа (`src/config/build-stamp.ts`):
    // по ней сразу понятно, открылась свежая сборка или кэш мини-приложения
    // Telegram / установленного PWA. В CI короткий sha приходит переменной,
    // как у versionName Android.
    extra: {
      variant,
      build: {
        builtAt: new Date().toISOString().slice(0, 16),
        // Ключа нет вовсе, если sha не пришёл: `null` Expo сериализует в
        // пустой объект, и метка получилась бы «сборка … · [object Object]».
        ...(process.env.APP_VERSION_SHA
          ? { commit: process.env.APP_VERSION_SHA.slice(0, 7) }
          : {}),
      },
    },
  };
};
