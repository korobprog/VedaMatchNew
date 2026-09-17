# VedaMatch для Android и веба

Нативное приложение портала на Expo SDK 57 и React Native. В нижнем меню
только связь: Чаты, Звонки, Люди, Общины. Остальные сервисы открываются из
вкладки «Сервисы».

## Сборки

Контур и канал задаются переменными окружения при сборке и зашиваются в
`extra.variant` (см. `src/config/variant.ts`).

| `APP_CONTOUR` | `APP_CHANNEL` | API | Где раздаётся | Самообновление |
|---|---|---|---|---|
| `ru` | `site` | api.vedamatch.ru | файл с vedamatch.ru | да |
| `ru` | `store` | api.vedamatch.ru | RuStore | нет |
| `com` | `site` | api.vedamatch.com | файл с vedamatch.com | да |
| `com` | `store` | api.vedamatch.com | Google Play | нет |

Для разработки против локального API: `APP_API_ORIGIN=http://10.0.2.2:4000`
(адрес машины разработчика из эмулятора Android).

## Вход

Аккаунт тот же, что на сайте. Кнопка открывает системный браузер на
`/auth/google` или `/auth/yandex` API с параметрами `app_redirect` и
`app_challenge` (PKCE). Колбэк возвращает одноразовый код на
`vedamatch://auth`, приложение меняет его на пару токенов через
`POST /auth/app/token` с верификатором. Токены лежат в expo-secure-store,
access обновляется заранее через `POST /auth/app/refresh`.

В отладочной сборке на экране входа есть форма email и пароль: она ходит в
`POST /auth/app/dev-login`, который на сервере включается только
`DEV_AUTH_ENABLED=true` и в production не работает. Демо-аккаунты создаёт
`pnpm --filter @vedamatch/api seed:dev`, пароль `vedamatch`.

## Веб-версия (ios.vedamatch.com)

Та же кодовая база собирается для браузера — это версия для iPhone без
App Store (`docs/prds/iphone-app.prd.md`). Ходит только в
`api.vedamatch.com`.

```bash
APP_CONTOUR=com pnpm --filter @vedamatch/mobile export:web   # → apps/mobile/dist-web
pnpm --filter @vedamatch/mobile test:web-shims
pnpm --filter @vedamatch/mobile generate:web-icons           # иконки из assets/images/icon.png
```

Чем веб отличается от Android:

- **Нативные пакеты** без браузерной версии (`react-native-webrtc`,
  `react-native-incall-manager`, `@react-native-firebase/messaging`)
  подменяет `metro.config.js` файлами из `web-shims/`. Звонки идут на
  встроенном WebRTC браузера.
- **Платформенные файлы** `*.web.ts(x)` рядом с нативными: `session`,
  `token-store`, `push-bridge`, `background-handler`.
- **Сессия — httpOnly cookie портала**, токенов в JS нет
  (`src/lib/auth/session.web.tsx`). Cookie стоят на `.vedamatch.com`, поэтому
  вошедший на vedamatch.com вошёл и здесь. Вход — переход на
  `/auth/google|yandex?returnOrigin=…`; сервер вернёт на поддомен, только если
  он есть в `WEB_ORIGIN` и принадлежит тому же сайту (`resolveReturnOrigin`).
- **Пушей FCM нет** — уведомления веб-версии пойдут через Telegram-бота.
- `public/` — шаблон страницы, манифест, иконки и service worker (кэширует
  только оболочку, ответы API — никогда).

Раздача — сервис `app-web` в `portal/docker-compose.dokploy.yml`
(`Dockerfile.web`, nginx). Домен `ios.vedamatch.com` → порт 80; поддомен
обязан быть в `WEB_ORIGIN` API.

Локально: API с `WEB_ORIGIN=…,http://localhost:8093`, сборка с
`APP_API_ORIGIN=http://localhost:4000`, статика — `npx serve --single dist-web
-l 8093`. Войти можно `POST /auth/dev-login` с `credentials: 'include'`
(нужен `DEV_AUTH_ENABLED=true`): cookie на `localhost` видны на любом порту.

## Команды

```bash
pnpm --filter @vedamatch/mobile lint      # tsc --noEmit
pnpm --filter @vedamatch/mobile test      # jest-expo, *.spec.ts рядом с кодом
pnpm --filter @vedamatch/mobile start     # Metro для dev client
pnpm --filter @vedamatch/mobile prebuild  # сгенерировать android/ (в git не хранится)
```

Expo Go не подходит: звонки требуют нативный модуль WebRTC, нужен dev client.

## APK

Локально нужны JDK 17 и Android SDK. Без них APK собирает workflow
**Mobile APK** в GitHub Actions: запуск вручную, выбор контура, канала и
чекбокса `publish`. Готовый файл лежит в артефактах запуска всегда; при
`channel=site` и `publish=true` он же публикуется в S3 портала для
самообновления (VED-176).

### Релизная подпись

Без секретов ниже APK подписывается отладочным ключом шаблона Expo — так
собирает и сам разработчик локально, ничего не меняется. С секретами
`.github/workflows/mobile-apk.yml` декодирует keystore во временный файл и
экспортирует переменные, которые читает `plugins/with-release-signing.js`
(config-плагин Expo, регистрируется в `app.config.ts`) — он добавляет
`signingConfigs.release` в сгенерированный `android/app/build.gradle` и
переключает на него `buildTypes.release`. Чистая подстановка текста
покрыта тестом: `pnpm --filter @vedamatch/mobile test:gradle-release-signing`.

Настоящий релизный ключ создан локально и лежит **вне репозитория**, в
`/Users/mamu/secrets` — в git его не кладём никогда. Пароли и алиас — у
владельца ключа.

### Секреты GitHub Actions

| Секрет | Назначение |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | Keystore (`.jks`) в base64 одной строкой |
| `ANDROID_KEYSTORE_PASSWORD` | Пароль keystore |
| `ANDROID_KEY_ALIAS` | Алиас ключа внутри keystore |
| `ANDROID_KEY_PASSWORD` | Пароль самого ключа |
| `S3_ENDPOINT` | Адрес S3-совместимого хранилища портала |
| `S3_REGION` | Регион хранилища |
| `S3_ACCESS_KEY` | Ключ доступа |
| `S3_SECRET_KEY` | Секретный ключ доступа |
| `S3_BUCKET_NAME` | Бакет портала (тот же, что у API) |
| `S3_PUBLIC_URL` | Публичный адрес бакета, из него собирается ссылка на APK |

Любого из S3-секретов не хватает — шаг публикации предупреждает и
пропускает себя, артефакт запуска остаётся. `GOOGLE_SERVICES_JSON` — секрет
Firebase, был и раньше, к релизной подписи отношения не имеет.

### versionCode и versionName

`versionCode` обязан расти от сборки к сборке — иначе самообновление
(channel=site) не увидит в новом файле обновление. В CI он приходит из
`github.run_number` со смещением (`.github/workflows/mobile-apk.yml`), локально
— всегда `1`. `versionName` — номер пакета из `package.json`, в CI plus
короткий sha сборки. Обе формулы чистые и покрыты тестом:
`src/config/app-version.ts` / `pnpm --filter @vedamatch/mobile test -- app-version`.

### Публикация первого APK

1. Добавить секреты выше в настройках репозитория (Settings → Secrets and
   variables → Actions).
2. Запустить workflow **Mobile APK**: `contour=ru`, `channel=site`,
   `publish=true`.
3. После успеха на сайте появится `https://<S3_PUBLIC_URL>/mobile/android/ru-site/latest.json`
   — страница `/app` на сайте читает его напрямую (переменная
   `APP_DOWNLOAD_BASE_URL` контейнера web, см. `portal/docker-compose.dokploy.yml`).

## Firebase

`google-services.json` в репозиторий не кладётся. Проект Firebase —
`vedamathai`, пакет — `com.vedamatch.app`.

## Звонки

Разведка (этап 0, VED-218) закрыта: `react-native-webrtc` +
`@config-plugins/react-native-webrtc` собираются с RN 0.86 new
architecture; `react-native-callkeep` не берём (сломан под new arch,
релиз не выходил два года) — вместо него свой тонкий Expo-модуль на
self-managed `ConnectionService`; фоновый пуш для звонка поднимает
`@react-native-firebase/messaging`, а не фоновая задача
`expo-notifications`. Подробности, ссылки и поправки к следующим этапам —
`docs/mobile-calls-native.md`.

Звонок при открытом приложении и история звонков (этап 1, VED-219) —
вкладка «Звонки», экран `call/[id]`, `src/lib/calls/*`.

Входящий звонок при свёрнутом и закрытом приложении (этап 2, VED-221):
`@react-native-firebase/messaging` — единственный приёмник FCM на Android
(манифест правит `plugins/with-native-calls.js`, `expo-notifications`
остаётся только презентацией обычных пушей чата); свой нативный модуль
`modules/vedamatch-calls` поднимает self-managed `ConnectionService` и
полноэкранное уведомление с `CallStyle.forIncomingCall`; «Отклонить» из
шторки/блокировки идёт headless JS задачей без открытия приложения
(`src/lib/calls/decline-call-headless-task.ts`,
`src/lib/calls/background-call-action.ts`), «Ответить» открывает экран звонка
и сам принимает вызов. Подробности — `docs/mobile-calls-native.md`,
§11. На Android 14+, если система не выдала `USE_FULL_SCREEN_INTENT` молча,
на вкладке «Звонки» есть кнопка «Разрешить в настройках».

Звонок как у системной звонилки (этап 3, VED-222): служба переднего плана
(`modules/vedamatch-calls/.../CallForegroundService.kt`) с постоянным
уведомлением «Идёт звонок» на время разговора (`CallStyle.forOngoingCall`,
кнопка «Завершить», нажатие возвращает на экран звонка), останавливается на
всех путях завершения, включая смах приложения из списка последних задач
(`onTaskRemoved`, решение — завершить и звонок, не оставлять зависшее
уведомление). Аудиомаршрутизация — целиком `react-native-incall-manager`
(разговорный динамик по умолчанию для аудио, громкая связь для видео,
автопереключение на Bluetooth/проводную гарнитуру, кнопка выбора устройства
при доступности больше двух маршрутов, датчик приближения); экран не гаснет
только на видео. Картинка в картинке для видеозвонка при уходе из
приложения — свой модуль правит `MainActivity` через конфиг-плагин
(`plugins/with-native-calls.js`), в PiP только видео собеседника без кнопок.
Смена Wi-Fi ↔ мобильный интернет перезапускает ICE немедленно, а не по
таймеру обрыва. «Занято» — второй входящий отклоняется автоматически, а
сотовый звонок во время разговора VedaMatch корректно завершает его.
Подробности и решения — `docs/mobile-calls-native.md`, §12.

Первая живая проверка (Samsung Galaxy A51, Android 13) нашла и починила два
`SecurityException` от Telecom на этой прошивке (`isInCall`/`getPhoneAccount`
требовали `READ_PHONE_STATE`/`READ_PHONE_NUMBERS`, которые в манифест
сознательно не добавлены) и лишнее уведомление о пропущенном звонке не на
канале `calls` — источник которого оказался на сервере (`chat.call-missed`
не различает `nativeCalls`, правка вне этого worktree). Подробности —
`docs/mobile-calls-native.md`, §12.14.

Служебный экран «Проверка связи» (замер relay STUN/TURN на текущей сети)
скрыт: долгое нажатие на заголовок вкладки «Звонки» открывает
`/calls-probe`. Это инструмент команды, не часть продукта — запускать с
разных сетей (домашний Wi-Fi, мобильный интернет) и присылать строку
итога в отчёт.
