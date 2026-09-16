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
`src/lib/calls/background-decline.ts`), «Ответить» открывает экран звонка
и сам принимает вызов. Разбор понятие/подробности — `docs/mobile-calls-native.md`,
§11. На Android 14+, если система не выдала `USE_FULL_SCREEN_INTENT` молча,
на вкладке «Звонки» есть кнопка «Разрешить в настройках».

Служебный экран «Проверка связи» (замер relay STUN/TURN на текущей сети)
скрыт: долгое нажатие на заголовок вкладки «Звонки» открывает
`/calls-probe`. Это инструмент команды, не часть продукта — запускать с
разных сетей (домашний Wi-Fi, мобильный интернет) и присылать строку
итога в отчёт.
