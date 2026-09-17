# Звонки в Android-приложении: разведка (этап 0, VED-218)

Статус: этап 0 закрыт 2026-09-16. Ветка `feat/mobile-calls-0-research`.
Задача — снять риски до того, как писать экран звонка (этап 1) и
серверный пуш (этап C/2): собирается ли `react-native-webrtc` под RN 0.86
new architecture, можно ли доверять `react-native-callkeep`, и чем поднимать
звонок из убитого приложения.

## 1. Что измерено здесь (сборка на этой машине)

| Шаг | Команда | Результат |
|---|---|---|
| Установка | `pnpm --filter @vedamatch/mobile add react-native-webrtc@124.0.8 @config-plugins/react-native-webrtc@15.0.2` | Чисто, `pnpm ls` подтверждает версии; `pnpm install --frozen-lockfile` после этого проходит. |
| `expo prebuild --platform android --clean` | `APP_CONTOUR=ru APP_CHANNEL=site npx expo prebuild --platform android --clean` | Успех. `AndroidManifest.xml` получил `CAMERA`, `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`, `BLUETOOTH`, `ACCESS_NETWORK_STATE`, `SYSTEM_ALERT_WINDOW`, `WAKE_LOCK`, `INTERNET` — список плагина `@config-plugins/react-native-webrtc`, без ручной правки манифеста. См. «Конфликт с blockedPermissions» ниже. |
| `./gradlew assembleDebug` | `JAVA_HOME` — JBR из Android Studio, `ANDROID_HOME=~/Library/Android/sdk` | См. ниже — результат вписан после завершения фонового запуска. |

Версии подобраны по таблице совместимости из README
`@config-plugins/react-native-webrtc` (`expo 56.0.0 → react-native-webrtc
124.0.7 → @config-plugins/react-native-webrtc 15.0.0`); у нас Expo 57.0.22,
взяты последние патчи обеих библиотек (124.0.8 и 15.0.2) — таблица не идёт
дальше SDK 56, но патч-версии в одном мажоре друг друга не ломают, что
подтвердил успешный prebuild.

### Находка: сломанные типы `react-native-webrtc@124.0.8`

Опубликованный пакет объявляет `"types": "lib/typescript/index.d.ts"`, и
`RTCPeerConnection.d.ts`/`RTCDataChannel.d.ts` внутри импортируют
`EventTarget`/`Event` из `./vendor/event-target-shim` — а каталог `vendor`
в `lib/typescript` **не попал при публикации** (проверено распаковкой
тарболла `npm pack react-native-webrtc@124.0.8`: `find lib/typescript -iname
"*event*"` ничего не находит). Из-за `skipLibCheck: true` в
`expo/tsconfig.base` компилятор это не роняет ошибкой, но базовый класс
`EventTarget` теряет типы, и `pc.addEventListener(...)` перестаёт быть
видимым — `tsc` пишет `Property 'addEventListener' does not exist on type
'RTCPeerConnection'`.

Обход — рабочий и переносимый: класс отдельно объявляет геттеры/сеттеры
`onicecandidate`, `ondatachannel`, `onmessage`, `onopen` — они не зависят от
сломанного `EventTarget` и типизированы штатно. `ice-probe-runner.ts`
(ниже) использует именно их. Это находка первого часа реальной работы с
библиотекой, а не гипотеза — стоит держать в голове на этапе 1, когда
`webrtc-session.ts` тоже пойдёт через эти сеттеры.

## 2. Совместимость с new architecture — факты

### react-native-webrtc

- Отдельного TurboModule/Fabric-переписывания в релизе **нет**. PR
  [#1590 «WIP: New Arch Changes — RN 0.76.0+»](https://github.com/react-native-webrtc/react-native-webrtc/pull/1590)
  открыт с начала 2026, статус `closed`, не смёржен (`merged: false`) —
  автор тестировал вручную RN 0.76–0.84 в своей ветке, но в master и в
  npm-релизах этого кода нет.
- Библиотека остаётся модулем старой архитектуры и работает под new arch
  через встроенный в React Native interop-слой (Legacy Interop Layer для
  TurboModules и Fabric-совместимость для ViewManager). Подтверждение от
  мейнтейнера `saghul` в issue
  [#1736 «not working on New Architecture»](https://github.com/react-native-webrtc/react-native-webrtc/issues/1736)
  (2025-09-24): «The compatibility layer should work out of the box».
  Отчётов о падениях уровня callkeep #822 (см. ниже) у самого webrtc
  не нашлось.
- `android/build.gradle` пакета — обычный `com.android.library` без
  Fabric-специфичных секций, `RTCVideoViewManager.java` — классический
  `SimpleViewManager`, не Fabric `ViewManager` с кодогеном. Значит именно
  interop-слой и обеспечивает рендер `RTCView` под new arch; это надо
  проверить на живом видео (этап 1), сборка этого не покажет.
- `@config-plugins/react-native-webrtc@15.0.2` актуален (правился
  2026-08-15), таблица версий в README явно поддерживает наш Expo/webrtc
  диапазон.

### Конфликт с blockedPermissions

`@config-plugins/react-native-webrtc` (`withWebRTC.js`) безусловно добавляет
`SYSTEM_ALERT_WINDOW`, а `app.config.ts` держит это разрешение в
`android.blockedPermissions`. Проверено по сгенерированным манифестам:
в `src/main/AndroidManifest.xml` разрешение стоит с `tools:node="remove"`,
то есть blockedPermissions срабатывает после плагина и из релизной и
магазинной сборки разрешение вырезается. В отладочном APK оно остаётся
из стандартного отладочного манифеста React Native (`src/debug`), к плагину
отношения не имеет. Показ поверх окон звонкам не нужен: входящий на экране
блокировки делается полноэкранным уведомлением (`USE_FULL_SCREEN_INTENT`,
этап 2), не наложением. Правило для этапов 1–4: после каждого нового
плагина сверять итоговый манифест release-сборки
(`aapt dump permissions` по APK), а не только список в app.config.ts.

### react-native-callkeep — решение «нет»

- Последний npm-релиз `4.3.16` — **2024-11-28**, почти два года без
  публикации относительно текущей даты. Репозиторий при этом живой
  (`pushed_at: 2026-09-14`, `open_issues: 352`), то есть работа идёт, но
  до npm не доезжает.
- Открытый issue [#822](https://github.com/react-native-webrtc/react-native-callkeep/issues/822)
  «are you planning on supporting react native new architecture any time
  soon?» (открыт 2024-12-09, не закрыт). В комментариях —
  конкретный краш на Android под new arch:
  ```
  Exception in HostObject::get for prop 'RNCallKeep':
  com.facebook.react.internal.turbomodule.core.TurboModuleInteropUtils$ParsingException:
  Unable to parse @ReactMethod annotations from native module: RNCallKeep.
  Details: Module exports two methods to JavaScript with the same name: "displayIncomingCall"
  ```
  Обходят его только неофициальными патчами через `patch-package`
  (комментарии `michel3141`, `vishaldaher` в той же ветке) — правка
  `RNCallkeep.m`/дублирующихся `@ReactMethod` вручную, не через релиз.
- Итог: тащить в проект зависимость, которая ломается на Android под new
  arch без патчей и не обновлялась два года — риск выше пользы. Решение
  этапа 0: **не ставим `react-native-callkeep`**, вместо него — свой
  тонкий Expo-модуль на self-managed `ConnectionService` (см. §3).

### react-native-incall-manager — решение «оставляем»

- Активно живой: npm-релиз `4.3.0` от 2026-09-15 (вчера на момент
  разведки), репозиторий пушился в тот же день.
- Целевой поиск issues по `new architecture`/`fabric` в этом репозитории
  дал один нерелевантный результат («This project is still alive?»,
  открыт январь 2026, без сообщений о поломке под new arch). Это не
  доказательство полной совместимости, а отсутствие красных флагов —
  нужно подтвердить эмпирически на этапе 3 (аудиомаршрутизация,
  проксимити-сенсор), когда модуль реально дергается в рантайме.
- `peerDependencies: { "react-native": ">=0.40.0" }` — разрешает 0.86.

## 3. Решение: свой Expo-модуль вместо `react-native-callkeep`

Спецификация ставит выбор явно: `react-native-callkeep` или тонкий
self-managed `ConnectionService`. По находкам §2 — берём второе:

- Self-managed режим `ConnectionService` не требует регистрации
  приложения дефолтным телефонным, только разрешение
  `MANAGE_OWN_CALLS` (уже упомянуто в спеке для этапа 2) — рисков вокруг
  «приложение просит стать звонилкой» нет.
- Пишем модуль сами — значит сами контролируем регистрацию `@ReactMethod`
  и не наступаем на баг класса «Module exports two methods to JavaScript
  with the same name», который встретил callkeep: у нас будет ровно
  столько методов, сколько нужно (`displayIncomingCall`, `answer`,
  `reject`, `end`, плюс события `didActivateAudioSession` и т.п.), и они
  пишутся сразу под new architecture (TurboModule-совместимый интерфейс
  через кодоген `expo-modules-core`, а не старый bridge).
- `expo-modules-core` (уже часть SDK 57) даёt штатный путь писать нативные
  модули с поддержкой new architecture из коробки — не нужен отдельный
  пакет вроде callkeep, который тянет свой (устаревший) слой моста.
- Стоимость: пишем и поддерживаем Kotlin-код `ConnectionService`,
  `TelecomManager.registerPhoneAccount`, самостоятельно — это этап 3
  (VED-222, «звонок как у системной звонилки»), не этап 1. Этап 1 может
  обойтись без системного UI вовсе (входящий баннер в приложении, как на
  вебе) и получить системный экран уже на этапе 2/3.

Открытый вопрос для этапа 2/3: не пропустили ли мы более свежую вилку
`react-native-callkeep` (например, форк с патчами из issue #822),
достаточно готовую, чтобы взять её вместо самостоятельной реализации —
на момент этой разведки такого релиза в npm нет, проверять заново перед
стартом этапа 3.

## 4. Решение: фоновый пуш — `@react-native-firebase/messaging`

- `@react-native-firebase/messaging@26.4.0` + `@react-native-firebase/app@26.4.0`,
  релиз 2026-09-05 — свежий. Пиры: `expo: ">=47.0.0"`. Единственный
  открытый issue с «new architecture» в заголовке —
  [#8217](https://github.com/invertase/react-native-firebase/issues/8217),
  и он **iOS-специфичный** (`isHeadless`/quit state), а iOS в этом проекте
  вне рамок (VED-180). Для Android под new arch блокирующих открытых issue
  по поиску не нашлось.
- Почему не фоновая задача `expo-notifications`: `Notifications.registerTaskAsync`
  документирована и обкатана для случая «приложение свёрнуто», но именно
  для убитого процесса и полноэкранного intent (этап 2, VED-221) нужен
  максимально проверенный путь — а `messaging().setBackgroundMessageHandler`
  из RNFB это ровно тот механизм, которым индустриально поднимают
  VoIP-звонки на Android (`HeadlessJsTaskService`, перезапускаемый
  системой из полностью убитого состояния). Разведка не нашла открытых
  issue о ненадёжности этого пути на Android; для expo-notifications
  прямых данных о надёжности из killed state в рамках этой разведки не
  собрано — решение сделано по специализации инструмента, а не по прямому
  сравнению замеров (это стоит перепроверить на этапе 2 на живом
  телефоне).
- **Риск, который нашла разведка и которого не было в исходном плане**:
  Android разрешает ровно одному `<service>` в манифесте обрабатывать
  intent-filter `com.google.firebase.MESSAGING_EVENT`. Сейчас
  `expo-notifications` уже регистрирует свой `FirebaseMessagingService`
  (через него сегодня идёт токен и показ обычных пушей чата,
  `apps/mobile/src/lib/push/push-bridge.tsx`). Добавление
  `@react-native-firebase/messaging` без переноса регистрации даст два
  сервиса на один intent-filter — Android доставит событие только одному
  из них, и какой именно «выиграет», не гарантировано ни одной из
  библиотек. Разведкой в этом репозитории конкретного issue с таким
  конфликтом не найдено (целевой поиск по `invertase/react-native-firebase`
  пуст), но это прямое следствие того, как Android резолвит intent-filter
  — не гипотеза с потолка.
- **Поправка к этапу C/2**: не ставить RNFB «рядом» с
  `expo-notifications`, а сделать RNFB единственным владельцем приёма FCM
  (`setBackgroundMessageHandler` + foreground `onMessage`), и уже из этого
  обработчика:
  - для звонков — поднимать `ConnectionService`/входящий экран (свой
    модуль, §3);
  - для обычных пушей чата — вызывать презентационные API
    `expo-notifications` (`Notifications.scheduleNotificationAsync` и
    канал `messages`, которые уже настроены), не трогая его приёмный
    путь. `push-bridge.tsx` при этом теряет `getDevicePushTokenAsync` в
    пользу токена от RNFB (тот же FCM-токен, другой API его получения) и
    отправку на `/notifications/devices` не меняет — контракт с сервером
    не ломается, меняется только то, кто в приложении получает пуш первым.
  - Это правка плана, а не готовый код: реализация — этап C/2, здесь
    зафиксировано решение и причина.

## 5. Экран «Проверка связи»

Перенесено без переписывания логики из
`apps/web/src/components/chat/calls/ice-probe.ts` (+spec) в
`apps/mobile/src/lib/calls/ice-probe.ts` (+spec, тот же набор тестов, все
зелёные — `pnpm --filter @vedamatch/mobile test`: 14 наборов, 83 теста).
Раннер на
`react-native-webrtc` — `apps/mobile/src/lib/calls/ice-probe-runner.ts`,
аналог `ice-probe-runner.ts` с сайта, с поправкой на находку из §1
(сеттеры вместо `addEventListener`). Клиент — `apps/mobile/src/lib/calls/chat-calls-client.ts`,
пока только `GET /chat/calls/ice-servers` поверх общего `ApiClient`
(`src/lib/api/client.ts`); остальные маршруты `chat/calls/*` переезжают на
этапе 1 вместе с `call-machine.ts`.

Экран — `apps/mobile/src/app/calls-probe.tsx`, маршрут expo-router вне
таб-бара, добавлен в защищённую группу `signed` в `src/app/_layout.tsx`
(нужен вход — маршрут ходит в API с Bearer-токеном). Вход скрытый:
**долгое нажатие на заголовок вкладки «Звонки»** (`(tabs)/calls.tsx` →
`Screen.onTitleLongPress`), без видимой подсказки — это инструмент
команды для замера на живом телефоне, а не пункт меню для всех. Выбор в
пользу долгого нажатия, а не флага `__DEV__`: релизная (`site`/`store`)
сборка тоже может понадобиться для диагностики у живого человека в поле
(жалоба «звонки не идут» на конкретной сети), а `__DEV__` в такой сборке
всегда `false`.

Экран показывает по каждому транспорту (`STUN`, `TURN UDP`, `TURN TCP`,
`TURN TLS`) итог (доступен/нет) и время в миллисекундах, отдельной строкой
— результат «петли» через relay (данные реально прошли, а не только
allocation), и строку-сводку для отчёта команды в формате
`STUN | TURN UDP | TURN TCP | TURN TLS | петля`. Токены темы
(`useTheme()`), кнопка и кнопка «назад» ≥ 44dp (`hitTarget`),
`accessibilityRole`/`accessibilityLabel` на интерактивных элементах,
`accessibilityRole="alert"` на строке ошибки.

### Что ждёт живого телефона

Сборка на CI/локальной машине не даёт сетевых данных — только
подтверждает, что код компилируется и типизируется. На живом устройстве
(когда появится dev-client APK) нужно прогнать экран «Проверка связи»:

- с домашнего Wi-Fi;
- с мобильного интернета (LTE/5G) одного из основных операторов РФ;
- записать строку-сводку в `deploy/coturn/README.md` рядом с уже
  собранными веб-замерами (этап 0 веб-плана звонков это уже сделал —
  см. `docs/chat-calls-plan.md`, раздел «Что уже сделано (этап 0,
  подготовка)» — для нативного клиента цифры отдельные, TURN-сервер тот
  же, но UDP-путь на мобильной сети телефона может вести себя иначе, чем
  в браузере той же сети).
- отдельно проверить рендер `RTCView` под new architecture на реальном
  видеотреке — этап 1, сборка этого не проверяет (см. §2).

## 6. Поправки к этапам 1–4

- **Этап 1.** `webrtc-session.ts` при переносе с сайта должен везде
  использовать сеттеры (`onicecandidate`, `ontrack`, `ondatachannel`), а
  не `addEventListener`/`removeEventListener` — находка §1 не касается
  рантайма, но `tsc --noEmit` (обязательная проверка перед PR) не пройдёт
  с `addEventListener`, пока апстрим не восстановит `vendor/` в пакете.
  Перепроверить при каждом апдейте `react-native-webrtc`: если апстрим
  починит публикацию, `addEventListener` снова станет доступен по типам —
  можно будет вернуться к более близкому к вебу коду.
- **Этап C/2.** Владелец приёма FCM — `@react-native-firebase/messaging`
  единолично (см. §4); `expo-notifications` остаётся только для показа
  обычных пушей чата и локальных уведомлений, не для приёма. Нужно
  проверить на этапе C, что смена владельца не ломает существующий поток
  сообщений (`push-bridge.tsx`, `push-api.ts`) — контракт с сервером
  (`POST /notifications/devices`) не меняется, меняется источник токена.
- **Этап 3.** Foreground service и `ConnectionService` — целиком в нашем
  Expo-модуле (§3), без `react-native-callkeep`. `react-native-incall-manager`
  оставляем для аудиомаршрутизации/проксимити-сенсора, но перед стартом
  этапа перепроверить свежесть релиза (на момент разведки — вчерашний).
- **Этап 4.** Добавить в программу обкатки отдельный пункт: рендер
  `RTCView` под new architecture на разных производителях (находка §2 —
  interop-слой для Fabric ViewManager не тестировался за пределами
  утверждения мейнтейнера).

## 7. `./gradlew assembleDebug` — фактический результат

Прогнано на этой машине 2026-09-16, `JAVA_HOME` — JBR из Android Studio
(`/Applications/Android Studio.app/Contents/jbr/Contents/Home`),
`ANDROID_HOME=~/Library/Android/sdk`, `./gradlew assembleDebug --no-daemon`
сразу после `expo prebuild --platform android --clean` (первая сборка на
машине — Gradle качал зависимости и компилировал нативный код всех
модулей с нуля, включая NDK C++ для reanimated/expo-modules-core/приложения).

```
BUILD SUCCESSFUL in 10m 31s
518 actionable tasks: 518 executed
```

APK: `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`,
**277 МБ** — ожидаемо много для debug-сборки: неотстрипанные
debug-символы и нативные библиотеки `libjingle_peerconnection_so.so`
(`org.jitsi:webrtc:124.+`, ревизия WebRTC M124) сразу под четыре ABI
(`armeabi-v7a`, `arm64-v8a`, `x86`, `x86_64`) плюс reanimated/gesture-handler/
expo-modules-core. Release-сборка со сплитом по ABI и стриппингом символов
будет на порядок меньше; замер отложен до этапа, где появится подписанный
релизный билд (workflow **Mobile APK** в CI, см. `apps/mobile/README.md`).

Ни одной ошибки компиляции или конфигурации, связанной с
`react-native-webrtc`/`@config-plugins/react-native-webrtc`, не было —
единственные предупреждения (`RawPropsParser` deprecated в
`expo-modules-core`, несколько deprecated Gradle features) не относятся к
звонкам и существовали бы в любой сборке этого Expo SDK. Манифест,
разрешения и нативные `.so` собрались с первого прогона без ручных правок
после `prebuild`.

Что эта сборка **не проверяет** (открытые риски на потом):

- Рендер `RTCView` (Fabric ViewManager interop, §2) — нужен реальный
  видеотрек на устройстве, этап 1.
- Поведение `react-native-incall-manager` в рантайме (аудиомаршрутизация,
  проксимити-сенсор) — этап 3.
- Сеть: доля relay на Wi-Fi/LTE — экран «Проверка связи» (§5) собран и
  типизирован, но не запускался на телефоне (нет живого устройства в этой
  среде) — замер в отдельном прогоне, честно не выполнен здесь.

## 8. Поправка по итогам оценки этапа 1 (feedback-001, итерация 2)

Оценщик нашёл блокирующий дефект: `gestureEnabled: false` на маршруте
`call/[id]` (`apps/mobile/src/app/_layout.tsx`) — свойство `react-native-screens`
только для iOS (`node_modules/react-native-screens/src/types.tsx`), на
Android аппаратная «назад»/системный жест штатно снимают экран звонка сами,
а `BackHandler` нигде не был зарегистрирован. `CallSession` при этом
продолжает жить в `call-provider.tsx` (это правильно — разговор не должен
обрываться от случайного «назад», как в обычной звонилке), но без экрана и
без индикации к нему было физически не вернуться.

Починено переносом решения «сворачивать/не сворачивать» и «показывать ли
плашку возврата» в чистый модуль `src/lib/calls/call-screen-return.ts`
(+`spec`): пока звонок в `outgoing`/`connecting`/`active`, экран
(`app/call/[id].tsx`) сам перехватывает `hardwareBackPress` и уходит тем же
путём, что обычный pop, — детерминированно, не полагаясь на поведение
`fullScreenModal`-презентации по умолчанию. Провайдер
(`call-provider.tsx`) знает о видимости экрана
(`reportCallScreenMounted`) и показывает `components/calls/return-to-call-banner.tsx`
— плашку «Звонок · 0:42 — Вернуться» поверх любого раздела, пока звонок
жив, а полноэкранного вида не видно. Таймер разговора вынесен в общий
`src/lib/calls/call-timer.ts` (+`spec`) — общий для экрана и плашки, чтобы
секунды не расходились.

### Что ждёт живого телефона (добавлено этой правкой)

- Аппаратная кнопка «назад» и системный жест-навигация во всех трёх «живых»
  фазах звонка (`outgoing`, `connecting`, `active`) — что экран
  действительно сворачивается (а не падает/зависает на модальной
  Android-презентации), плашка «вернуться» появляется сразу, повторное
  открытие поднимает тот же `RTCView`/аудио без пересборки `RTCPeerConnection`.
  Разведка §2 уже отмечала interop-слой Fabric ViewManager как неподтверждённый
  замером — переход экрана туда-обратно по «назад» это отдельная, более узкая
  проверка того же риска.
- То же для «назад» на экране «звонок завершён» (`ended`) — там сворачивать
  уже нечего, ожидаемое поведение — обычное закрытие, плашка не должна
  появляться.

### Известное ограничение, не устранённое этой правкой

Во время активного разговора сворачивание всего приложения (`AppState` →
`background`, не «назад» на экране звонка, а домой/переключение приложений)
по-прежнему не показывает `ReturnToCallBanner` и вообще никакой индикации
звонка в системной шторке — только внутри самого приложения. Аудиотрек при
этом продолжает течь (WebRTC на нативном уровне не завязан на JS/UI-поток),
но человек, свернувший приложение целиком, а не просто нажавший «назад» на
экране звонка, не увидит, что разговор идёт, пока не откроет приложение
снова. Полноценный ответ — foreground service «Идёт звонок» с постоянным
уведомлением (этап 3, VED-222); в рамках этапа 1 это осознанный пробел,
отмеченный в `gan-harness/generator-state.md`.

## 9. Поправка по итогам оценки этапа 1 (feedback-002, итерация 4)

Сама правка «назад» из §8 внесла новую, более узкую гонку:
`reportCallScreenMounted` сбрасывала `navigatedCallId.current` в `null` при
уходе экрана («назад»), но ничего не ставило на его место при возврате
видимости — ни через `ReturnToCallBanner` (прямой `router.push`, мимо
провайдера), ни как-либо иначе. Эффект-автонавигатор в `call-provider.tsx`
следит за `[state.phase, state.call]` и при `navigatedCallId.current !==
call.id` сам вызывает `router.push` — со сброшенной меткой любая смена
фазы после «назад» (например, собеседник ответил, пока пользователь
смотрит другую вкладку) заново принудительно открывала `call/[id]`,
выдёргивая человека из текущего раздела без его участия. Второй, более
узкий путь той же дыры: «назад» → сразу «Вернуться» → смена фазы, пока
экран уже открыт вручную — эффект видел несинхронизированную метку и
пушил на уже открытый маршрут второй раз.

Решение вынесено в чистые функции рядом с остальной логикой этого экрана
(`src/lib/calls/call-screen-return.ts`, +`spec`):

- `shouldAutoNavigateToCallScreen(phase, callId, navigatedCallId)` — пушить
  ли `/call/[id]` прямо сейчас. Один раз на звонок: смена фазы сама по себе
  не повод открывать экран заново, если для этого `callId` он уже
  поднимался хоть раз.
- `nextNavigatedCallId(screenVisible, callId, previous)` — что метке делать
  при любой смене видимости экрана, кто бы её ни вызвал (автонавигатор,
  плашка, будущий deep link): видимый → встаёт на `callId`; невидимый →
  **остаётся как была**, не сбрасывается. Отказ от сброса на «назад» и есть
  весь фикс — «назад» после этого не снимает метку «этот звонок уже
  показывали», и следующая смена фазы эффект больше не трогает.

Продуктовое решение по `ended` (было явно оставлено открытым в §8,
`feedback-002.md`, «Specific Suggestions for Next Iteration», пункт 3):
**не** поднимать экран принудительно, если пользователь свернул звонок
«назад» и не возвращался — работает тот же механизм (метка уже стоит на
`callId`, `ended` для него — не новая причина пушить). Плашка «вернуться»
просто исчезает: `shouldShowReturnBanner` не включает `ended` в список фаз
показа (§8), отдельного тоста «Звонок завершён» не добавлено — решение в
пользу меньшего трения, тем же принципом, что и у самого «назад» («не
спрашивать подтверждения — это чужое для звонка трение»). Экран всё ещё
открывается принудительно, когда `ended` наступает для звонка, который ни
разу не показывался (`navigatedCallId !== callId`) — например, отказ в
микрофоне/камере на «Ответить»: там показать причину финала необходимо,
скрывать её было бы хуже, чем короткое непрошеное открытие экрана.

### Что ждёт живого телефона (добавлено этой правкой)

- «Назад» → уйти в другой раздел (не нажимая «Вернуться») → дождаться,
  что собеседник ответит или откажет, — экран не должен открыться сам;
  плашка должна обновлять текст статуса (`Вызов…` → таймер) на прежнем
  месте, не мигая и не перемонтируясь.
- «Назад» → сразу «Вернуться» → смена фазы, пока экран уже открыт, —
  не должно быть второй записи `/call/[id]` в стеке навигатора (двойное
  «назад», чтобы закрыть).
- `ANDROID_HEADER_HEIGHT_DP = 56` (`call-overlay-position.ts`, §8) — с
  увеличенным системным масштабом шрифта (Android «Размер шрифта» в
  специальных возможностях) реальная высота шапки `native-stack` может
  оказаться больше константы, и баннеры частично наедут на шапку
  `chat/[id]`/`chat/requests`/`communities/[id]`/`people/[id]` — отмечено
  в `feedback-002.md` как некритичный, но нерешённый пункт.

## 10. Поправка по итогам оценки этапа 1 (feedback-003, итерация 5)

Оценка PASS (7.9), продуктовая правка перед PR: §9 закрыла гонку, но
реализация была шире единственного названного примера — **любой** `ended`
для входящего, проигнорированного на баннере (обычный пропущенный,
отменённый звонящим, отклонённый по таймауту сервера, отвеченный с другого
устройства), тоже принудительно открывал `call/[id]` на 3 секунды, чтобы
показать «Пропущенный звонок». Для рядового пропущенного звонка это
навязчиво: человек специально не ответил, а его на 3 секунды перекрывает
полноэкранная карточка.

`shouldAutoNavigateToCallScreen` (`call-screen-return.ts`) получил четвёртый
параметр `answerAttempted` (по умолчанию `false`). Для `phase === 'ended'`
переход теперь разрешён только если он `true`: пользователь на этом
устройстве сам нажал «Ответить» (`call-provider.tsx`, `accept()` — ставит
`answerAttemptCallId.current = call.id` в начале функции, до `await`, то
есть по факту нажатия, а не по тому, успела ли фаза локально дойти до
`connecting`). Обычный пропущенный/отменённый/отвеченный-в-другом-месте
входящий эту метку не трогает — баннер просто исчезает, без замены на
тост: решение в пользу меньшего трения, тем же принципом, что и у самого
«назад». Отказ в микрофоне/камере сразу после «Ответить» по-прежнему
поднимает экран — иначе причина финала осталась бы необъяснённой.

Заодно вынесена ветка сброса `navigatedCallId` на `idle`/`incoming`
(была внутри необтестированного эффекта в `call-provider.tsx`, non-blocking
№1 из `feedback-002.md`/№1 из `feedback-003.md`) в отдельную чистую
функцию `navigatedCallIdAfterPhase(phase, current)` со `spec` — вся логика
решения теперь живёт в `call-screen-return.ts`, ничего не осталось «на
всякий случай» в эффекте.

Тесты (`call-screen-return.spec.ts`) покрывают ровно сценарии из
`feedback-003.md`: пропущенный входящий, отменённый звонящим, отвеченный
на другом устройстве — без перехода; «Ответить» + отказ микрофона —
переход. На уровне чистой функции первые три сценария код-идентичны
(`answerAttempted` не ставился) — тесты намеренно оставлены раздельными
как документация трёх разных продуктовых случаев, а не как формальность.

### Что ждёт живого телефона (добавлено этой правкой)

- Два входящих подряд от разных людей в течение 3 секунд после конца
  первого (пока висит `ENDED_AUTOCLOSE_MS`) — известная, не новая для этой
  правки гонка (`feedback-003.md`, non-blocking №3): по коду `call/[id].tsx`
  уводит устаревший экран сразу, как только `state.call` подменяется на
  новый id, не дожидаясь `idle`, зависания быть не должно, но визуальный
  скачок «открытая карточка пропущенного → баннер нового входящего» не
  проверялся живьём.
- Насколько уместно, что баннер входящего для пропущенного звонка теперь
  просто исчезает без единого сообщения (не тост, не карточка) — стоит
  посмотреть на живом устройстве, не выглядит ли это слишком тихо по
  сравнению с обычной звонилкой, которая хотя бы оставляет пропущенный
  вызов в системном журнале звонков (этот журнал у приложения свой,
  вкладка «Звонки», а не системный).

## 11. Этап 2 (VED-221) — входящий при свёрнутом и закрытом приложении

Ветка `feat/mobile-calls-2-lockscreen`. Реализует решения §3-4 выше: свой
Expo-модуль на self-managed `ConnectionService` и `@react-native-firebase/messaging`
как единственный приёмник FCM.

### Приём FCM — RNFB, разведённая версия API

Разведка (§4) называла `@react-native-firebase/messaging@26.4.0` — на
момент установки это оказалась версия с **уже убранной namespaced API**
(`import messaging from '@react-native-firebase/messaging'; messaging()...`).
Пакет экспортирует только модульный стиль: `getMessaging()`, `getToken()`,
`onMessage()`, `onTokenRefresh()`, `getInitialNotification()`,
`onNotificationOpenedApp()`, `setBackgroundMessageHandler()` — свободные
функции, первым аргументом принимающие инстанс `Messaging` от
`getMessaging()`. Это не решение этой сессии, а факт версии — код
(`src/lib/push/push-bridge.tsx`, `src/lib/push/background-handler.ts`)
целиком на модульном API, `messaging()` нигде не используется.

### Кто что принимает: RNFB vs expo-notifications

Оба остаются, но с разными обязанностями:

- **Приём FCM** — только `@react-native-firebase/messaging`. Манифест
  `expo-notifications` регистрирует свой `ExpoFirebaseMessagingService` на
  тот же `com.google.firebase.MESSAGING_EVENT` независимо от того, вызываем
  ли мы её приёмный путь — конфликт двух `<service>` на одно системное
  событие Android не гарантирует победителя (риск §4). Плагин
  `apps/mobile/plugins/with-native-calls.js` (`withAndroidManifest`,
  выполняется после `expo-notifications` в списке `plugins` из
  `app.config.ts`) вырезает из объединённого манифеста любой `<service>` с
  `MESSAGING_EVENT`, чьё имя не содержит `ReactNativeFirebaseMessaging`.
  Работает независимо от наличия `google-services.json` — RNFB подключает
  свой сервис автолинкингом (обычная Android-библиотека в `node_modules`),
  а не плагином конфигурации.
- **Показ/презентация** остаётся у `expo-notifications`: канал, разрешение,
  `Notifications.scheduleNotificationAsync` для сообщения, пришедшего на
  переднем плане, нажатие на уведомление — тот же код, что и раньше
  (`push-bridge.tsx`), только источник токена и данных пуша — RNFB, а не
  собственный приёмный путь `expo-notifications`.
- Обычные пуши чата (`buildFcmMessage`, `notification`-блок) в фоне/убитом
  приложении система показывает сама, минуя весь наш код на Android
  (штатное поведение FCM для сообщений с `notification`) — ни RNFB, ни
  `expo-notifications` этот путь не трогают, и не должны: `onMessageReceived`
  для таких сообщений в фоне не вызывается вовсе.

### Точка входа — `index.js`

`package.json#main` был `expo-router/entry`, стал `./index.js`. Новый файл
регистрирует headless-задачу отклонения (`AppRegistry.registerHeadlessTask`)
и импортирует `src/lib/push/background-handler.ts` (побочный эффект:
`setBackgroundMessageHandler`) **до** `require('expo-router/entry')` —
порядок обязателен, обработчик должен быть на месте раньше первого рендера
и раньше того, как Android успеет доставить холодный пуш.

### Разбор пуша и дедупликация — чистые модули

- `src/lib/calls/incoming-call-push.ts` (+`spec`) — `parseCallPush` и
  `isIncomingCallExpired`, без сети и нативных модулей, разбирает `data`
  ровно в том формате, что шлёт `buildCallIncomingMessage`/
  `buildCallEndedMessage` (`apps/api/.../fcm.ts`).
- `src/lib/calls/call-push-dedup.ts` (+`spec`) — `CallLifecycleTracker`:
  повторный `call.incoming` с тем же `callId`, пока он ещё «звонит», не
  поднимает второй системный вызов; `call.ended` обрабатывается один раз.
  Общий инстанс (`callLifecycleTracker`) на процесс — фоновый обработчик и
  (потенциально) передний план сверяются с одной картой, а не с двумя.
- `src/lib/calls/native-call-bridge.ts` — тонкая склейка: дедуп/просрочка →
  вызов нативного модуля. Без своего `spec`: вызывает
  `requireNativeModule('VedamatchCalls')`, которого в Jest нет (как и
  `call-provider.tsx`, у которого тоже нет спека по той же причине) —
  чистая часть решения уже покрыта тестами выше.

**Почему звонок не поднимает системный UI, пока приложение на переднем
плане.** `push-bridge.tsx`'s `onMessage` сознательно игнорирует
`call.incoming`/`call.ended`: пока приложение видно, тот же самый звонок уже
идёт через общий поток `chat-stream.tsx` → `call-provider.tsx` →
`IncomingCallBanner` (этап 1) — FCM доставляет тот же факт вторым путём
независимо от того, открыто ли приложение (сервер этого не знает). Показ
системного полноэкранного вызова поверх уже видимого баннера был бы
дублем. RNFB сам разводит это на уровне доставки: `ReactNativeFirebaseMessagingReceiver`
проверяет `SharedUtils.isAppInForeground(context)` и уводит фон/убитое
состояние в headless-путь (`setBackgroundMessageHandler`), а передний план —
в `onMessage`; наш код лишь не дублирует то, что уже показывает SSE.

### Свой нативный модуль — `modules/vedamatch-calls`

Expo Modules API (Kotlin), локальный модуль (автолинкуется из `./modules`
без публикации в npm, `expo-module.config.json` без `publication`).

- `VedamatchCallsModule.kt` — JS-интерфейс: `showIncomingCall`, `endCall`,
  `getLaunchCall`, `canUseFullScreenIntent`, `openFullScreenIntentSettings`,
  `setCallScreenActive`, события `answer`/`decline`.
  `showIncomingCall` регистрирует `PhoneAccount` (self-managed, лениво при
  первом звонке) и зовёт `TelecomManager.addNewIncomingCall` с метаданными
  в `extras` — единственный канал донести `callId`/имя/тип до
  `onCreateIncomingConnection`, которую вызывает система, а не наш код.
- `VedamatchConnectionService.kt`/`VedamatchConnection.kt` — self-managed
  `ConnectionService`/`Connection`. `onShowIncomingCallUi` строит
  уведомление (`CallNotifications`); `onAnswer`/`onReject` — путь ответа
  системными средствами (гарнитура, Bluetooth, Android Auto), не наша
  кнопка в уведомлении (та отвечает напрямую, см. ниже).
- `CallNotifications.kt` — канал «Звонки» (`IMPORTANCE_HIGH`, вибрация,
  системный рингтон по умолчанию — см. «Отклонение» ниже про WAV),
  `NotificationCompat.CallStyle.forIncomingCall` на API 31+, обычные две
  кнопки действий на более старых, `fullScreenIntent` на главную `Activity`
  приложения (берётся через `getLaunchIntentForPackage`, не по имени класса:
  модуль не знает `MainActivity` хоста на этапе компиляции — другой
  Gradle-модуль).
- `CallActionReceiver.kt` — «Ответить»/«Отклонить» из уведомления/блокировки
  без открытия UI. «Ответить»: `connection.setActive()` + запись в
  `PendingCallStore.setPendingLaunch(callId, "answer")` + запуск главной
  `Activity` — `call-provider.tsx` при старте читает это через
  `getLaunchCall()` и сам вызывает `accept()` (обычный путь принятия
  звонка, с теми же микрофон/ICE шагами, что и нажатие в баннере — не
  отдельная ветка). «Отклонить»: рвёт self-managed `Connection` локально и
  **не открывает приложение** — запускает `DeclineHeadlessTaskService`.
- `DeclineHeadlessTaskService.kt` — `HeadlessJsTaskService`, тот же
  механизм, которым сам RNFB поднимает `setBackgroundMessageHandler` из
  убитого приложения (`context.startService` +
  `HeadlessJsTaskService.acquireWakeLockNow`, скопировано с
  `ReactNativeFirebaseMessagingReceiver.java` из самого пакета) — если
  фоновый обработчик пуша надёжен, этот путь настолько же надёжен, а не
  отдельная гипотеза.
- `PendingCallStore.kt` — единственное состояние в процессе, общее для
  всех этих классов (они не имеют друг у друга прямых ссылок: Telecom и
  `BroadcastReceiver` создают свои объекты сами). Тот же приём, что
  `ExpoLinkingModule.initialURL` в `expo-linking`.

**Решение: Headless JS задача, а не прямой HTTP из Kotlin (п.4 спеки).**
Реализация на JS (`background-decline.ts`) переиспользует уже написанный и
протестированный код обновления токена (`createApiClient`, `createAuthApi`,
`singleFlight` — тот же протокол, что у `lib/auth/session.tsx`) вместо
повторной реализации Android Keystore/refresh-логики на Kotlin. Экономия
кода и меньше риска: `expo-secure-store` шифрует записи форматом,
завязанным на его же Kotlin-реализацию (`SecureStoreOptions`,
`AESEncryptor`) — читать их из стороннего Kotlin-кода означало бы
дублировать эту логику, а не просто читать `SharedPreferences`.

**Известное ограничение — рингтон.** Канал уведомлений использует
системный рингтон по умолчанию
(`RingtoneManager.getActualDefaultRingtoneUri`), не собственный
`ringtone-incoming.wav`: тот — JS/Metro-ассет (`require(...)` в
`lib/calls/ringtone.ts`), а не Android `raw`-ресурс, и по прямому URI из
Kotlin недоступен. Брендированный рингтон на экране блокировки — доработка
(копия WAV в `res/raw` модуля при сборке), не входит в объём этапа 2.

**Жизненный цикл self-managed `Connection` ограничен дозвоном.**
`call-provider.tsx` зовёт `clearNativeCall` (гасит уведомление и рвёт
`Connection`), как только звонок внутри приложения доходит до `active` —
Telecom-интеграция самого разговора (аудио-маршрутизация, Bluetooth,
«занято» при сотовом) — это этап 3 (VED-222), здесь `Connection` живёт
только пока идёт дозвон/показывается системный UI.

### Разрешения

`app.config.ts` → `android.permissions`: `MANAGE_OWN_CALLS`,
`USE_FULL_SCREEN_INTENT`, `FOREGROUND_SERVICE`,
`FOREGROUND_SERVICE_PHONE_CALL`. Первые два — «обычные» (Android выдаёт по
объявлению, без диалога), `FOREGROUND_SERVICE*` объявлены про запас под
этап 3 (фоновый сервис самого разговора), в этапе 2 не используются
рантаймом. `POST_NOTIFICATIONS` уже приходит из плагина `expo-notifications`.
`USE_FULL_SCREEN_INTENT` на Android 14+ может быть автоматически не выдан
(`NotificationManager.canUseFullScreenIntent()` возвращает `false`) — тест
на это в `app-config.spec.ts` не заменяет живую проверку (система решает
рантаймом, не по манифесту). Деградация: кнопка «Разрешить в настройках»
на вкладке «Звонки» (`(tabs)/calls.tsx`, `openFullScreenIntentSettings`),
без разрешения звонок всё равно придёт — обычным heads-up уведомлением,
не пропадает совсем.

### Сборка

`APP_CONTOUR=ru APP_CHANNEL=site npx expo prebuild --platform android --clean`
проходит чисто. `./gradlew assembleRelease -x lint` дошёл до
`BUILD SUCCESSFUL` не с первой попытки — по пути реальная сборка нашла
шесть отдельных ошибок, ни одна из них не была видна ни `tsc`, ни `jest`
(они не трогают Kotlin/Gradle/манифест вовсе, поэтому этот прогон и
обязателен перед PR, а не факультативен):

1. `modules/vedamatch-calls/android/build.gradle` не задавал
   `defaultConfig.versionName` — обязателен для Android-модуля с
   публикацией через `expo-module-gradle-plugin`, даже без реальной
   публикации в Maven. Добавлены `versionCode`/`versionName`.
2. Манифест приложения и библиотечный манифест `@react-native-firebase/messaging`
   объявляют одни и те же `<meta-data>` дефолтного канала/цвета с разными
   значениями — `processReleaseMainManifest` падал без явного
   `tools:replace`. Решение и объяснение — в самом
   `plugins/with-native-calls.js` и в §4 этого документа.
3. Порядок `withAndroidManifest`-плагинов в `@expo/config-plugins`
   компилируется в порядке, ОБРАТНОМ регистрации в `plugins`
   (`app.config.ts`) — находка, сделанная эмпирически именно на этой
   сборке (см. комментарий в `with-native-calls.js`). Плагин пришлось
   переставить в начало массива, а не в конец, как подсказывала бы
   интуиция по имени/смыслу.
4. Убрать чужой `FirebaseMessagingService` фильтрацией `modResults` не
   получилось в принципе: он объявлен в собственном библиотечном
   `AndroidManifest.xml` `expo-notifications`, а не добавлен через
   конфиг-плагин, и на этапе `expo prebuild` в файле приложения его попросту
   нет — библиотечные манифесты сливает Android Gradle Plugin только на
   этапе `./gradlew`. Сработал только штатный приём: добавить в манифест
   приложения тот же узел (полное имя класса из `namespace` в
   `expo-notifications/android/build.gradle`) с `tools:node="remove"`.
5. `modules/vedamatch-calls/android/build.gradle` не тянул
   `com.facebook.react:react-android` явно — `expo-modules-core` зависит от
   неё через `implementation`, а Gradle не пробрасывает такие зависимости
   транзитивно на compile classpath потребителя. Без неё не резолвились
   `HeadlessJsTaskService`/`HeadlessJsTaskConfig`/`Arguments`
   (`DeclineHeadlessTaskService.kt`).
6. Три мелкие, но настоящие ошибки Kotlin/Telecom API, пойманные только
   компилятором: `Connection` в `onCreateOutgoingConnection` — абстрактный
   класс, нельзя `Connection()` напрямую (`Connection.createFailedConnection(...)`
   вместо этого); `HeadlessJsTaskService.getTaskConfig` ждёт `Intent?`, а
   не `Intent`; конструкторские параметры `VedamatchConnection` были
   названы `onAnswer`/`onReject` — так же, как переопределённые методы
   `Connection.onAnswer()`/`onReject()` в том же классе, что зажигало риск
   неоднозначного резолва вызова — переименованы в `onAnswerCallback`/`onRejectCallback`.

Финальный прогон: `BUILD SUCCESSFUL in 5m 5s`, `853 actionable tasks: 183
executed, 670 up-to-date`. APK —
`apps/mobile/android/app/build/outputs/apk/release/app-release.apk` (≈162 МБ,
неотстрипанный релиз без сплита по ABI — тот же профиль, что у отладочных
сборок предыдущих этапов, стриппинг/сплит не в объёме VED-221).

Манифест проверен по факту, а не на словах:
`aapt dump permissions app-release.apk` (build-tools 36.1.0) показывает
все четыре разрешения (`MANAGE_OWN_CALLS`, `USE_FULL_SCREEN_INTENT`,
`FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_PHONE_CALL`) и подтверждает, что
`SYSTEM_ALERT_WINDOW`/`READ_EXTERNAL_STORAGE`/`WRITE_EXTERNAL_STORAGE`
по-прежнему вырезаны (`blockedPermissions`, этап 0). В
`android/app/build/intermediates/merged_manifests/release/processReleaseManifest/AndroidManifest.xml`
ровно один `FirebaseMessagingService` уровня приложения —
`io.invertase.firebase.messaging.ReactNativeFirebaseMessagingService`
(`ExpoFirebaseMessagingService` отсутствует полностью); второе совпадение
по `MESSAGING_EVENT` в файле — служебный `com.google.firebase.messaging.FirebaseMessagingService`
самого Firebase SDK с `android:priority="-500"`, он есть в манифесте любого
Android-приложения с Firebase и не конкурирует с приёмником приложения.
`VedamatchConnectionService` (`android.telecom.ConnectionService`),
`CallActionReceiver`, `DeclineHeadlessTaskService` — все три на месте с
ожидаемыми атрибутами (`BIND_TELECOM_CONNECTION_SERVICE`,
`exported="false"`).

### Поправки по итогам оценки (feedback-001, итерация 2)

Оценщик нашёл два блокирующих дефекта — оба про то, что задание прямо
просило проверить, и ни один не был закрыт в первой итерации.

**Блокирующий п.1 — гонка refresh-токена между фоновым отклонением и
живым `SessionProvider`.** До этой правки `background-decline.ts` держал
свою собственную in-memory копию токенов и свой `singleFlight refresh`,
полностью независимый от `session.tsx`. Когда приложение просто свёрнуто
(не убито), `DeclineHeadlessTaskService` выполняется в том же JS-движке,
что и UI — оба «независимых» refresh на деле делили один процесс, не зная
друг о друге. Ротация refresh-токена одним из них делала копию другого
протухшей; следующее предъявление этой копии сервер (детектор повторного
использования) читал как кражу и отзывал все сессии человека — телефон,
с которого просто отклонили звонок из шторки, тихо разлогинивал владельца
при следующем открытии приложения.

Починено единым источником правды — `src/lib/auth/token-authority.ts`
(+`spec`, 10 тестов, включая ровно три сценария из задания: «прочитать
свежие → refresh → записать», «два параллельных вызова → один refresh»,
«access, обновлённый другим участником, подхватывается без refresh»).
Модуль — синглтон (`export const tokenAuthority`): и `session.tsx`, и
`background-decline.ts` импортируют один и тот же модуль, получают одну и
ту же замыкающую переменную и один и тот же `singleFlight`, а не два
экземпляра с одинаковым кодом. `refresh()` всегда перечитывает
`SecureStore` перед сетевым обменом (не доверяет `cached`), а при отказе
с не изменившейся с момента чтения парой — перечитывает ещё раз на случай,
если кто-то успел обновиться, пока шёл сетевой запрос. `background-decline.ts`
теперь сначала пробует текущий access без сети (`getAccessToken()`), при
401 сперва дёшево перечитывает `SecureStore` (`rereadAccessToken()` — вдруг
кто-то уже обновился) и только если токен там тот же — идёт в сетевой
`refresh()`. `session.tsx` лишился собственных `tokensRef`/`adoptRef`/
`singleFlight` целиком и подписан на `tokenAuthority.subscribe(...)`,
чтобы реагировать на изменения токенов не по своей инициативе (тот же
фоновый путь) — но в этой итерации подписка была мёртвым кодом (stale
closure): чинилось это в следующей итерации, см. §«Поправки по итогам
оценки (feedback-002, итерация 3)» ниже.

**Блокирующий п.2 — «Ответить» из свёрнутого (не убитого) приложения не
принимал звонок автоматически.** `CallActionReceiver.kt` на «Ответить»
шлёт JS-событие `answer` синхронно с запуском `Activity` — заведомо
раньше, чем поток событий (`chat-stream.tsx`) переоткроется после
`AppState` → `active` и `reconcile()` успеет получить сам звонок через
`GET /chat/calls/active`. Старый обработчик `answer` требовал точного
совпадения `phase === 'incoming'` в момент события — почти всегда
промахивался, событие терялось безвозвратно, и человеку приходилось
нажимать «Ответить» второй раз уже внутри приложения — при том, что
`getLaunchCall()`-путь (по-настоящему убитое приложение) работал верно
только потому, что срабатывал при монтировании, когда состояние ещё пусто.

Починено чистым модулем `src/lib/calls/pending-call-answer.ts` (+`spec`,
6 тестов) — `PendingCallAnswer` запоминает `callId`, для которого ответ уже
решён, до тех пор, пока звонок с этим `callId` не появится в состоянии
(`call.ringing` из потока или `restore` из `reconcile()`); тогда
`call-provider.tsx` принимает его сам. Одна очередь на оба источника
(`getLaunchCall()` при холодном старте и JS-событие `answer` для тёплого)
— повторный `request()` тем же `callId` не создаёт второй отложенный
ответ, поэтому одновременное срабатывание обоих путей не даёт двойной
`accept()` (см. тест «повторный `request()` тем же `callId`…»). Если
`answer` пришёл, а звонка в состоянии ещё нет — обработчик сразу зовёт
`reconcile()` напрямую (не только через `AppState`/`onResync`, а
немедленно), не дожидаясь, пока поток событий сам решит переоткрыться.

**Non-blocking, закрыто тем же заходом:**

- `VedamatchCallsModule.kt`, `showIncomingCall` — `ensurePhoneAccount`/
  `TelecomManager.addNewIncomingCall` обёрнуты в `try/catch`: при отказе
  (конфликт с другим self-managed приложением, запрет конкретного OEM,
  `SecurityException`) звонок не теряется молча — деградация до того же
  уведомления, что в штатном пути рисует `CallNotifications.show()` по
  сигналу `onShowIncomingCallUi()`, просто без самого self-managed звонка
  и системной интеграции с ним (Bluetooth/гарнитура, «занято» при
  сотовом — недоступны в этом режиме, это ожидаемая, а не скрытая потеря
  функциональности).
- `VedamatchConnection.kt`, `onReject()` (путь через системные кнопки —
  гарнитура/Bluetooth, не через `CallActionReceiver`) — добавлен
  `PendingCallStore.removeConnection(callId)` для симметрии с
  `onDisconnect()`/`disconnectFromApp()`. Заодно поправлен риск: `cancel(...)`
  использовал `applicationContextOrNull() ?: return` — при отсутствии
  контекста это молча обрывало всю функцию `onReject()`/`onAnswer()` до
  вызова колбэка и очистки; теперь `?.let { ... }` не мешает остальному
  телу функции выполниться в любом случае.

### Регрессия обычных пушей о сообщениях (VED-171) — проверено по исходникам

Отдельный запрос владельца `push-bridge.tsx`: после того как приём FCM
целиком перешёл к RNFB (§«Кто что принимает» выше), три места, где раньше
стоял `expo-notifications`, могли молча перестать работать. Разобрано по
исходникам (не гипотеза):

1. **Токен при свежей установке.** `push-bridge.tsx` больше не вызывает
   `Notifications.getDevicePushTokenAsync()` вовсе — токен идёт через
   `getToken(getMessaging())` (RNFB) с самого начала этой сессии
   (`docs/mobile-calls-native.md`, разведка §4/§9). Вопрос «продолжит ли
   Expo отдавать токен без своего сервиса» неактуален: старый путь не
   используется, а не деградировал.
2. **Ротация токена.** `Notifications.addPushTokenListener` (слушал
   `ExpoFirebaseMessagingService.onNewToken`, который теперь вырезан) в
   коде не осталось — `grep` по `src/` подтверждает: ни одного упоминания
   `addPushTokenListener`/`getDevicePushTokenAsync`, кроме поясняющего
   комментария. Ротация идёт через `onTokenRefresh(getMessaging(), ...)`
   (RNFB) — тот же `send(token)` с `nativeCalls: true`, что и при первом
   получении.
3. **Тап по обычному пушу при убитом/свёрнутом приложении.** Система
   показывает такие пуши сама (`notification`-блок, `buildFcmMessage`) —
   ни RNFB, ни `expo-notifications` не участвуют в показе, но **обработка
   тапа** нужна отдельно: `getInitialNotification(getMessaging())`
   (холодный старт) и `onNotificationOpenedApp(getMessaging(), ...)`
   (приложение было в фоне) — оба уже стояли в `push-bridge.tsx` до этого
   feedback-захода, разбирают `RemoteMessage.data.url` тем же
   `pushTarget()`, что и презентованные самим приложением уведомления.
   Вынесено явным чистым модулем: `rnfbMessageUrlOf()`
   (`src/lib/push/push-url.ts`, +`spec`) — тот же приём, что `pushUrlOf()`
   для формы `Notifications.Notification`, только для формы RNFB
   `RemoteMessage`; `push-bridge.tsx` зовёт его вместо инлайновой проверки
   `typeof message.data?.url === 'string'` в двух местах.

Живая проверка (VED-171 уже проходила на телефоне раньше — регрессия
недопустима) — в чек-листе `generator-state.md`: свежая установка → токен
долетает до сервера (`POST /notifications/devices` в логах API); тап по
обычному пушу о сообщении при полностью убитом и при свёрнутом приложении
→ открывает нужную беседу в обоих случаях.

### Поправки по итогам оценки (feedback-002, итерация 3)

Оценщик засчитал, что сама гонка refresh-токена (двойной сетевой обмен
одним refresh-токеном → сервер отзывает все сессии) устранена корректно, но
новый механизм «UI узнаёт о разлогине из фона сразу» оказался мёртвым кодом.

**Блокирующий п.1 — stale closure в подписке `session.tsx`.**
```ts
useEffect(() => {
  return tokenAuthority.subscribe((tokens) => {
    if (tokens) scheduleRefresh(tokens.accessToken);
    else if (status !== 'loading') { ... }
  });
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [scheduleRefresh]);
```
`scheduleRefresh` зависит только от `refresh`, а `refresh = tokenAuthority.refresh`
— один и тот же объект-функция синглтона на весь процесс, значит
`scheduleRefresh` не меняет идентичность НИКОГДА между рендерами, и весь
`useEffect` с зависимостью `[scheduleRefresh]` выполняется ровно один раз —
при монтировании. Замыкание внутри навсегда захватывало `status` таким,
каким он был на самом первом рендере (`'loading'`) — ветка `status !==
'loading'` не проходила никогда. Если фоновое отклонение реально роняло
сессию (`tokenAuthority.refresh()` → `setCached(null)`), живой
`SessionProvider` оставался в `status: 'signed'` навсегда — приложение
выглядело вошедшим, но ничего не работало: `api/client.ts` на 401 без
токена не звал `onSessionExpired` (условие `response.status === 401 &&
token` ложно при отсутствующем токене), `chat-stream.tsx` на пустом
`getAccessToken()` просто не открывал поток без всякой ошибки.

Починено переносом решения в чистую функцию `src/lib/auth/session-token-reaction.ts`
(+`spec`, 5 тестов — ровно три сценария из задания плюс два вырожденных:
`loading` → `ignore`, `signed`+нет токенов → `mark-guest`, `guest`+токены
есть → `mark-signed`, `signed`+токены есть → `reschedule`, `guest`+нет
токенов → `ignore`). Вызывающий код (`session.tsx`) больше не читает
`status` из замыкания рендера: `statusRef` — обычный `ref`, синхронизируется
с `status` отдельным эффектом (`useEffect(() => { statusRef.current =
status }, [status])`), и именно `statusRef.current` (актуальный на момент
СОБЫТИЯ подписки, а не на момент её регистрации) передаётся в
`reactToTokenChange`. `eslint-disable` снят — все значения в замыкании
подписки теперь либо стабильны (`scheduleRefresh`), либо читаются через
`ref`, exhaustive-deps ничего не требует сверх `[scheduleRefresh]`.

Заодно поправлен `apps/mobile/src/lib/api/client.ts`: на 401 без токена
вовсе (не «протух», а отсутствует) теперь тоже зовётся `onSessionExpired`
— раньше условие `response.status === 401 && token` делало это место
немым именно в сценарии «сессия уже мертва, токена нет совсем».

**Важное п.2 — `token-authority.ts` стирал токены при любом отказе
`refresh()`, кроме сетевой недоступности (`status === 0`).** Это значило,
что 5xx/таймаут/неопознанный ответ от `/auth/app/refresh` (временная
недоступность сервера, не отказ конкретно этому человеку) тоже считались
концом сессии — вероятная причина VED-234 («приложение теряет вход после
обновления/перерыва»). В этой итерации токены перестали стираться при 5xx —
но модуль в этот момент всё ещё возвращал СТАРЫЙ (уже отвергнутый) access
как если бы обновление удалось; оказалось, что этого недостаточно —
`client.ts` не различал такой ответ от настоящего успеха и слепо повторял
запрос тем же токеном, получал второй 401 и вызывал `onSessionExpired` сам,
сводя фикс на нет в реальной композиции с `session.tsx`. Полное решение
этой проблемы — только в следующей итерации, см. ниже.

Отдельно — `token-store.ts`: `SecureStore.getItemAsync` при отказе чтения
(повреждённый ключ Android Keystore, смена блокировки экрана) теперь не
пробрасывает исключение наружу необработанным (раньше `readTokens()` могло
упасть без `try/catch`, и эффект восстановления сессии в `session.tsx`
остался бы в `status: 'loading'` навсегда, не поймав отказ) — ловится,
пишется `console.warn` с типом/сообщением ошибки (без значений токенов —
их и не могло оказаться, чтение как раз не удалось) и отдаётся `null`, как
обычное «токенов нет». Причину отличить от честного «нет входа» теперь
можно по логу, не только по поведению.

**Non-blocking, тем же заходом:** убран избыточный второй
`scheduleRefresh(pair.accessToken)` в `adopt()` (`session.tsx`) —
`tokenAuthority.adopt()` и так уведомляет подписчиков синхронно, тот же
`SessionProvider` подписан ниже и сам перепланирует таймер через
`reactToTokenChange`; `VedamatchCallsModule.kt` — пойманное исключение
`showIncomingCall` теперь логируется (`Log.w`), а не проглатывается молча.

### Поправки по итогам оценки (feedback-003, итерация 4)

Оценщик воспроизвёл регрессию не гипотетически, а прогнав одноразовый
композитный тест на реальных `createApiClient` + `createTokenAuthority`:
при 5xx от `/auth/app/refresh` `token-authority.refresh()` возвращал СТАРЫЙ
(уже отвергнутый секундой раньше) access-токен как единственный видимый
снаружи результат — по сигнатуре `Promise<string | null>` непустая строка
неотличима от «получили новый рабочий токен». `client.ts` слепо повторял
запрос этим же токеном, получал второй 401 и трактовал это как «обновиться
не вышло» → `onSessionExpired()` → `dropSession()` → `clearTokens()` —
токены стирались из-за временной недоступности сервера, а не из-за
реального конца сессии. Ровно тот путь, которым сессия обычно и
обновляется (`session.tsx`), а не редкий фоновый случай.

**Блокирующий п.1 — `refresh()` возвращает различимый результат.**
`SessionRefreshResult` (`apps/mobile/src/lib/api/client.ts`) — три исхода:
`{ kind: 'refreshed', accessToken }` / `{ kind: 'rejected' }` / `{ kind:
'unavailable' }`. `token-authority.ts` возвращает их вместо голой строки:
`'rejected'` только на явный 401/403 (или когда пары вовсе нет — спасать
нечем); `'unavailable'` на сеть/5xx/неопознанный ответ, токены не тронуты.
`client.ts` (`decideAfterRefresh()`, чистая функция с собственными
`describe`-тестами в `client.spec.ts`) реагирует по-разному:
`'refreshed'` — повтор запроса новым токеном (второй 401 после этого — уже
настоящий конец сессии, `onSessionExpired` тоже звонит); `'rejected'` —
`onSessionExpired` сразу; `'unavailable'` — **не** трогает сессию и **не**
повторяет запрос тем же токеном, бросает `ApiError(status: 0, 'Нет связи с
сервером...')`, чтобы вызывающий экран показал «повторить», а не увёл на
логин.

**Важное п.2 — повторная попытка проактивного `refresh()` при
`'unavailable'`.** `apps/mobile/src/lib/auth/refresh-backoff.ts`
(`nextRefreshBackoffMs`, +`spec`) — геометрическая пауза (множитель 3, от
5 с, потолок 5 мин), чистая функция от номера попытки. `session.tsx`:
`runProactiveRefresh()` — общее тело и обычного проактивного обновления
(по истечении access), и повтора после `'unavailable'` — при `'unavailable'`
сам себя перепланирует с растущей паузой; при `'refreshed'`/`'rejected'`
ничего сверх не делает (эти два исхода уже прошли через `setCached()` →
`notify()` → подписку, которая сама перепланирует обычный интервал или
остановит всё). Счётчик попыток (`backoffAttempt`) сбрасывается при успехе
(`scheduleRefresh()`), при `drop()`/выходе и при переходе `AppState` →
`mark-guest`. `AppState` → `'active'`, пока идёт цикл бэкоффа — немедленная
попытка без ожидания остатка паузы; `AppState` → `'background'` — таймер
повтора останавливается (не жжёт батарею ради попыток, которых никто не
увидит), следующий foreground или явный запрос попробуют снова.

**Композитный тест — п.3 задания.** `apps/mobile/src/lib/auth/session-composite.spec.ts`:
настоящие `createApiClient` + `createTokenAuthority`, мок только на уровне
`token-store` (как в `token-authority.spec.ts`), никаких моков друг друга.
Три сценария: `refresh` отвечает 502 → `onSessionExpired` не вызван, токены
в хранилище целы, запрос падает `ApiError(status: 0)`; `refresh` отвечает
401 → `onSessionExpired` вызван, токены стёрты; `refresh` сначала 502,
потом 200 (второй `api.request()`, имитирует ручной повтор) → второй запрос
проходит. Это ровно та граница, где предыдущая итерация была ошибочно
засчитана закрытой — юнит-тесты `token-authority.spec.ts` и
`client.spec.ts` по отдельности были и остаются зелёными, дыра была только
в их совместной работе.

**Фоновое отклонение (п.4 задания).** `background-decline.ts` уже
полностью делегировал `refresh()` `tokenAuthority` (никогда не стирал
токены сам) — обновлён под новый контракт: `'unavailable'`/`'rejected'`
оба просто отдают `false`, не повторяя запрос тем же токеном. `'unavailable'`
здесь не запускает свой бэкофф-цикл (headless-задача разовая, не живёт
достаточно долго для таймера) — следующий вызов «Отклонить» или обычный
запуск приложения попробуют снова сами.

**Важная честная граница того, что проверено.** Композитный тест —
по-прежнему юнит-уровень (реальные модули, но замоканы `token-store` и
`fetch`), не интеграционный прогон на устройстве и не e2e через реальный
`/auth/app/refresh`. Бэкофф-таймер (`runProactiveRefresh`,
`AppState`-переключение) НЕ покрыт автоматическим тестом — `session.tsx` не
юнит-тестируется в этом репозитории вовсе (нет
`react-test-renderer`/`@testing-library/react-native` в зависимостях, тот
же факт, что уже отмечался в `feedback-002.md`); проверена только чистая
арифметика пауз (`refresh-backoff.spec.ts`) и то, что `client.ts` два раза
подряд успешно восстанавливается после временного 502 (композитный тест,
сценарий 3) — но НЕ то, что реальный `setTimeout`-таймер в `session.tsx`
действительно срабатывает с нужной паузой и действительно перезапускается
при возврате в foreground. Это разница между «арифметика верна» и
«таймер в реальном React-дереве ведёт себя как описано» — вторую часть
подтвердит только живой телефон или ручной интеграционный прогон, которого
в этой итерации не было.

### Что ждёт живого телефона

Перечислено чек-листом в `gan-harness/generator-state.md`: показ на
заблокированном экране, ответ из полностью убитого приложения **и отдельно
из свёрнутого, но не убитого** (два разных сценария, feedback-001
блокирующий п.2 — именно второй был сломан), отклонение из фона без
открытия UI, гашение рингтона по `call.ended`/ответу на другом устройстве,
поведение `USE_FULL_SCREEN_INTENT` на конкретном Android 14+ устройстве.
Отдельно стоит проверить п.1 (refresh-токен): позвать «Отклонить» из
шторки при свёрнутом приложении несколько раз подряд с разных звонков и
убедиться, что после этого обычный вход/работа приложения не обрывается
внезапным разлогином — синтетическая гонка (`token-authority.spec.ts`)
проверена, но реальное поведение `SecureStore`/таймингов на живом
Android-устройстве — нет. Ничего из этого не подделано и не имитировано в
коде — там, где поведение зависит от системы (Doze, ограничения фона у
конкретного вендора, реальный `TelecomManager`), оно оставлено
непроверенным, а не описано как готовое.

## 12. Этап 3 (VED-222) — звонок как у системной звонилки

Ветка `feat/mobile-calls-3-system-call`. Разговор из этапа 2 теперь живёт не
только до ответа, а весь свой срок: служба переднего плана с постоянным
уведомлением, аудиомаршрутизация, датчик приближения, «не гаснуть» на видео,
картинка в картинке, немедленный перезапуск ICE при смене сети, «занято» при
конфликте. Главная структурная правка по сравнению с этапом 2 — self-managed
`Connection` и уведомление входящего больше не гасятся сразу, как только
`call-provider.tsx` видит `phase === 'active'` (`clearNativeCall` раньше
вызывался на `active` ИЛИ `ended`, объединённым эффектом с одной меткой): это
было осознанным ограничением этапа 2 («здесь self-managed `Connection`
сознательно живёт только до `active`», §11 выше) и ровно тем, что должен был
закрыть этот этап. Теперь `active` и `ended` — два независимых, а не
взаимоисключающих события жизненного цикла (`call-provider.tsx`,
`startedOngoingFor`/`nativeClearedFor` — раздельные ref-метки, раздельные
эффекты).

### 12.1. Служба переднего плана — `CallForegroundService`

`modules/vedamatch-calls/android/.../CallForegroundService.kt`. Обычный
`Service` (не `JobService`/`WorkManager` — разговору нужен immediate
foreground-статус, а не отложенный запуск), стартует/останавливается только
из `VedamatchCallsModule` (`startOngoingCall`/`endCall`), которые дёргает
`call-provider.tsx` на переходах `phase → 'active'`/`phase → 'ended'` —
единая точка входа, как и у остального модуля.

- **Уведомление.** `CallNotifications.buildOngoing()` — свой канал
  `calls_ongoing` (`IMPORTANCE_LOW`, без звука/вибрации: канал `calls` для
  входящего специально громкий, а разговор уже идёт, тревожить нечем).
  `CallStyle.forOngoingCall` на API 31+, ручной `contentTitle`/`contentText`
  с кнопкой «Завершить» на более старых. Время — `setUsesChronometer(true)` +
  `setWhen(connectedAtMs)`: система сама тикает раз в секунду без повторных
  `notify()` (`setOnlyAlertOnce(true)`), это одновременно дешевле по батарее
  и совпадает с тем, как считает `call-timer.ts` на самом экране (тот же
  `connectedAt`). Буквальный формат из карточки «Идёт звонок · имя · 01:23»
  — описание содержимого уведомления (имя, состояние, тикающий таймер), а не
  шаблон для склейки в одну строку: `CallStyle` не даёт вставить произвольный
  текст на место системного рендера времени, тем же способом собраны
  уведомления WhatsApp/Telegram/системной звонилки.
- **Нажатие на уведомление.** Не `launchAppIntent` (как у входящего) — прямой
  deep link `vedamatch://call/<id>` (`Intent.ACTION_VIEW`, `scheme` из
  `app.config.ts`, `expo-router` разбирает сам): «нажатие — вернуться в экран
  звонка» буквально, без промежуточного «Вернуться» на `ReturnToCallBanner».
- **`foregroundServiceType`.** Манифест модуля объявляет `phoneCall|
  microphone|camera` статически (Android 14 требует объявлять ровно то
  надмножество типов, которое сервис хоть раз передаст в
  `startForeground(id, notification, type)` в рантайме); сам вызов
  (`ServiceCompat.startForeground`, androidx.core — сам ветвится по
  `Build.VERSION.SDK_INT`, дублировать проверку версии не нужно) передаёт
  `phoneCall|microphone` для аудио и добавляет `camera` только для видео —
  не «на всякий случай оба всегда», а по факту типа звонка. Разрешения —
  `FOREGROUND_SERVICE_MICROPHONE`/`FOREGROUND_SERVICE_CAMERA` добавлены в
  `app.config.ts` рядом с уже бывшим там `FOREGROUND_SERVICE_PHONE_CALL`
  (этап 2) — без них `startForeground` с этими типами бросает
  `SecurityException` в рантайме на Android 14+, манифест тут не спасает.
- **Остановка на всех путях.** `endCall` в `VedamatchCallsModule` (JS-инициированный
  конец — сервер, кнопка на экране, наша кнопка «Отклонить»/«Завершить» на
  уведомлениях) безусловно зовёт `CallForegroundService.stop()`, даже если
  сервис не был запущен (`context.stopService` на не запущенной службе —
  no-op, не исключение). `VedamatchConnection.onDisconnect()` (Telecom решил
  сам — см. 12.5) тоже зовёт `CallForegroundService.stop()` напрямую, не
  дожидаясь JS: если что-то в JS зависло, уведомление не должно висеть вечно.
  `onTaskRemoved()` — отдельное решение, см. 12.2.

### 12.2. `onTaskRemoved` — смахнули из списка задач во время разговора

Спека прямо называет `onTaskRemoved` примером пути, на котором служба
обязана остановиться («останавливать при ended на всех путях, в т.ч. крах
JS — onTaskRemoved»). Решение этой реализации: **звонок завершается**, а не
продолжает жить без единой управляющей поверхности.

Это различает два разных действия пользователя, которые снаружи выглядят
похоже:

- **простое сворачивание** (кнопка «домой», переключение на другое
  приложение, блокировка экрана) `onTaskRemoved` вообще не вызывает —
  разговор в этом сценарии продолжается штатно, ради него и существует вся
  служба (звук течёт на нативном уровне независимо от JS/UI-потока, это уже
  отмечено в §8/§11 выше как факт, не гипотеза);
- **явный смах из списка последних задач** — системный сигнал «эту задачу
  закрывают». Самоуправляемый `Connection` без ответной реакции остался бы
  зарегистрированным в Telecom с уведомлением, которое нечем погасить, если
  процесс позже всё-таки убьёт агрессивная политика энергосбережения
  конкретного производителя (тема этапа 4/VED-223) — разорвать самим, пока
  это ещё можно сделать чисто (отдать корректный `DisconnectCause`, снять
  `startForeground`), безопаснее, чем оставить зависший self-managed звонок,
  который не сможет завершить никто, кроме System UI «Принудительно
  остановить».

Компромисс осознанный и обратный тому, как ведут себя WhatsApp/Telegram
(они переживают смах из списка последних задач без завершения звонка) — это
разница в архитектуре, не недосмотр: их процесс поддержан их собственной,
годами обкатанной инфраструктурой удержания процесса живым при любом
состоянии задачи; здесь этого нет и разница между «действительно убитый
процесс» и «просто смахнутая задача, но живой foreground-сервис» на этой
кодовой базе не была бы надёжно различима без отдельного исследования (тема
для этапа 4, если реальные пользователи будут жаловаться на этот конкретный
кейс — сейчас это не подтверждённая проблема, а предохранитель от другой,
подтверждённой: зависшее уведомление без способа его закрыть).

### 12.3. Аудиомаршрутизация — `react-native-incall-manager`, не `CallEndpoint`

Спека прямо ставит выбор: `CallEndpoint`/`Connection.setAudioRoute` (API
34+) с падением на `AudioManager`/`react-native-incall-manager`, или
`react-native-incall-manager` сам по себе. Выбор этого этапа —
**`react-native-incall-manager` единолично**, без параллельной интеграции
через `Connection`:

- Библиотека уже стояла на экране звонка с этапа 1
  (`InCallManager.start()`/`setForceSpeakerphoneOn`/`setKeepScreenOn`) и уже
  разведана в этапе 0 как совместимая с new architecture (`docs/mobile-calls-native.md`
  §2, «оставляем», релиз от «вчера» на момент разведки).
- Чтение исходников модуля (`InCallManagerModule.java`,
  `startOnLifecycleThread`/`startEvents`) показало, что почти весь список
  требований карточки уже реализован внутри библиотеки, а не требует новой
  инфраструктуры:
  - `defaultSpeakerOn = (media == "video")` — earpiece по умолчанию для
    аудио, громкая связь для видео (п.2 карточки, безо всякого кода с нашей
    стороны, просто вызвать `start({media: call.kind})`, что уже делал экран
    звонка);
  - `audioManager.setMode(MODE_IN_COMMUNICATION)` +
    `AudioFocusRequest.Builder(AUDIOFOCUS_GAIN_TRANSIENT)` — именно те два
    системных вызова, которые называет карточка для «музыка другого
    приложения на паузу»;
  - `bluetoothManager.start()` (`AppRTCBluetoothManager`) и
    `startWiredHeadsetEvent()` — автоматическое подключение Bluetooth SCO и
    проводной гарнитуры, без нашего кода;
  - `startProximitySensor()` — датчик приближения, см. 12.4.
- Держать `CallEndpoint`/`Connection.setAudioRoute` ПАРАЛЛЕЛЬНО означало бы
  два независимых источника правды за один и тот же аудиофокус/SCO-канал:
  `InCallManager` управляет `AudioManager` напрямую (не через Telecom), а
  `CallEndpoint` управляет тем же через Telecom — при рассинхроне (например,
  человек нажал кнопку в самом приложении, которая идёт через
  `InCallManager`, пока Telecom думает, что маршрут другой) неясно, кто
  победит. Единственный явный API нашего кода — `chooseAudioRoute()`
  библиотеки (`audio-route-bridge.ts`), полностью в обход `Connection`.
- **Отклонение и почему.** `CallEndpoint` (API 34+) — самый «нативный» путь
  по духу задания («используй возможности платформы»), но он привязан
  именно к managed/self-managed вызовам через Telecom-сессию конкретного
  `Connection`, а наш self-managed `Connection` для части звонков (отвеченных
  целиком внутри уже открытого приложения без пуша, см. 12.7) может не
  существовать вовсе — аудиомаршрутизация в этом случае обязана работать и
  без него. `InCallManager` не завязан на существование `Connection` и
  работает одинаково для всех путей ответа — эта устойчивость перевесила
  «более нативный» API, доступный только с 34-й версии (устройство ниже
  API 34 получило бы деградацию до `AudioManager`-фолбэка карточки в любом
  случае — то есть тот же `InCallManager`, просто под другим именем).
- **Кнопка выбора устройства (`>2` маршрутов).** `onAudioDeviceChanged`
  (нативное событие библиотеки, не переэкспортированное её собственной
  JS-обёрткой — подписка напрямую через
  `NativeEventEmitter(NativeModules.InCallManager)`, `audio-route-bridge.ts`)
  даёт `{availableAudioDeviceList, selectedAudioDevice}`; чистый разбор и
  решение «показывать ли пикер» — `audio-route.ts` (+spec). Экран
  (`app/call/[id].tsx`) переключает обычную кнопку «громкая связь вкл/выкл»
  (был на этапе 1) на кнопку-пикер, только когда реально есть из чего
  выбирать (Bluetooth или проводная гарнитура подключены — простого набора
  «динамик/телефон» пикер не показывает, там достаточно переключателя).

### 12.4. Датчик приближения

Не отдельный код — `InCallManager.start()` сам вызывает
`startProximitySensor()` при каждом звонке и сам решает, когда гасить экран:
комментарий в её нативном коде («proximity event always enable, but only
turn screen off when audio is routing to earpiece») подтверждает ровно то
поведение, которое просит карточка — не во время видео и не на громкой
связи, только на разговорном динамике. `PROXIMITY_SCREEN_OFF_WAKE_LOCK`
(`InCallProximityManager.java`) захватывается/освобождается парно самой
библиотекой при каждом изменении состояния датчика — снаружи ничего
дополнительно синхронизировать не нужно. Единственная наша обязанность —
не мешать: `keep-awake.ts`/п.12.5 ниже гарантируют, что наш собственный
`setKeepScreenOn` не спорит с этим на аудиозвонке.

### 12.5. «Не гаснуть» — только видео, только на этом экране

Было: `InCallManager.setKeepScreenOn(true)` безусловно для любого типа
звонка (плюс сама библиотека и так включает это внутри `startEvents()` при
каждом `start()`, независимо от того, что просит наш код). Стало:
`shouldKeepScreenAwake(kind)` (`keep-awake.ts`, +spec) — `true` только для
видео; вызывается сразу после `InCallManager.start()`, перекрывая
внутренний вызов библиотеки (оба идут на один и тот же нативный модуль
последовательно, второй вызов побеждает). Для аудио экран гаснет по
обычному таймауту устройства, если человек не поднёс трубку к уху (датчик
приближения решает это отдельно, 12.4) — то есть работает так же, как у
системной звонилки: не держим экран принудительно там, где для этого нет
причины.

### 12.6. Картинка в картинке

Реализована через свой модуль, как и просит спека для случая «expo-router
мешает» — `MainActivity.kt` генерируется `expo prebuild` из шаблона, значит
любая правка обязана идти через конфиг-плагин, а не редактированием файла
руками (он не в git, `expo prebuild --clean` уничтожил бы правку).
`@expo/config-plugins` не даёт AST-парсера для Kotlin, только сырой текст
(`withMainActivity`, `modResults.contents`/`.language`) — `plugins/with-native-calls.js`
(`withCallPip`) вставляет импорты после `package ...` и два метода перед
последней закрывающей скобкой файла (закрывает `class MainActivity`), тем
же приёмом, каким большинство community-плагинов правят `MainActivity`/
`MainApplication`: искать маркер конца класса, не номер строки (он сломается
от любой будущей правки шаблона Expo/RN).

- **Манифест.** `android:supportsPictureInPicture="true"` добавлен тем же
  `withAndroidManifest`, что уже правит FCM-сервисы (этап 2) — один узел
  `<activity android:name=".MainActivity">`, один дополнительный атрибут.
  `android:configChanges` у этого узла уже содержит
  `screenSize|screenLayout|smallestScreenSize|orientation` из стандартного
  RN-шаблона — ровно то, что нужно PiP, чтобы смена размера окна не
  пересоздавала `Activity` (и вместе с ней — WebRTC-сессию в JS). Ничего
  довобавлять не пришлось, только проверить, что уже есть (проверено чтением
  сгенерированного `android/app/src/main/AndroidManifest.xml`).
- **API 31+.** `VedamatchCallsModule.setPipEligible(eligible)` вызывает
  `Activity.setPictureInPictureParams(...setAutoEnterEnabled(eligible))` —
  система сама поднимает PiP при уходе домой/переключении приложений, без
  вызова `enterPictureInPictureMode()` из нашего кода.
- **API 26-30.** Автовхода нет — `MainActivity.onUserLeaveHint()` (вставлен
  плагином) читает статический флаг `PipState.eligible` (пишет тот же
  `setPipEligible`) и входит в PiP вручную
  (`enterPictureInPictureMode(params)`), в try/catch — отказ конкретного
  OEM не должен ронять экран звонка.
- **Ниже API 26.** PiP не существует в системе, `setPipEligible` не делает
  ничего, кроме сохранения флага (безопасный no-op).
- **Что показывает PiP.** `MainActivity.onPictureInPictureModeChanged`
  шлёт JS событие `pipModeChanged` — `app/call/[id].tsx` прячет статус,
  кнопки, локальное превью, плашку relay и заглушку-аватар (если удалённого
  видео вдруг нет) по флагу `inPip`, оставляя только `RTCView` удалённого
  потока на весь экран — буквально «только видео собеседника без кнопок» из
  карточки.
- **Когда PiP разрешён.** `isPipEligible(kind, phase, screenVisible)`
  (`pip-eligibility.ts`, +spec) — только видео, только `phase === 'active'`,
  только пока `app/call/[id].tsx` смонтирован: дозвону нечего показывать
  (нет удалённого видео), а если человек уже ушёл с экрана «назад»
  (`call-screen-return.ts`, `ReturnToCallBanner`), внезапное окошко PiP
  поверх того, что он делает, было бы навязчивым, а не помощью.

### 12.7. Немедленный перезапуск ICE при смене сети

`ice-restart-policy.ts` (+spec) — чистая функция `shouldRestartIceOnNetworkChange(phase,
role, previous, next)`. Нативная сторона (`VedamatchCallsModule`,
`ConnectivityManager.registerDefaultNetworkCallback`) репортит только сырой
факт — на каком транспорте сейчас активная сеть (`wifi`/`cellular`/
`ethernet`/`other`/`none`), само решение «перезапускать ли» не принимает,
как и всюду в этом модуле (сырые факты нативно, решения — в JS-спеках).
Слушатель регистрируется/снимается вместе со службой разговора
(`startOngoingCall`/`endCall`) — вне разговора события никому не нужны и
не приходят.

**Асимметрия «только звонящий» — намеренная, не пропуск.** Перезапуск ICE
технически — новый offer с `iceRestart: true`
(`webrtc-session.ts#restartIce`), а offer в этом протоколе сигналинга
всегда делает звонивший (`call-machine.ts`; «принятой»/perfect negotiation
схемы, где отвечающая сторона тоже может инициировать renegotiation, в этом
кодовом пути нет — она уже отсутствовала до этого этапа, `restartIce()` и
на `'failed'`-таймауте вызывался только у `role === 'caller'`, это этап 3
лишь переиспользует). Смена сети на стороне ВЫЗЫВАЕМОГО поэтому не
перезапускает ICE отсюда напрямую — она всё равно дойдёт до
`RTCPeerConnection` звонящего как `disconnected`/`failed` тем же путём, что
и раньше, просто без выигрыша «немедленно» для этой конкретной половины
пары. Расширение сигналинга под «попроси вторую сторону перезапустить» —
новый тип `ChatCallSignal`, а это `packages/shared`: общий файл вне зоны
этого мобильного worktree (`gan-harness/spec.md`, «Общие правила»; правки
`packages/shared` затрагивают одновременно веб и сервер, у которых свои
владеющие сессии) — оставлено как честно названное ограничение, не скрыто.

### 12.8. «Занято»

Ни `decline` (`POST /chat/calls/:id/decline`), ни его DTO
(`chat-calls.controller.ts`) не принимают причину — в отличие от `end`
(`EndChatCallRequest.reason?: ChatCallEndReason`, там `'busy'` в перечислении
УЖЕ есть), `decline` всегда переводит звонок в `declined` с `endReason:
'hangup'` (`call-state.ts`, `transition()`, кейс `'decline'`). Спека прямо
разрешала этот исход («если её нет — обычный decline и заметка») — здесь
он: сервер увидит обычный отказ, не «занято» отдельной причиной. Это пробел
контракта API, а не этого клиента; правка `decline` под `reason` — вне
`apps/mobile`, отдельная карточка для владельца `apps/api` (см. `packages/shared`
выше — тот же принцип границ worktree).

**Входящий звонок при занятом устройстве.** Проверяется ДО показа —
`shouldDeclineAsBusy(state)` (`call-busy-decision.ts`, +spec) над сырыми
фактами `VedamatchCalls.callConflictState()`:
`hasOwnCall` (уже идёт свой self-managed звонок VedaMatch —
`PendingCallStore.hasAnyConnection()`) или `systemBusy`
(`TelecomManager.isInCall()`, обёрнут в `try/catch(SecurityException)`,
fail-open на «свободно» — ложное отрицание просто покажет входящий как
обычно, а не потеряет звонок молча). Занятое устройство отклоняет тем же
путём, что кнопка «Отклонить» из шторки (`declineCallInBackground`,
headless-совместимый прямой HTTP без открытия UI и без Telecom/уведомления
вовсе) — показать и тут же погасить было бы хуже, чем не показать.
**Исходящий** — тот же `shouldDeclineAsBusy` проверяется в начале `start()`
(`call-provider.tsx`), до `getUserMedia`/сети: отказ мгновенный и понятный
(«Устройство сейчас занято другим звонком»), не тихое зависание на «Вызов…».

**Сотовый звонок начался ВО ВРЕМЯ нашего.** Наш self-managed `PhoneAccount`
не объявляет `CAPABILITY_HOLD`/`CAPABILITY_SUPPORT_HOLD` — по документированному
поведению Telecom это означает, что при конфликте с более приоритетным
(managed/сотовым) звонком система сама разрывает наш self-managed
`Connection`, вызывая `onDisconnect()`. Выбор **«завершается», не
«ставится на удержание»** — реализовать честное удержание означало бы
приостанавливать реальный WebRTC-трафик (заглушать исходящий и не
проигрывать входящий звук), без визуальной индикации «на удержании» для
собеседника и с риском рассинхрона состояния (когда именно «снять с
удержания» после того, как сотовый разговор закончится — отдельный
жизненный цикл, которого сейчас в `call-machine.ts` нет) — для этого этапа
предпочтён более простой и предсказуемый исход: разговор корректно
завершается, собеседник видит обычный «Звонок завершён», а не зависает в
неопределённом «на паузе» без объяснения.

Раньше (этап 2) `onDisconnect()` не звал никакой колбэк в JS вовсе —
Telecom-состояние обновлялось, а `CallSession`/WebRTC в JS продолжали жить,
ничего не зная о том, что разговор кончен (тот же класс дефекта, что
`feedback-001.md` уже находил у `onReject()` на этапе 2, только для другого
метода и до этого этапа не всплывавший, потому что до этапа 3
`Connection` не доживал до `active`, где `onDisconnect()` вообще мог
понадобиться). Починено: `onDisconnect()` теперь зовёт `onEndCallback` →
JS-событие `end` → `call-provider.tsx` зовёт обычный `hangUp()`, тот же
путь, что и кнопка на экране. Это чинит СРАЗУ два случая одним колбэком:
сотовую преемпцию и кнопку гарнитуры/гарнитуры Bluetooth/Android Auto во
время разговора («Кнопки гарнитуры... завершение через Connection» из
карточки) — `onDisconnect()` в терминологии Telecom это ровно колбэк для
обоих.

### 12.9. Исходящий звонок в Telecom

`TelecomManager.placeCall(Uri, extras)` с `EXTRA_PHONE_ACCOUNT_HANDLE`,
указывающим на наш self-managed аккаунт (не обычный набор номера — self-managed
не требует `CALL_PHONE`, только уже выданный `MANAGE_OWN_CALLS`). Вызывается
один раз при входе в `outgoing` (`call-provider.tsx`, `placedOutgoingFor`).
`onCreateOutgoingConnection` (`VedamatchConnectionService.kt`) раньше всегда
возвращал `createFailedConnection` («исходящие через Telecom не заводим» —
решение этапа 2, актуальное только до этого этапа) — теперь строит
`Connection`, `setDialing()`, регистрирует в `PendingCallStore`, симметрично
входящему. Best-effort, как и `showIncomingCall`: WebRTC-дозвон
(`chat-calls-client.ts`) от результата не зависит и не ждёт его.

### 12.10. Известное ограничение — self-managed `Connection` не для всех путей ответа

`startOngoingCall` пытается `PendingCallStore.connectionFor(callId)?.setActive()`,
но не создаёт `Connection` заново, если его не было. Единственный сценарий,
где его действительно нет: входящий звонок, который пришёл, пока приложение
УЖЕ было открыто на переднем плане (`push-bridge.tsx` сознательно
игнорирует `call.incoming` в этом случае — см. §11, «Почему звонок не
поднимает системный UI...» — сам звонок идёт через `chat-stream.tsx` →
`IncomingCallBanner`, без похода через `showIncomingCall`/`addNewIncomingCall`
вовсе), и человек отвечает на него тапом по баннеру внутри приложения, не
через уведомление. Для этого узкого случая:

- foreground-служба и постоянное уведомление «Идёт звонок» — работают как
  обычно (не зависят от `Connection`);
- аудиомаршрутизация, датчик приближения, PiP, ICE restart — работают как
  обычно (`InCallManager`/наши JS-модули не зависят от `Connection` вовсе);
- кнопки гарнитуры/Bluetooth/Android Auto для ЭТОГО конкретного звонка — не
  сработают (нечему их перехватывать на стороне Telecom, `Connection` не
  зарегистрирован) — в приложении всё равно работают свои кнопки (мик,
  громкая связь, «Завершить»);
- «занято» при параллельном сотовом — тоже не сработает для этого звонка
  специфично через Telecom-преемпцию (`onDisconnect()`);
- **поправка по `feedback-001.md` этого этапа, non-blocking п.2**: клиентский
  `shouldDeclineAsBusy`/`hasOwnCall` (`PendingCallStore.hasAnyConnection()`)
  ЗДЕСЬ второй одновременный входящий VedaMatch тоже не поймает — раз
  `Connection` для первого звонка не регистрировался, `hasAnyConnection()`
  вернёт `false`, и клиент не откажет второму сам. Реальная защита в этом
  узком случае — не клиентская: сервер держит busy-лок на всё время
  активного звонка независимо от клиента (`apps/api/.../chat-calls.service.ts`,
  `acquireBusy`/`refreshBusy`, `BUSY_TTL_RINGING_MS`/`BUSY_TTL_ACTIVE_MS`) и
  просто не пришлёт пуш/`call.ringing` для второго звонка тому же человеку,
  пока первый активен — до клиента конфликт в этом сценарии не доходит
  вовсе, а не «доходит и клиент его ловит».

Самый частый реальный путь (входящий, когда приложение свёрнуто/убито —
именно то, ради чего строился весь этап 2) через это ограничение не
проходит — `Connection` для него всегда регистрируется на этапе получения
пуша. Закрыть и этот узкий случай означало бы ретроактивно регистрировать
`Connection` через `addNewIncomingCall` уже ПОСЛЕ решения ответить — риск
короткой вспышки `onShowIncomingCallUi()`/уведомления входящего для уже
идущего разговора без ясной пользы (весь функционал, которого не хватает,
это лишь кнопки гарнитуры для одного узкого сценария) — решение оставить
как явно названный пробел, не закрывать ценой нового источника гонок в
последние часы этапа.

### 12.11. Сборка и проверка манифеста

`APP_CONTOUR=ru APP_CHANNEL=site npx expo prebuild --platform android --clean`
и `./gradlew assembleRelease -x lint` — результат и цифры (время сборки,
размер APK) записаны в `gan-harness/generator-state.md` этой итерации (не
дублируется здесь, чтобы числа не расходились по двум местам при следующих
правках). Манифест проверен по факту:
`aapt dump permissions` (build-tools 36.1.0) на собранном APK и
merged-манифест (`android/app/build/intermediates/merged_manifests/release/processReleaseManifest/AndroidManifest.xml`)
— оба подтверждают `FOREGROUND_SERVICE_MICROPHONE`/`FOREGROUND_SERVICE_CAMERA`
рядом с уже бывшим `FOREGROUND_SERVICE_PHONE_CALL`, и `foregroundServiceType="phoneCall|microphone|camera"`
на `CallForegroundService`, и `android:supportsPictureInPicture="true"` на
`MainActivity`.

### 12.12. Поправки по итогам оценки (feedback-001.md этого этапа, итерация 2)

Оценка FAIL (6.85), два блокирующих дефекта — оба про то, что первая
итерация архитектурно перенесла службу переднего плана и self-managed
`Connection` на уровень «весь срок звонка» (§12.1-12.2), но оставила две
смежные вещи на уровне «пока виден компонент».

**Блокирующий п.1 — аудиосессия была привязана к монтированию экрана, не к
фазе звонка.** `InCallManager.start()`/`stop()` жили в `useEffect`
`app/call/[id].tsx` с cleanup на размонтирование — а экран умеет
сворачиваться по системному «назад» ВО ВРЕМЯ активного разговора, не
завершая его (`call-screen-return.ts`, штатный путь с этапа 1/2). В момент
такого «назад» `InCallManager.stop()` реально снимал аудиофокус,
`MODE_IN_COMMUNICATION`, Bluetooth SCO/гарнитуру и датчик приближения — то,
что этап 3 обещает держать «весь свой срок» — хотя служба переднего плана и
`Connection` продолжали жить.

Починено переносом жизненного цикла аудиосессии в `call-provider.tsx`, тем
же паттерном, что уже применён для `CallForegroundService`/`Connection`:
`InCallManager.start()` на вход в `connecting`/`active` (`isAudioSessionLive`,
новый чистый модуль `audio-session-policy.ts`, +spec), `stop()` — на выходе
из этого окна, ровно один раз на звонок (`audioSessionLive`-ref, тот же
приём, что `startedOngoingFor`/`nativeClearedFor`). Экран звонка
(`app/call/[id].tsx`) больше не вызывает `start()`/`stop()` вовсе — только
то, что осмысленно именно НА ЭТОМ экране:

- маршрут (громкая связь/динамик/Bluetooth-пикер) — без изменений,
  `setForceSpeakerphoneOn`/`chooseAudioRoute` не завязаны на `start()`,
  работают, пока аудиосессия жива (она теперь живёт в провайдере весь срок);
- `setKeepScreenOn` — как и раньше, на монтирование/размонтирование ЭТОГО
  экрана (флаг окна `Activity`, не аудиосессии — независимая механика);
- **датчик приближения — новое явное решение**, не побочный эффект
  `InCallManager.start()` (та вызывается уже не здесь): `shouldEnableProximity(phase,
  kind, screenVisible, route)` (`audio-session-policy.ts`, +spec) включает
  датчик, только когда одновременно — аудиосессия жива, звонок аудио (не
  видео), ЭКРАН ЗВОНКА ВИДЕН, маршрут — разговорный динамик. Уход с экрана
  («назад») выключает датчик через cleanup эффекта, не трогая ни аудиофокус,
  ни маршрут, ни сам разговор — специально: гасить экран у уха имеет смысл,
  только пока человек смотрит на экран звонка, а не на что-то ещё в
  приложении, до чего он мог поднести телефон по совсем другой причине.

**Блокирующий п.2 — `onTaskRemoved` уведомлял сервер через путь без
гарантий.** `CallForegroundService.onTaskRemoved()` звал
`VedamatchCallsModule.sendEndEvent(...)` — обычное событие через
`NativeEventEmitter`, реальный `POST /chat/calls/:id/end` происходил только
если JS-мост доживал до его обработки (`onEnd` → `hangUp()` → `callsApi.end(...)`,
асинхронно), а `onTaskRemoved` — ровно тот момент, где `Activity` уже
разрушается и мост с наибольшей вероятностью не отвечает. Симметричный
случай «Отклонить из фона» решён надёжно ещё на этапе 2
(`DeclineHeadlessTaskService`, `HeadlessJsTaskService` с собственным wake
lock, не зависящий от живого моста) — `onTaskRemoved` этот же паттерн не
использовал.

Починено тем же паттерном: `HangupHeadlessTaskService.kt` (новый, копия
`DeclineHeadlessTaskService` по механике: `startService` +
`acquireWakeLockNow`, `TASK_NAME = "VedamatchCallHangup"`), `onTaskRemoved()`
теперь стартует его ДО остановки самой foreground-службы (свежий headless-сервис
со своим wake lock держит процесс живым в окне между
`stopSelf()`/`stopForeground()` и завершением HTTP), а локальная уборка
(`connection.disconnectFromApp()`, снятие уведомления/службы) остаётся
синхронной и не ждёт сети. JS-сторона задачи — `hangup-call-headless-task.ts`,
регистрируется в `index.js` рядом с `declineCallHeadlessTask`.

Попутно обобщён `background-decline.ts` → `background-call-action.ts`
(переименован и параметризован): один модуль, `callActionInBackground(callId,
action, reason?)`, `action: 'decline' | 'end'` — те же гарантии токенов
(`tokenAuthority`, singleFlight, перечитывание перед сетевым `refresh()`,
что уже проверено `feedback-001.md`/`002.md`/`003.md` ЭТАПА 2 для decline),
без дублирования протокола ради `end`. Готовые инстансы
`declineCallInBackground`/`hangupCallInBackground` — тонкие обёртки поверх
одного и того же `backgroundCallAction`. Спек (`background-call-action.spec.ts`)
покрывает оба действия, включая построение тела `{reason}` для `end` и весь
протокол 401→перечитать→`refresh()` для каждого из них отдельно.

**Non-blocking, закрыто тем же заходом:**

- `restartIce()` (`webrtc-session.ts`) — флаг `restartingIce`, защищает от
  ПАРАЛЛЕЛЬНОГО вызова (например, `'failed'` из `onconnectionstatechange` и
  смена сети почти одновременно). `ice-restart-policy.ts` — дебаунс
  `ICE_RESTART_DEBOUNCE_MS` (5 с) по параметрам `nowMs`/`lastRestartAtMs`,
  защищает от ЧАСТОЙ смены транспорта на границе покрытия (wifi↔cellular
  туда-обратно за секунды) — это два разных источника гонок, оба нужны
  одновременно, не дублируют друг друга.
- §12.10 поправлен — см. правку в самом разделе выше: `shouldDeclineAsBusy`
  не защищает узкий случай (без `Connection`) от второго одновременного
  входящего НА КЛИЕНТЕ, реальная защита там серверная (busy-лок).
- `VedamatchConnection.onDisconnect()` — короткий комментарий, что двойной
  проход через `endCall` (JS-эффект `nativeClearedFor` следом за
  `onEndCallback`) — намеренная, проверенная идемпотентность, а не гонка.

**Не взято в этот заход** (не входило в список фидбека, оставлено как есть):
`Person`-аватар в обоих уведомлениях (`show()`/`buildOngoing()`) — данные
есть (`avatarUrl` в `PendingCallStore.CallInfo`), но загрузка изображения по
URL в `Bitmap` для `Person.Builder()` не тривиальна (асинхронная сеть внутри
нативного модуля показа уведомления) и не была в списке правок этой
итерации.

### 12.13. Поправки по итогам оценки (feedback-002.md этого этапа, итерация 3)

Оценка FAIL (6.85 — тот же балл, что и предыдущая итерация: оба блокирующих
дефекта итерации 1 закрыты корректно, но проверка сценария «логаут во время
звонка», которую та же правка заявляла обрабатывать, вскрыла новый
блокирующий пробел на уровне архитектуры приложения, не самого коммита).

**Блокирующий п.1 — выход из аккаунта во время разговора не останавливал
ничего.** `CallProvider` смонтирован в `_layout.tsx` ВЫШЕ
`Stack.Protected` — оборачивает весь `RootStack`, а не только защищённое
дерево (осознанно: входящий баннер должен появляться из любого раздела).
Значит `CallProvider` НЕ размонтируется, когда `status` уходит в `'guest'`
— размонтируются только защищённые экраны. `signOut()`/`dropSession()`
(`session.tsx`) не трогали звонок вовсе: чистили токены, `setUser(null)`,
`setStatus('guest')` — ни `hangUp()`, ни `finishLocally(...)` нигде не
вызывались. Итог на практике: «Выйти» во время разговора перекидывало на
экран логина, а микрофон (и камера на видео) продолжали захватываться и
передаваться собеседнику, постоянное уведомление «Идёт звонок» оставалось
— скрытая утечка микрофона/камеры после явного действия «выйти».
`ReturnToCallBanner` вдобавок не проверял `status` и мог отрисоваться
поверх экрана входа, ведя на маршрут `/call/[id]`, которого для гостя нет
в дереве `Stack`.

Починено на двух независимых уровнях:

1. **Эффект на смену `status` внутри `CallProvider`** (`call-provider.tsx`)
   — чистое решение «нужно ли завершать звонок при этой смене статуса» —
   `shouldEndCallOnSessionChange(previous, next, phase)`
   (`session-call-guard.ts`, +spec — таблица `{loading, guest, signed} ×
   {loading, guest, signed} × все фазы звонка`): `true` только для
   `signed → guest` при живой фазе (`outgoing`/`incoming`/`connecting`/`active`).
   При срабатывании вызывается `endCallForLogout()` — тот же путь, что
   обычный `hangUp()` (`hangUpWith('hangup')`): `finishLocally()`+`closeSession()`
   переводят `phase` в `ended` СИНХРОННО, до сетевого запроса — все уже
   существующие эффекты, следящие именно за `phase` (не за `status`),
   срабатывают сами: аудиосессия (`audioSessionLive`), foreground-служба и
   self-managed `Connection` (`nativeClearedFor`), рингтон. Отдельно
   `pendingAnswer.clear()` — не завязан на `phase`.
   Это универсальный предохранитель: срабатывает при ЛЮБОЙ потере сессии,
   не только через `signOut()` (например, `onSessionExpired` в `client.ts`
   зовёт `dropSession()` напрямую на 401) — токены к этому моменту уже
   могут быть стёрты (`dropSession()` роняет их раньше, чем меняется
   `status`), поэтому сетевой POST в этом пути не гарантирован (тихо
   проглатывается существующим `try/catch` в `hangUpWith`), но ЛОКАЛЬНАЯ
   уборка (микрофон/камера, служба, `Connection`) происходит всегда — это
   и есть главный приватностный риск, который решает этот путь.
2. **`registerBeforeSignOut` — новый, generic (не специфичный для звонков)
   метод на `Session`** (`session.tsx`). Для универсального пути (1) выше
   недостаточно для явного `signOut()`: `dropSession()` стирает токены
   ДО того, как эффект на `status` вообще успевает сработать — сетевой
   `POST /chat/calls/:id/end` в этом случае обречён уйти без токена.
   `registerBeforeSignOut(hook)` даёт любому модулю зарегистрировать
   колбэк, который `signOut()` дождётся (`Promise.allSettled` + общий
   таймаут `BEFORE_SIGN_OUT_TIMEOUT_MS = 2000` мс — best-effort, не
   гарантия: сеть может быть недоступна, разлогин не должен зависеть от
   чужого HTTP дольше разумного) ДО того, как снять push-токен и отозвать
   сессию — порядок в `signOut()` теперь буквально: (a) `beforeSignOutHooks`
   → (б) `unregisterDevice` → (в) `authApi.logout`+`dropSession()`.
   `CallProvider` регистрирует `endCallForLogout` (ту же функцию, что и
   путь 1) через `useEffect` на монтирование. `session.tsx` при этом НЕ
   импортирует ничего из `calls` — контракт общий, а не завязанный на
   конкретную фичу, ровно как просило задание («сначала «завершить
   звонок», потом снять push-токен и отозвать сессию» реализовано как
   общий hook-механизм, а не прямой вызов).

Композиция путей 1 и 2 не создаёт двойного хлопка: `signOut()` вызывает
`endCallForLogout()` ПЕРВЫМ (пока `status` ещё `'signed'`) — к моменту,
когда `dropSession()` меняет `status` на `'guest'`, `phase` уже `ended`
(или `idle` после автосброса), `shouldEndCallOnSessionChange` для такого
перехода возвращает `false` (ждёт именно живую фазу) — второй вызов не
происходит. Для НЕ-signOut путей срабатывает только путь 1 (`registerBeforeSignOut`
там просто не задействован — `dropSession()` могли позвать не из `signOut()`).

**Рендер баннеров звонка гейтится `status === 'signed'`** (`CallProvider`,
JSX) — `IncomingCallBanner`/`ReturnToCallBanner`/`CallErrorToast` теперь не
рендерятся для гостя вовсе, независимо от состояния звонка внутри. Это
независимая, более простая для чтения защита от того же сценария (плашка
поверх экрана входа), не дубль эффекта на `status` другим способом — оба
работают на разных уровнях (состояние звонка vs. видимость UI).

**Мёртвый комментарий (`call-provider.tsx`, unmount-cleanup аудиосессии)
поправлен по факту** — раньше утверждал, что это и есть защита от
«быстрого logout/выхода» (неверно: `CallProvider` не размонтируется
никогда в реальном дереве); теперь объясняет, что cleanup сейчас
недостижим на практике и оставлен как defensive-код на случай
гипотетического будущего условного размонтирования, а не как актуальная
защита — реальный логаут закрывают пути 1/2 выше.

**Non-blocking из `feedback-002.md` — закрыт.** `onTaskRemoved()`
(`CallForegroundService.kt`) раньше брал `callId` для headless `hangup`
ТОЛЬКО из `PendingCallStore.anyConnection()`, а `Connection` регистрируется
не для всех путей ответа (узкий случай §12.10 — входящий, отвеченный тапом
по внутриприложенческому баннеру, пока приложение уже было открыто, без
похода через Telecom). Для такого разговора смах из списка последних задач
прибирал службу/уведомление ЛОКАЛЬНО, но не слал `hangup` на сервер —
собеседник узнавал о конце только по 15-секундному таймеру обрыва WebRTC.
Починено: сама служба теперь хранит `currentCallId` (устанавливается в
каждом `onStartCommand`, сбрасывается в `onDestroy`) — источник правды не
зависит от того, был ли зарегистрирован `Connection`; `onTaskRemoved()`
берёт `callId` оттуда, `Connection` (если он есть) по-прежнему разрывается
отдельно, локально, тем же вызовом `disconnectFromApp()`.

**Не взято в этот заход** (не входило в список фидбека, оставлено как
есть): `Person`-аватар в уведомлениях — по-прежнему не сделан, данные есть.

### 12.14. Правки по факту первой живой проверки (Samsung Galaxy A51, Android 13)

Первый реальный входящий звонок (приложение в фоне, экран погашен) дошёл за
2 с (`RNFirebaseMsgReceiver`), но self-managed `Connection` не создался, а в
шторке нашлось лишнее уведомление о звонке не на канале `calls`. Разобрано
по логу устройства, не гипотетически:

- **`TelecomManager.isInCall()`** бросал `SecurityException: ...
  READ_PHONE_STATE` — это разрешение сознательно не добавлено (Google Play
  требует раскрытие для чувствительных разрешений телефонии, `callConflictState`
  и так не должен был на него полагаться). Заменено на `AudioManager.getMode()
  == MODE_IN_CALL` — публичный API без единого разрешения; `MODE_IN_CALL`
  ставит сама телефония для настоящего сотового разговора,
  `MODE_IN_COMMUNICATION` (наш собственный `InCallManager.start()`, как и
  чужой VoIP) сознательно не считается «занято» здесь — свой разговор и так
  ловит отдельный `hasOwnCall` (`PendingCallStore.hasAnyConnection()`).
- **`TelecomManager.getPhoneAccount()`** (внутри `ensurePhoneAccount`, вызов
  «уже зарегистрирован ли аккаунт») бросал на этой прошивке
  `SecurityException: ... READ_PHONE_NUMBERS` — самоуправляемому аккаунту
  это разрешение не нужно по документации, но конкретный Samsung-образ
  `TelecomServiceImpl` проверяет его для ЛЮБОГО вызывающего `getPhoneAccount()`.
  Убрана сама проверка: `registerPhoneAccount()` идемпотентен, вызывается
  безусловно, в предварительном чтении нет нужды.
- **`onCreateIncomingConnectionFailed`** (Telecom сам отказал self-managed
  запросу — реальный сигнал «занято», который наша JS-проверка ДО показа
  могла не успеть поймать из-за гонки с `AudioManager.mode`) теперь не
  молчит, а отклоняет звонок на сервере тем же headless-путём, что кнопка
  «Отклонить» из шторки (`DeclineHeadlessTaskService`), — не ждёт
  15-секундный таймер обрыва WebRTC.
- **Лишнее уведомление на `expo_notifications_fallback_notification_channel`**
  — расследовано по исходникам сервера (`apps/api/.../notifications/notifications.listener.ts`,
  `native-push.service.ts`), не подтверждено гипотезой: `chat.call-incoming`
  корректно ветвится по `nativeCalls` (`sendCallIncoming`), а вот
  `chat.call-missed` — НЕТ, уходит через общий `sendToUsers(...)` ВСЕМ
  устройствам человека, включая уже умеющие нативный звонок. Это обычный
  пуш с блоком `notification` — при свёрнутом приложении система показывает
  его сама, минуя весь код клиента (задокументированное поведение FCM,
  §11); мобильный клиент физически не может перехватить этот путь. **Правка
  сервера — вне этого worktree** (`VedaMatchNew-calls-api`), здесь только
  зафиксирован источник и закрыто единственное окно, где клиент вообще
  видит такой пуш сам: если он придёт, пока приложение уже в переднем
  плане, `push-bridge.tsx#onMessage` теперь распознаёт `data.url` вида
  `/chat/<id>?call=<callId>` (`call-push-guard.ts`, +spec) и не дублирует
  показ. Попутно исправлен реальный, не зависящий от этого сценария баг:
  `scheduleNotificationAsync` в том же обработчике вызывался без
  `channelId` — любой обычный пуш, пришедший в переднем плане, уходил на
  служебный `expo_notifications_fallback_notification_channel` вместо
  `messages`, а не только этот один случай.
- **Логирование.** Добавлены `Log.i`/`Log.w` на ключевые шаги
  `showIncomingCall` (регистрация аккаунта, `addNewIncomingCall`),
  `onCreateIncomingConnection`, `onCreateIncomingConnectionFailed`,
  `onShowIncomingCallUi`, показ/отказ уведомления в `CallNotifications.show` —
  только `callId`, без имени/аватара звонящего, чтобы следующий живой тест
  было чем объяснить постфактум.
- **`CallNotifications.show()`** — вопреки первому впечатлению от отчёта,
  уведомление на канале `calls` в этом прогоне РЕАЛЬНО появилось (лог
  устройства: `notification_enqueue`, `channel=calls`, `category=call`,
  `actions=2`) и было автоматически снято ~44 с спустя при завершении
  звонка (`notification_cancel`) — ожидаемое поведение, не дефект;
  расхождение с отчётом объясняется тем, что `dumpsys notification`
  снимался уже после этого штатного снятия. `CallStyle.forIncomingCall`
  всё равно обёрнут в `try/catch` с деградацией до обычного двухкнопочного
  уведомления и логом — на случай, если на другой прошивке требования
  `CallStyle` (`Person` с именем + `fullScreenIntent`/foreground-служба)
  всё же не выполнятся.

### 12.15. Живая проверка PR #363 (versionCode 1012, релизный ключ) — два новых дефекта

Регистрация PhoneAccount/`addNewIncomingCall`/`onCreateIncomingConnection`/
`onShowIncomingCallUi`/уведомление на канале `calls` с двумя действиями —
всё подтверждено рабочим, Telecom корректно держит `RINGING` 45 с и сам
переводит в `DISCONNECTED` по таймауту. Живой лог нашёл два новых дефекта.

**Экран блокировки: `sysui_fullscreen_notification` поднял `MainActivity`,
но экран не включился, keyguard остался.** Причина — `setShowWhenLocked`/
`setTurnScreenOn` выставлялись из JS (`setCallScreenActive`, вызывается
`app/call/[id].tsx` уже ПОСЛЕ монтирования React-дерева) — на погашенном
заблокированном экране это на кадры позже, чем система решает «показывать
поверх блокировки или нет» при первом `onCreate`. Починено синхронной
установкой этих флагов прямо в нативном `MainActivity.onCreate`/`onNewIntent`
(новый `onNewIntent` — `plugins/with-native-calls.js`, §4) по признаку,
который уже есть в стартующем `Intent` (`callId`-экстра — кладут и
`fullScreenIntent`, и «Ответить»), не дожидаясь JS вовсе. Заодно убран
безусловный `KeyguardManager.requestDismissKeyguard` из `setCallScreenActive`
(снимал блокировку экрана при КАЖДОМ ответе на звонок) — `setShowWhenLocked`
уже показывает разговор поверх блокировки без её снятия, как у системной
звонилки; принудительная разблокировка не нужна и не была об этом просьбы.
`endCall` (`VedamatchCallsModule.kt`) защитно снимает оба флага на текущей
`Activity` — на случай звонка, снятого/пропущенного ДО того, как открылся
сам экран `app/call/[id].tsx` и успел вызвать `setCallScreenActive(false)`.

**Критично: «Ответить» из heads-up (телефон разблокирован, приложение в
фоне) привёл к `decline`, а не `accept`.** Сервер получил decline
(`endReason: hangup`, `answeredAt: null`) практически сразу после нажатия,
хотя JS-путь `accept()` при этом РЕАЛЬНО пошёл (в логе — `rn-webrtc:pc:DEBUG
ctor`/`addTrack`/`close`, т.е. локальные медиа успели захватиться и потом
закрыться). Разобрано по коду, не гипотезой: `AudioManager.getMode()` в
момент ответа был `MODE_IN_COMMUNICATION` (`mode=3`, лог: `setMode(mode=3,
caller=com.android.server.telecom)`), а не `MODE_IN_CALL` (`mode=2`) —
значит подозрение из задания («новая проверка `MODE_IN_CALL` топит
собственный звонок после `setActive()`») не подтвердилось само по себе: она
проверяет ровно `mode=2`, `mode=3` под неё не подходит. Настоящая причина —
глубже в той же функции: `PendingCallStore.hasAnyConnection()`
(`callConflictState`, `VedamatchCallsModule.kt`) заносит self-managed
`Connection` в реестр уже в `onCreateIncomingConnection` (пока звонок ТОЛЬКО
звонит, задолго до ответа) — значит `hasOwnCall` был `true` для СВОЕГО ЖЕ
звонка с самого начала. Если `call.incoming` был доставлен `RNFirebaseMsgReceiver`
повторно (сетевой ретрай/redelivery — обычное дело для high-priority
data-сообщений сразу после того, как система разбудила устройство) —
`handleIncomingCallPush` (`native-call-bridge.ts`) для этого повторного
пуша спрашивал `callConflictState()` без исключений, видел `hasOwnCall: true`
(свой же, уже отвечаемый звонок) и слал `decline` НАПРЯМУЮ на сервер
(`declineCallInBackground`, в обход `call-provider.tsx`/`accept()` целиком)
— параллельно с тем, что JS уже честно отвечал на звонок изнутри
приложения. Оба пути реальны и независимы, поэтому в логе видны следы ОБОИХ:
быстрый `decline` от повторного пуша и чуть более медленный, самостоятельно
идущий (и в итоге отвергнутый сервером) `accept()`.

Починено: `callConflictState`/`PendingCallStore` теперь принимают
`excludeCallId` — self-managed `Connection` ДЛЯ ЭТОГО ЖЕ `callId` не
считается занятостью (`PendingCallStore.hasOtherConnection`, +JS-обвязка
`native-call-bridge.ts`/`modules/vedamatch-calls/index.ts`). Занятость
теперь означает буквально «идёт ДРУГОЙ звонок», не «этот же снова
доставлен». Дополнительно, как дешёвая защита от того же класса гонки на
будущее (живая проверка не подтвердила двойной вызов именно отсюда, но код
уже разбирался под эту проверку): `accept()` (`call-provider.tsx`) обзавёлся
guard'ом от повторного вызова для одного и того же `callId`
(`acceptingCallId`). Диагностика — `console.warn` (виден в logcat релиза
как `W ReactNativeJS`, без персональных данных, только `callId`/`phase`/
`reason`) на: native `onAnswer` получен, `accept()` начат/подтверждён
сервером/отказ, `hangUpWith` (decline/end) с причиной, decline «занято» с
сырыми `hasOwnCall`/`systemBusy`.

**Мелочь.** `NativeEventEmitter() was called with a non-null argument
without the required addListener method` — источник `audio-route-bridge.ts`:
`new NativeEventEmitter(NativeModules.InCallManager)`, а `InCallManager` не
реализует `addListener`/`removeListeners` (шлёт события напрямую через
`RCTDeviceEventEmitter`). По исходнику `NativeEventEmitter.js` аргумент
обязателен только на iOS — на Android конструктор без аргумента работает
идентично (тот же глобальный эмиттер под капотом) и не предупреждает.

Автотестов на сам фикс `excludeCallId` нет: логика живёт в Kotlin
(`PendingCallStore.hasOtherConnection`), а в `modules/vedamatch-calls`
никогда не было Kotlin/JUnit-инфраструктуры (не заводилась и здесь — риск
несоразмерен размеру правки). Пройденные `pnpm test` покрывают JS-часть, не
изменившуюся по существу (`shouldDeclineAsBusy`, `pending-call-answer.ts`);
подтверждение самого фикса — следующий живой прогон.

### Что ждёт живого телефона (этап 3)

Ничего из перечисленного ниже не проверялось на реальном устройстве в этой
сессии (нет телефона в среде разработки) — чек-лист с точными шагами
перенесён в `gan-harness/generator-state.md`, кратко здесь — САМ СПИСОК
рисков, а не инструкция:

- Постоянное уведомление «Идёт звонок» переживает погашенный экран и
  свёрнутое (не смахнутое) приложение; кнопка «Завершить» и нажатие на
  само уведомление ведут себя, как описано (12.1).
- Смах приложения из списка последних во время разговора действительно
  корректно завершает звонок с обеих сторон, а не оставляет зависшее
  уведомление и не роняет процесс без явного завершения (12.2) — решение
  описано, поведение на конкретном OEM (особенно Samsung/агрессивные
  политики фона) не проверено.
- Разговорный динамик по умолчанию на аудиозвонке, громкая связь на видео,
  автоматическое переключение на Bluetooth-гарнитуру/проводные наушники при
  подключении/отключении прямо во время разговора, кнопка выбора маршрута
  при доступности больше двух устройств (12.3).
- Датчик приближения гасит/включает экран только на разговорном динамике —
  не на громкой связи, не на видео, не при поднесении во время набора
  (12.4).
- Кнопки гарнитуры (hook, play/pause) и Bluetooth-гарнитуры отвечают на
  входящий (пока звонит) и завершают разговор (пока активен) через
  `Connection.onAnswer`/`onDisconnect`; то же для Android Auto, если есть
  возможность проверить (12.3, 12.8).
- Автовход в картинку-в-картинке при уходе из приложения на видеозвонке
  (API 31+ автоматически, API 26-30 — тоже должен войти сам через
  `onUserLeaveHint`), содержимое PiP — только видео собеседника без единой
  кнопки, возврат из PiP разворачивает обычный экран с кнопками на месте
  (12.6).
- Смена Wi-Fi ↔ мобильный интернет во время активного разговора — вызывающая
  сторона перезапускает ICE заметно быстрее, чем 15-секундный таймер
  обрыва; разговор не рвётся при разумной задержке смены сети (12.7).
- Второй входящий VedaMatch, пока уже идёт один, отклоняется автоматически
  без показа/звука; попытка позвонить, когда устройство уже занято, сразу
  показывает понятную ошибку, не «висит» (12.8).
- Настоящий сотовый звонок во время активного разговора VedaMatch —
  разговор корректно завершается (а не зависает молча) на этой стороне;
  реакция собеседника (видит ли он ожидаемый финал) тоже стоит посмотреть
  (12.8) — это ЕДИНСТВЕННЫЙ пункт этапа 3, для которого нужен физический
  второй канал связи (вторая SIM/звонок с другого телефона), а не только
  Wi-Fi/LTE самого устройства.
- Исходящий звонок регистрируется в Telecom (виден системе как разговор —
  например, в быстрых настройках/логах производителя, если такие есть)
  (12.9).
- Узкий случай из 12.10 — ответ на входящий баннер внутри уже открытого
  приложения — действительно не ломается (работает без Telecom-перков), а
  не падает откровенно.
- **Новое по итогам `feedback-001.md` этого этапа, итерация 2**: «Назад» во
  время активного разговора → звук и Bluetooth-гарнитура НЕ пропадают
  (аудиосессия теперь привязана к фазе звонка, не к экрану, §12.12) —
  датчик приближения при этом ожидаемо выключается (он привязан к
  видимости именно экрана звонка), а звук/Bluetooth/аудиофокус продолжают
  работать как ни в чём не бывало. Отдельно: смах приложения из списка
  последних задач во время разговора теперь должен доносить факт конца
  разговора до сервера/собеседника заметно надёжнее (headless-задача с wake
  lock вместо события через мост, §12.12) — стоит проверить именно это, не
  только локальную уборку (уже было в списке выше).
- **Новое по итогам `feedback-002.md` этого этапа, итерация 3**: выход из
  аккаунта во время звонка → звонок завершён у собеседника, уведомление
  исчезло. Начать разговор с тестового аккаунта А → на устройстве А во
  время активного разговора нажать «Выйти» в настройках/профиле → сразу
  проверить: (а) экран логина А показывается БЕЗ баннера/плашки звонка
  поверх него; (б) постоянное уведомление «Идёт звонок» на устройстве А
  исчезает практически сразу, не через 15 секунд; (в) собеседник Б видит
  «Звонок завершён» (не зависание, не таймаут обрыва) — это и подтверждает,
  что POST на сервер ушёл до отзыва токена, а не потерялся вместе с ним
  (§12.13). Отдельно — то же самое, но логаут ВО ВРЕМЯ ВХОДЯЩЕГО (гудки,
  ответ ещё не дан): звонок должен корректно отклониться, а не зависнуть.

