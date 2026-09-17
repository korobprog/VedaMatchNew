const { withAndroidManifest, AndroidConfig } = require('expo/config-plugins');

/**
 * Поправки манифеста для VED-221 (`docs/mobile-calls-native.md`, §9):
 * `@react-native-firebase/messaging` должен быть единственным приёмником
 * FCM на Android.
 *
 * Зарегистрирован **первым** в `plugins` (`app.config.ts`), хотя логически
 * должен идти последним: `@expo/config-plugins` компилирует несколько
 * `withAndroidManifest`-плагинов в порядке, ОБРАТНОМ регистрации — каждый
 * новый перехватывает (`withBaseMod`/`withMod`) предыдущий как `nextMod` и
 * вызывается раньше него, поэтому последний вызов `action` соответствует
 * ПЕРВОЙ строке в массиве `plugins`. Проверено эмпирически на этой сборке:
 * при регистрации после `expo-notifications` наш код видел манифест ДО
 * того, как её плагин успел дописать свои `<meta-data>`.
 *
 * ## 1. Чужой `FirebaseMessagingService`
 *
 * `expo-notifications` не добавляет `ExpoFirebaseMessagingService` через
 * конфиг-плагин — он объявлен прямо в её собственном библиотечном
 * `AndroidManifest.xml` (`node_modules/expo-notifications/android/AndroidManifest.xml`)
 * и на этапе `expo prebuild` в файле приложения не появляется вовсе:
 * библиотечные манифесты сливает Android Gradle Plugin на этапе сборки
 * (`processReleaseMainManifest`), позже, чем работают конфиг-плагины.
 * Поэтому вырезать узел фильтрацией `modResults` здесь невозможно — нечего
 * фильтровать. Работает только штатный приём мерджера манифестов:
 * добавить в манифест приложения тот же узел с `tools:node="remove"`
 * (тот же механизм, которым `android.blockedPermissions` в
 * `@expo/prebuild-config` убирает пермишены чужих плагинов). Имя — только
 * полное (`expo.modules.notifications...`, из `namespace` в
 * `expo-notifications/android/build.gradle`): относительное `.service...`
 * в манифесте приложения резолвится в пакет ПРИЛОЖЕНИЯ, а не библиотеки, и
 * ни на что бы не сослалось.
 *
 * `@react-native-firebase/messaging` тем же путём регистрирует свой
 * `ReactNativeFirebaseMessagingService` — его не трогаем, он и должен
 * остаться единственным приёмником `com.google.firebase.MESSAGING_EVENT`.
 *
 * ## 2. Конфликт `<meta-data>` дефолтного канала/цвета
 *
 * И `expo-notifications` (через свой конфиг-плагин — эти узлы, в отличие
 * от сервиса, ДОБАВЛЕНЫ через `withAndroidManifest` и видны в `modResults`
 * до релиза), и библиотечный манифест `@react-native-firebase/messaging`
 * объявляют одни и те же ключи `com.google.firebase.messaging.default_notification_*`
 * с разными значениями (RNFB — плейсхолдеры из `firebase.json`, которого в
 * проекте нет, отсюда `@color/white` и пустой канал). Побеждают значения
 * `expo-notifications` (`tools:replace`) — именно они управляют реальным
 * каналом/цветом показа локальных уведомлений (`push-bridge.tsx`), RNFB
 * их не использует: пуши приходят data-only и notification-уведомления
 * от нас не рисует.
 */
const FCM_META_DATA_REPLACE = {
  'com.google.firebase.messaging.default_notification_channel_id': 'android:value',
  'com.google.firebase.messaging.default_notification_color': 'android:resource',
};

const FOREIGN_FCM_SERVICES = ['expo.modules.notifications.service.ExpoFirebaseMessagingService'];

const withNativeCalls = (config) =>
  withAndroidManifest(config, (config) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);

    application.service = application.service ?? [];
    for (const name of FOREIGN_FCM_SERVICES) {
      if (application.service.some((service) => service.$?.['android:name'] === name)) continue;
      application.service.push({ $: { 'android:name': name, 'tools:node': 'remove' } });
    }

    for (const metaData of application['meta-data'] ?? []) {
      const name = metaData.$?.['android:name'];
      const replaceAttr = name && FCM_META_DATA_REPLACE[name];
      if (replaceAttr) metaData.$['tools:replace'] = replaceAttr;
    }

    return config;
  });

module.exports = withNativeCalls;
