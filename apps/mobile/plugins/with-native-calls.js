const { withAndroidManifest, withMainActivity, AndroidConfig } = require('expo/config-plugins');

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

/**
 * ## 3. Картинка в картинке (VED-222, п.5)
 *
 * `expo-router`/`expo`'s prebuild-config не даёт настроить
 * `android:supportsPictureInPicture` на `MainActivity` иначе как этой же
 * правкой манифеста — свойства `android.*` в `app.config.ts` под это нет
 * (`@expo/config-plugins` не знает про PiP вовсе). Тот же узел `<activity>`
 * у RN-шаблона уже несёт `android:configChanges` со всем нужным для PiP
 * набором (`screenSize|screenLayout|smallestScreenSize|orientation` —
 * без них смена размера окна PiP пересоздаёт `Activity`, теряя WebRTC-сессию
 * в JS) — здесь только добавляется недостающий атрибут, конфигурация не
 * трогается.
 */
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

    const mainActivity = application.activity?.find((activity) => activity.$?.['android:name'] === '.MainActivity');
    if (mainActivity) mainActivity.$['android:supportsPictureInPicture'] = 'true';

    return config;
  });

/**
 * `MainActivity.kt` — правка текстом, а не AST: `withMainActivity` даёт
 * только строку исходника (`modResults.contents`) и её язык
 * (`modResults.language`), без парсера Kotlin в комплекте
 * `@expo/config-plugins`. Вставка перед последней закрывающей скобкой файла
 * (закрывает `class MainActivity`) — тот же приём, которым большинство
 * community config-plugins правят `MainActivity`/`MainApplication`: искать
 * маркер конца класса надёжнее, чем номер строки, который сломает любое
 * будущее изменение шаблона Expo/RN.
 *
 * `onUserLeaveHint()` — единственный штатный колбэк для РУЧНОГО входа в PiP
 * на API 26-30 (нет `setAutoEnterEnabled`, см. `VedamatchCallsModule.setPipEligible`);
 * на API 31+ система входит сама по тем же параметрам, вызывать
 * `enterPictureInPictureMode()` самим не нужно и вредно (может привести
 * к двойному входу). `onPictureInPictureModeChanged` сообщает JS о смене
 * режима в обе стороны — экран звонка прячет кнопки только в PiP.
 *
 * ## 4. Показ поверх экрана блокировки (VED-222 — правка по факту живой
 * проверки, Samsung Galaxy A51, Android 13)
 *
 * Живой лог: `sysui_fullscreen_intent` сработал, система стартовала
 * `MainActivity`, но экран не включился и keyguard остался — `Activity`
 * тут же ушла в `onPause` (`mWakefulness=Dozing`). Причина: `setShowWhenLocked`/
 * `setTurnScreenOn` выставлялись из JS (`setCallScreenActive`, вызывается
 * из `app/call/[id].tsx` уже ПОСЛЕ монтирования React-дерева) — на
 * заблокированном погашенном экране это на несколько кадров позже, чем
 * системе нужно решение «показывать поверх блокировки или нет» при первом
 * `onCreate`/`onResume`. Исправление — выставлять эти флаги СИНХРОННО в
 * нативном `onCreate`/`onNewIntent`, по тому же признаку, что уже есть в
 * стартующем `Intent` (`callId` — кладут и `CallNotifications.show()`'s
 * `fullScreenIntent`, и `CallActionReceiver`'s intent «Ответить»): проверка
 * не требует ничего от JS и успевает до первого кадра.
 *
 * Флаги не снимаются здесь же — их explicit «выключение» уже делает
 * `setCallScreenActive(false)` (JS, `app/call/[id].tsx`, размонтирование
 * экрана звонка) через тот же нативный модуль; `endCall` (`VedamatchCallsModule.kt`)
 * дополнительно снимает их сам на текущей `Activity` — защита для звонка,
 * пропущенного/снятого до того, как экран звонка вообще открылся (полноэкранный
 * `Intent` уже поднял `Activity`, JS ещё не успел её отрисовать).
 *
 * `KeyguardManager.requestDismissKeyguard` сознательно убран из
 * `setCallScreenActive` (было раньше, вызывалось безусловно при `active`) —
 * `setShowWhenLocked(true)` уже показывает разговор ПОВЕРХ блокировки без
 * её снятия, ровно как у системной звонилки; принудительно снимать
 * блокировку при каждом ответе — лишнее и неожиданное для человека действие,
 * которого спека не просит.
 */
const MAIN_ACTIVITY_IMPORTS = `import android.app.PictureInPictureParams
import android.content.Intent
import android.content.res.Configuration
import android.util.Rational
import com.vedamatch.calls.PendingCallStore
import com.vedamatch.calls.PipState
import com.vedamatch.calls.VedamatchCallsModule
`;

const MAIN_ACTIVITY_METHODS = `
  // VED-222, п.5: правка plugins/with-native-calls.js (withMainActivity) — картинка в картинке.
  override fun onUserLeaveHint() {
    super.onUserLeaveHint()
    if (Build.VERSION.SDK_INT in Build.VERSION_CODES.O..Build.VERSION_CODES.R && PipState.eligible) {
      val params = PictureInPictureParams.Builder().setAspectRatio(Rational(9, 16)).build()
      try {
        enterPictureInPictureMode(params)
      } catch (error: Exception) {
        // Устройство/OEM отказало входить в PiP — экран звонка просто
        // остаётся обычным, разговор не рвётся.
      }
    }
  }

  override fun onPictureInPictureModeChanged(isInPictureInPictureMode: Boolean, newConfig: Configuration) {
    super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
    VedamatchCallsModule.sendPipModeChanged(isInPictureInPictureMode)
  }

  // VED-222 (правка по факту живой проверки, см. §4 выше) — второй запуск той
  // же Activity (singleTask): новый Intent сам по себе не проходит через
  // onCreate, обязателен свой onNewIntent, иначе «Ответить» на уже открытое
  // приложение не покажет разговор поверх блокировки.
  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    vedamatchApplyCallWindowFlags(intent)
  }

  private fun vedamatchApplyCallWindowFlags(intent: Intent?) {
    val callId = intent?.getStringExtra("callId")
    if (callId.isNullOrEmpty()) return
    // Правка по факту живой проверки (BUG B, VED-222, Samsung Galaxy A51):
    // fullScreenIntent (CallNotifications.show(), extra vedamatchCallAction=
    // "open") поднимает эту Activity для ЕЩЁ НЕ ОТВЕЧЕННОГО звонка, но
    // раньше ничего не клало в PendingCallStore.pendingLaunch — JS
    // (getLaunchCall()) видел null и ждал реконсайл по сети, пока звонок не
    // уходил в пропущенные. «Ответить» с уведомления (CallActionReceiver)
    // этот же pendingLaunch уже сам выставляет ДО запуска Activity (action
    // "answer", другое значение extra) — здесь трогаем только "open", чтобы
    // не перезаписать её работу при гонке между приёмником и Activity.
    if (intent?.getStringExtra("vedamatchCallAction") == "open") {
      PendingCallStore.setPendingLaunch(callId, "open")
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(
        android.view.WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
          android.view.WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
          android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
      )
    }
  }
`;

const withCallPip = (config) =>
  withMainActivity(config, (config) => {
    if (config.modResults.language !== 'kt') return config;
    let contents = config.modResults.contents;

    if (!contents.includes('com.vedamatch.calls.PipState')) {
      contents = contents.replace(/^package .+\n/, (match) => `${match}${MAIN_ACTIVITY_IMPORTS}`);
    }

    if (!contents.includes('onPictureInPictureModeChanged')) {
      const lastBrace = contents.lastIndexOf('}');
      contents = `${contents.slice(0, lastBrace)}${MAIN_ACTIVITY_METHODS}${contents.slice(lastBrace)}`;
    }

    // Показ поверх блокировки уже на ПЕРВОМ старте Activity (не только на
    // повторном через onNewIntent выше) — синхронно в onCreate, до первого
    // кадра, а не из JS постфактум (см. §4). `super.onCreate(null)` — часть
    // сгенерированного Expo-шаблона, единственное вхождение в файле.
    if (!contents.includes('super.onCreate(null)\n    vedamatchApplyCallWindowFlags')) {
      contents = contents.replace(
        'super.onCreate(null)',
        'super.onCreate(null)\n    vedamatchApplyCallWindowFlags(intent)',
      );
    }

    config.modResults.contents = contents;
    return config;
  });

module.exports = (config) => withCallPip(withNativeCalls(config));
