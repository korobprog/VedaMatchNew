# VedaMatch для Android

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
