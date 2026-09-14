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
**Mobile APK** в GitHub Actions: запуск вручную, выбор контура и канала,
готовый файл лежит в артефактах запуска. Пока подпись отладочная, релизный ключ
появится вместе с выпуском в магазины.

## Firebase

`google-services.json` в репозиторий не кладётся. Проект Firebase —
`vedamathai`, пакет — `com.vedamatch.app`.
