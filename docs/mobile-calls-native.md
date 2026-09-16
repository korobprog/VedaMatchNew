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

