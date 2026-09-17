# План: VedaMatch для iPhone — веха 1 «Аккаунт Apple и первая сборка»

**Исходный PRD**: [docs/prds/iphone-app.prd.md](../../docs/prds/iphone-app.prd.md)
**Выбранная веха**: 1 — аккаунт разработчика активен; приложение запускается на
iPhone владельца, список чатов открывается против прод-API
**Сложность**: средняя (кода немного, основное время уходит на Apple и первую сборку)

## Кратко

`apps/mobile` сегодня собирается только под Android: в `app.config.ts` нет
блока `ios`, скрипт `prebuild` жёстко задаёт `--platform android`, а два
модуля бросают исключение при импорте на iOS, поэтому приложение упадёт
раньше первого экрана. Веха 1 — минимум, при котором та же кодовая база
запускается на iPhone: вход, вкладки, список чатов. Пуши (веха 3) и
системный экран звонка (веха 4) здесь **сознательно выключены** на iOS
проверкой платформы, как сейчас сделано для Android-only мостов.

Первую сборку на свой iPhone можно поставить **до оплаты** аккаунта —
бесплатной командой Personal Team в Xcode (подпись на 7 дней, без пушей и
TestFlight). Оплаченный аккаунт нужен для закрытия вехи, но не блокирует код.

## Что уже есть и на что опираемся

| Факт | Где |
|---|---|
| Xcode 26.2 и CocoaPods стоят на iMac, EAS CLI нет | `xcodebuild -version`, `which pod` |
| Сервер уже знает `platform = 'ios'` у устройства пушей | `apps/api/prisma/schema.prisma` → `NotificationDevice.platform` |
| Вход через системный браузер + PKCE на `vedamatch://auth` не зависит от платформы | `apps/api/src/modules/auth/app-login.ts:18`, `apps/mobile/src/lib/auth/login-flow.ts` |
| Тексты разрешений камеры/микрофона/фото для Info.plist уже заданы плагинами | `app.config.ts` → `expo-image-picker`, `@config-plugins/react-native-webrtc` |
| Адрес API в dev берётся из адреса Metro — на iPhone по Wi-Fi тоже сработает | `src/config/dev-origin.ts` |

## Образцы для повторения

| Категория | Источник | Образец |
|---|---|---|
| Платформенная развилка | `apps/mobile/src/lib/calls/native-call-bridge.ts:29` | `const SUPPORTED = Platform.OS === 'android'` на уровне модуля, вызовы под проверкой, не try/catch |
| Условный нативный конфиг | `apps/mobile/app.config.ts:17-18,182` | `existsSync(file)` → плагин и путь к файлу подключаются только при наличии файла |
| Чистая логика конфига | `apps/mobile/src/config/app-version.ts` | формулы сборки — чистые функции со своим `*.spec.ts` |
| Тесты конфига | `apps/mobile/src/config/app-config.spec.ts` | `appConfig({ config: {} })` и проверки полей/плагинов, `describe/it` на русском |
| Секреты вне репозитория | `apps/mobile/README.md` «Релизная подпись», `.gitignore` (`*.p8`, `*.p12`, `*.mobileprovision`) | ключи в `/Users/mamu/secrets`, в git — никогда |
| Обработка ошибок | `apps/mobile/src/lib/push/push-bridge.tsx` | нет Firebase — молча без пушей, чаты работают |

## Файлы

| Файл | Действие | Зачем |
|---|---|---|
| `apps/mobile/app.config.ts` | UPDATE | блок `ios`: `bundleIdentifier`, `buildNumber`, `supportsTablet: false`, `infoPlist.ITSAppUsesNonExemptEncryption: false` |
| `apps/mobile/src/config/app-version.ts` (+spec) | UPDATE | `resolveBuildNumber(env)` — строка для iOS из того же счётчика, что `versionCode` |
| `apps/mobile/src/config/app-config.spec.ts` | UPDATE | тесты iOS-блока: bundle id, iPad выключен, шифрование объявлено |
| `apps/mobile/modules/vedamatch-calls/index.ts` | UPDATE | `requireOptionalNativeModule` вместо `requireNativeModule` — импорт на iOS не бросает |
| `apps/mobile/src/lib/calls/native-call-bridge.ts` | UPDATE | учесть `null`-модуль (проверка `SUPPORTED` остаётся главной) |
| `apps/mobile/src/lib/push/background-handler.ts` | UPDATE | регистрировать обработчик FCM только на Android |
| `apps/mobile/package.json` | UPDATE | скрипты `prebuild:ios`, `ios`; исключить RNFirebase из автолинковки iOS до вехи 3 |
| `apps/mobile/README.md` | UPDATE | раздел «iPhone»: сборка на iMac, Personal Team, подпись, что не работает до вех 3–4 |
| `apps/mobile/src/lib/auth/*` | проверить | `openAuthSessionAsync` на iOS: закрытие листа, отмена |
| `docs/prds/iphone-app.prd.md` | CREATE | PRD в репозитории, веха 1 → `in-progress` |

## Задачи

### Задача 0: аккаунт Apple (владелец, вне кода, стартует сразу)
- **Действие**: закрыть открытый вопрос PRD «физлицо или юрлицо», оформить
  Apple Developer Program ($99), завести App ID `com.vedamatch.app`
  (Push Notifications и Sign in with Apple — сразу, пригодятся в вехах 2–3).
- **Проверка**: в App Store Connect аккаунт «Active»; команда видна в Xcode → Settings → Accounts.
- **Параллельно**: задачи 1–5 не ждут аккаунта — подпись Personal Team.

### Задача 1: iOS-блок конфигурации
- **Действие**: добавить `ios` в `app.config.ts`; `bundleIdentifier: 'com.vedamatch.app'` (как Android-пакет и Firebase);
  `buildNumber` из новой `resolveBuildNumber`; `supportsTablet: false` (PRD: iPad вне границ);
  `ITSAppUsesNonExemptEncryption: false` (только HTTPS — без вопроса об экспорте на каждую сборку).
- **Образец**: `android`-блок и `resolveVersionCode`.
- **Проверка**: `pnpm --filter @vedamatch/mobile test -- app-config app-version`.

### Задача 2: импорт без падения на iOS
- **Действие**: `vedamatch-calls` отдаёт `requireOptionalNativeModule(...)`;
  `background-handler.ts` вызывает `setBackgroundMessageHandler(getMessaging(), …)` только при `Platform.OS === 'android'`.
- **Образец**: `SUPPORTED` в `native-call-bridge.ts`, `audio-route-bridge.ts:15`.
- **Проверка**: `pnpm --filter @vedamatch/mobile lint && pnpm --filter @vedamatch/mobile test`; на симуляторе приложение доходит до экрана входа.

### Задача 3: Firebase не мешает сборке iOS
- **Действие**: до вехи 3 исключить `@react-native-firebase/*` из автолинковки iOS
  (`expo.autolinking.ios.exclude` в `package.json`) — RNFB на iOS требует
  `useFrameworks: 'static'` и `GoogleService-Info.plist`, это работа вехи 3.
  Все обращения к RNFB уже под проверкой Android (задача 2 закрывает последнее).
- **Проверка**: `expo prebuild --platform ios --clean` и `pod install` без ошибок; Android-сборка не меняется (`prebuild` + workflow **Mobile APK**).

### Задача 4: первая сборка на симуляторе
- **Действие**: скрипты `prebuild:ios` / `ios` (`expo run:ios`); dev client на симуляторе против локального API (`APP_API_ORIGIN=http://localhost:4000`) и против прода.
- **Проверка**: вход по dev-логину (`seed:dev`), вкладки Чаты/Звонки/Люди/Общины/Сервисы открываются, список чатов грузится; в журнале Metro нет красных ошибок.

### Задача 5: сборка на iPhone владельца против прод-API
- **Действие**: `expo run:ios --device --configuration Release` с `APP_CONTOUR=ru`, подпись командой (Personal Team → после оплаты — команда аккаунта).
- **Проверка (приёмка вехи)**: на реальном iPhone вход через Google или Яндекс в системном браузере, возврат в приложение, список чатов из api.vedamatch.ru, открытие переписки и отправка сообщения; вход переживает перезапуск приложения.
- **Записать**: модель iPhone и версия iOS, что сломано визуально (безопасные зоны, клавиатура, жесты) — это вход в веху 2.

### Задача 6: документация
- **Действие**: раздел «iPhone» в `apps/mobile/README.md`; строка вехи 1 в PRD → `complete` после приёмки.
- **Проверка**: README понятен человеку без контекста беседы.

## Проверка

```bash
pnpm --filter @vedamatch/mobile lint
pnpm --filter @vedamatch/mobile test
pnpm --filter @vedamatch/mobile test:app-manifest
cd apps/mobile && APP_CONTOUR=ru npx expo prebuild --platform ios --clean
cd apps/mobile && npx expo run:ios
cd apps/mobile && APP_CONTOUR=ru npx expo run:ios --device --configuration Release
```

## Риски

| Риск | Вероятность | Смягчение |
|---|---|---|
| Оплата аккаунта Apple из России не проходит | средняя | Personal Team для работы над кодом; решение по лицу — до задачи 5 |
| Нативные пакеты не собираются под iOS с RN 0.86 new arch (`react-native-webrtc`, `react-native-incall-manager`) | средняя | задачи 3–4 первыми; при отказе — исключить пакет из автолинковки iOS, звонки всё равно в вехе 4 |
| Скрытые Android-only импорты, кроме найденных двух | средняя | прогон на симуляторе ловит их при старте; правка по образцу `SUPPORTED` |
| Исключение RNFB ломает Android | низкая | исключение только для `ios`; сборка APK в CI после мержа |
| Personal Team: подпись живёт 7 дней | высокая | только для разработки; к приёмке — оплаченный аккаунт |
| `openAuthSessionAsync` на iOS ведёт себя иначе (лист, cookies) | низкая | ручная проверка отмены и повторного входа в задаче 5 |

## Приёмка

- [ ] Аккаунт Apple Developer активен
- [ ] Все задачи выполнены, Android-сборка не изменилась
- [ ] Проверка проходит
- [ ] На iPhone владельца список чатов открывается против api.vedamatch.ru
- [ ] Образцы повторены, не изобретены заново
