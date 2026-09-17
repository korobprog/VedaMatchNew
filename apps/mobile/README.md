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
- `public/` — шаблон страницы, манифест, иконки, самохостящиеся woff2-шрифты
  (`public/fonts/`) и service worker (кэширует только оболочку, ответы API —
  никогда).

### Скорость (веха 6)

Замер — `apps/mobile/e2e-web/perf.mjs` (Playwright, iPhone UA, CPU ×4, сеть
1,6 Мбит/150 мс, холодный контекст), локально против `npx serve --single
dist-web`; методология и числа «до» — `gan-harness/perf-baseline.md`, «после»
— `gan-harness/perf-after.md`. Коротко: FCP упал с ~4,2 с до ~0,2–0,3 с
(картина бренда вместо пустого экрана), кнопки входа появляются за ~4,2–4,7 с
(было ~4,2–4,3 с — в пределах разброса), JS первого экрана — 592 КБ сжато
вместо 647 КБ, плюс экраны звонка/людей/общин/аккаунта/сервисов больше не
входят в первую загрузку вовсе (грузятся по переходу).

Что сделано:

- **Шрифты не блокируют кадр.** На вебе `useFonts` не запускается —
  `src/app/_layout.web.tsx` рендерит сразу, `src/app/_layout.tsx` (нативный)
  для веба не используется вовсе. Имена начертаний (`fonts.*` из
  `src/theme/tokens.ts`) объявлены как `@font-face` прямо в
  `public/index.html`, файлы — самохостящиеся woff2-подмножества (кириллица +
  латиница, `public/fonts/`, ⅙ веса исходных TTF из `@expo-google-fonts`) с
  `font-display: swap`. Сознательно БЕЗ `<link rel="preload">` на шрифты и без
  `<img>` в оболочке (SVG-монограмма инлайном): на throttled-сети полоса
  общая на все параллельные закачки, и любой лишний файл в критическом пути
  отбирает её у главного бандла — измерено, что с предзагрузкой шрифтов
  первый экран становился медленнее, а не быстрее.
- **Оболочка до JS.** `public/index.html` рисует фирменный знак и спиннер
  внутри `#root` инлайн-CSS (без сети) — React полностью заменяет это при
  рендере.
- **Бандл не делится по маршрутам — осознанно.** `asyncRoutes` в
  `expo-router` пробовали: холодный запуск не выиграл (4,62 с против 4,29 с
  одним бандлом), а повторный, из кэша service worker, стал в пять раз
  медленнее (0,9 с против 0,14–0,20 с): двадцать чанков грузятся и
  выполняются цепочкой. Установленное приложение чаще открывают повторно.
- **Сжатие.** `nginx.web.conf`: `gzip_comp_level 6` — с уровнем по умолчанию
  (1) бандл шёл на ~20 % тяжелее.
- **Один список экранов.** Корней два (`_layout.tsx` ждёт вшитые шрифты,
  `_layout.web.tsx` рисует сразу), а стек и провайдеры общие —
  `src/components/root-shell.tsx`.

Замер (Playwright, iPhone, CPU ×4, 1,6 Мбит/150 мс, nginx с боевым
конфигом, `e2e-web/perf.mjs`): первый кадр ~4,2 с → ~0,21 с; кнопки входа
при холодном запуске ~4,3 с; повторный запуск 0,14–0,20 с.

### Скорость, доп. заход: меньше JS до кнопок входа

Веха 6 срезала JS первого экрана точечно (шрифты, оболочка, сжатие), но
кнопки входа так и появлялись за ~4,3–4,6 с — упирались в ~660–670 КБ
сжатого JS одним бандлом (`gan-harness/perf-after.md`, «Проверка
оркестратора»). Разбор бандла по source map (`source-map`, метод как у
`source-map-explorer`, приписывание байт генерируемого файла к исходнику)
показал: `react-native-reanimated` — **724 КБ несжатого JS, 27–28 % всего
бандла**, хотя ни один файл приложения не импортирует его напрямую.

Причина — барреловые импорты мимо `Platform.OS`: `react-native-keyboard-
controller`, `react-native-gesture-handler`, `expo-audio`+рингтоны и вся
машинерия звонков (`react-native-webrtc`/`react-native-incall-manager`)
были нужны только части экранов (чат, карточка анкеты, звонок), но
Metro включал их в первый бандл целиком, потому что:

1. `KeyboardProvider`, `KeyboardAvoidingView`, `KeyboardAwareScrollView`
   импортируют `Reanimated` на уровне модуля не глядя, используется он или
   нет, — а `KeyboardProvider` висел в корневом layout всегда.
2. `GestureHandlerRootView` (тоже в корневом layout) резолвится через
   баррел `react-native-gesture-handler/index.js`, который реэкспортирует
   `Swipeable`/`DrawerLayout`/`PanGestureHandler` — те делают `require('react-
   native-reanimated')` при загрузке модуля (необязательная интеграция,
   `reanimatedWrapper.js`; `try/catch` там ловит рантайм, а не решение
   Metro включать модуль в бандл).
3. `CallProvider` (звонки) был статически реэкспортирован пятью местами
   (кнопка звонка в шапке чата, три баннера, экран звонка) через тот же
   файл, где жил и сам провайдер, — доставая WebRTC-сессию и `expo-audio` в
   первый бандл, даже когда провайдер нигде не рендерился.

Правки — только для веба (`*.web.tsx`/`Platform.OS`), Android не тронут:

- `components/root-shell.web.tsx`: `KeyboardProvider` не монтируется вовсе
  — у `react-native-keyboard-controller` есть безопасный контекст по
  умолчанию (без провайдера хуки получают заглушку и не падают, в деве
  только предупреждение). `GestureHandlerRootView` — глубокий импорт
  `react-native-gesture-handler/lib/module/components/GestureHandlerRootView`
  мимо баррела: на вебе это тривиальный `View`
  (`GestureHandlerRootView.web.js` пакета) без `Reanimated` вовсе.
  `CallProvider` — `React.lazy()` + `Suspense`, гейт по `status ===
  'signed'` (у гостя звонков не бывает по определению): пока чанк не
  пришёл (или для гостя — всегда), рендерятся обычные `children` без
  контекста звонков — `useChatCalls()` и так по контракту может вернуть
  `null`. `CallChunkBoundary` (`componentDidCatch`) — на случай обрыва сети
  при загрузке чанка, без него `lazy()` уронил бы всё дерево.
- `components/keyboard-controller-web.web.tsx`: `ChatKeyboardAvoidingView`
  (`app/chat/[id].tsx`) и `PersonKeyboardAwareScroll`
  (`app/people/[id].tsx`) на вебе грузятся через `import()` по месту
  использования, а не в корне; `Suspense`-фолбэк — обычный `View`/
  `ScrollView` с теми же детьми, раскладка не ломается, анимация под
  клавиатуру появляется на пару сотен миллисекунд позже первого кадра
  экрана чата/анкеты, не раньше. На телефоне (`keyboard-controller-
  web.tsx`) — прямой реэкспорт, ничего не меняется.
- `lib/calls/chat-calls-context.ts`: `ChatCallsContext`/`useChatCalls`
  вынесены из `call-provider.tsx` в файл без тяжёлых зависимостей — раньше
  любой компонент, которому был нужен только хук, синхронно тянул весь
  провайдер целиком, сводя `lazy()` на шаге выше к нулю (проверено
  замером: без этого выноса `expo-audio` и код звонков всё равно
  дублировались в основном бандле). Импортировать `useChatCalls` теперь
  нужно отсюда, не из `call-provider.tsx`.
- `components/services/service-icons.web.tsx`: иллюстрации каталога
  сервисов (~33 КБ несжатого JS на 13 сервисов, `react-native-svg`) нужны
  только на вкладке «Сервисы» после входа — на вебе грузятся отдельным
  чанком по требованию; на телефоне (`service-icons.tsx`) — реэкспорт
  `service-icons-impl.tsx` без изменений.

Результат (тот же `e2e-web/perf.mjs`, тот же nginx с `nginx.web.conf`,
`docker run nginx:1.29-alpine`, оба варианта — билд этого же дерева, чтобы
не мерить эффект сети/CDN):

| Сборка | Кнопки входа (холодный), мс | JS по сети, КБ (gzip 6) | Повторный запуск (SW), мс |
|---|---|---|---|
| до (эта же ветка, код до правки) | 4479–4668 | 667 | 157–253 |
| **после** | **3178–3270** | **419** | **161–208** |

Кнопки входа — на ~1,3–1,4 с быстрее (~30 %), JS первого экрана — на 37 %
меньше. Цель PRD «≤ 2,5 с» полностью не достигнута — упирается в оставшиеся
~430 КБ сжатого JS: ядро `expo-router`+`react-navigation` (429 КБ
несжатого, необходимая инфраструктура маршрутизации, включая сам экран
входа), `react-native-web` (276 КБ) и `react-dom` (175 КБ) — рантаймы, а не
код фич, и код экранов, которые гость никогда не видит (чат, аккаунт,
анкета, звонок, вкладки), но которые лежат в том же бандле, потому что
переход на маршрутную разбивку (`asyncRoutes`) уже проверен веха 6 и явно
отвергнут — на холодном старте не выигрывает, а на повторном, из кэша
service worker, топит впятеро (20 чанков цепочкой). Дальнейшее сокращение
для гостя потребовало бы того же рода компромисса (чанк на экран) — то
есть той самой регрессии, которую эта веха специально не трогает.
Повторный запуск не просел (161–208 мс против 157–253 мс до правки, в
пределах разброса замера) — ни один из новых чанков не грузится на экране
входа ни при холодном, ни при повторном запуске гостя, только после
настоящего действия (вход, открытие чата/анкеты, вкладка «Сервисы»).

Что пробовал и отбросил:

- Замену `KeyboardAvoidingView`/`KeyboardAwareScrollView` на обычные
  `View`/`ScrollView` без клавиатурной логики вместо `lazy()` — отбросил:
  `bottomOffset` в `people/[id].tsx` чинит задокументированный дефект
  (раунд оценки 005, дефект 3), терять его насовсем ради байтов нечестно;
  `lazy()` с функциональным `Suspense`-фолбэком даёт тот же выигрыш в весе
  без потери поведения (только на пару сотен миллисекунд позже на
  безлюдных для первого экрана маршрутах).
- Полный отказ от `GestureHandlerRootView` на вебе вместо глубокого
  импорта — отбросил: `expo-router`/`react-navigation` на вебе сами не
  используют `react-native-gesture-handler` (проверено — `expo-router`'s
  `GestureHandler.js` для веба отдаёт заглушку `View`/`Fragment`), но
  корневой провайдер продолжает быть тем местом, где `GestureHandlerRootViewContext`
  выставляется в `true` для любых будущих потребителей — трогать его не
  было нужды, раз глубокий импорт и так убирает вес бесплатно.

### Мини-приложение Telegram

Тот же адрес открывает бот `@vedamatch_bot` (BotFather → Configure Mini App
и Menu Button → `https://ios.vedamatch.com`). Telegram добавляет к адресу
`#tgWebAppData=…` — по нему `src/lib/telegram/launch.ts` узнаёт запуск, и
только тогда подключается `telegram-web-app.js`
(`src/lib/telegram/web-app.web.ts`).

- **Вход без экрана входа:** если сессии ещё нет, `session.web.tsx`
  отправляет подписанные данные на `POST /auth/telegram/webapp`. Сервер
  проверяет подпись ключом бота (`TELEGRAM_BOT_TOKEN`,
  `apps/api/src/modules/auth/telegram-init-data.ts`) и ставит обычную cookie
  сессии. Уже вошли (например, через Google прямо в Telegram) — сессия не
  трогается, второго аккаунта не будет.
- **Аккаунт из Telegram** получает служебную почту
  `tg-<id>@users.vedamatch.invalid` — Telegram почту не сообщает.
- **Оболочка** (`telegram-shell.web.tsx`): `ready()`, `expand()`, цвета шапки,
  запрет свайпа вниз, системная кнопка «Назад» вместо своей на вложенных
  экранах.
- Способ `telegram` включён только для `vedamatch.com`
  (`AuthProviderSetting`).

Проверить локально: API с `TELEGRAM_BOT_TOKEN=<любой тестовый>`, открыть
`http://localhost:8093/#tgWebAppData=<данные, подписанные этим токеном по
формуле из telegram-init-data.ts>&tgWebAppVersion=8.0` — страницу, а не
только фрагмент, нужно загрузить заново.

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

### Звонки в веб-сборке (этап 5)

`react-native-webrtc`/`react-native-incall-manager` подменяются на
`web-shims/` (`metro.config.js`) — звонок в браузере идёт на встроенном
`RTCPeerConnection`, тот же сигналинг API (`chat/calls/*`,
`GET /chat/stream`), что и на Android. Отличия от нативной ветки:

- Смена камеры (`switchCamera`) на Android — приватный `_switchCamera()` у
  `react-native-webrtc`; в браузере такого метода нет, поэтому на вебе
  (`Platform.OS === 'web'`) `webrtc-session.ts` пересобирает картинку сама:
  новый `getUserMedia({facingMode})` + `RTCRtpSender.replaceTrack` без
  пересогласования SDP. На устройстве без второй камеры (десктоп) тихо
  ничего не меняет — тот же исход, что и у нативной ветки без видеодорожки.
- Аудиозвонок в браузере без единого `RTCView` — картинка не нужна, но звук
  собеседника должен же откуда-то звучать: `remote-audio-playback.ts`
  решает, когда экрану звонка (`app/call/[id].tsx`) нужен скрытый 1×1
  `RTCView` только ради звука; на видеозвонке звук уже идёт вместе с видимым
  видео, второй элемент не добавляется.
- «Не гаснет экран на видео» — `InCallManager.setKeepScreenOn` на вебе
  реализован через Screen Wake Lock API (`web-shims/react-native-incall-manager.ts`);
  нет браузерной поддержки (Safari) — тихий no-op, как и раньше.
- Кнопка выбора аудиомаршрута (наушники/Bluetooth/громкая связь) скрыта на
  вебе целиком: управляет ей `react-native-incall-manager`, которого там нет
  вовсе, — рабочая кнопка без эффекта хуже отсутствующей.
- «Нет доступа к микрофону/камере» на вебе не отправляет в несуществующие
  системные настройки (`Linking.openSettings()` в `react-native-web` не
  реализован — бросил бы `TypeError`), а предлагает разрешить доступ в
  браузере и обновить страницу (`call-media-error.ts`).
- Свернули вкладку с ещё не отвеченным входящим — звонок не отклоняется
  автоматически (было унаследовано от ветки «не Android — точно iOS», а
  нативной iOS-сборки в этом продукте нет вовсе, только веб): решение —
  `call-app-background-policy.ts`.

Автоматическая проверка двумя браузерами — `e2e-web/calls.e2e.mjs` (не часть
`pnpm test`/CI, отдельный ручной прогон). Нужны: собранная веб-версия,
отданная на ДВУХ разных хостах (не портах одного — cookie сессии видны на
любом порту `localhost`, значит два `localhost:PORT` расшарили бы её
случайно, поэтому один инстанс — `localhost`, второй — `127.0.0.1`) и API с
`DEV_AUTH_ENABLED=true` и обоими адресами в `WEB_ORIGIN`, плюс демо-аккаунты
(`pnpm --filter @vedamatch/api seed:dev`, диалог Радхи и Говинды уже в сиде).

```bash
# API (пример — свободные порты, не трогать 4094-4096/8094-8096/9099 и
# Postgres 55495, если рядом работает оркестратор):
API_PORT=4097 \
WEB_ORIGIN=http://localhost:8097,http://127.0.0.1:8098 \
DATABASE_URL=postgres://…@localhost:55497/vm_calls_e2e \
DEV_AUTH_ENABLED=true NODE_ENV=development \
pnpm --dir apps/api exec nest start

# Две сборки: у каждой свой адрес API на том же хосте, что и её страница.
# Cookie сессии ставятся на хост API; страница на 127.0.0.1 не увидит
# маркер входа, поставленный на localhost, и останется гостем.
# --clear обязателен: Metro не учитывает APP_API_ORIGIN в ключе кэша.
APP_CONTOUR=com APP_API_ORIGIN=http://localhost:4097 \
npx expo export --platform web --output-dir dist-web --clear
APP_CONTOUR=com APP_API_ORIGIN=http://127.0.0.1:4097 \
npx expo export --platform web --output-dir dist-web-b --clear
npx serve --single dist-web -l tcp://localhost:8097 &
npx serve --single dist-web-b -l tcp://127.0.0.1:8098 &

WEB_A=http://localhost:8097 WEB_B=http://127.0.0.1:8098 \
API_A=http://localhost:4097 API_B=http://127.0.0.1:4097 \
node apps/mobile/e2e-web/calls.e2e.mjs
```

Сценарий: вход паролем `POST /auth/dev-login` для Радхи (A) и Говинды (B)
через `context.request` (cookie оседает в `BrowserContext`, отдельном для
каждого), открытие их личной беседы, A нажимает «Аудиозвонок»/«Видеозвонок»
в шапке (`accessibilityLabel`, он же `aria-label`), B отвечает по баннеру
входящего, обе стороны доходят до строки таймера разговора (это и есть
`connectionState === 'connected'` — она появляется только после
`onConnected` в `webrtc-session.ts`), у видеозвонка дополнительно проверяется
`videoWidth > 0` удалённого `<video>`, затем A вешает трубку и обе стороны
возвращаются в беседу. `chromium.launch` — с
`--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`, реальная
камера/микрофон не нужны.
