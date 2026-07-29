# VedaMatch Library — сервис ссылок и закладок

Дата: 2026-07-29
Статус: спека утверждена, реализация не начата
Slug сервиса: `library`

## 1. Назначение

**VedaMatch Library (Библиотека ссылок)** — общая база полезных материалов экосистемы VedaMatch: статьи, видео, книги, курсы, сайты, каналы, приложения. Сервис доступен только авторизованным пользователям, виден всем духовным этапам без ограничений.

Пополняет базу любой пользователь. Публикация мгновенная, без премодерации. Качество регулируют голоса «полезно / не полезно», счётчик уникальных переходов и постмодерация по жалобам.

Главный принцип: структуру задаёт курируемый скелет разделов, наполнение и подкатегории отдают сообществу.

## 2. Принятые решения

| Вопрос | Решение |
|---|---|
| Тип сервиса | Публичный каталог (общая база), а не личные закладки |
| Кто наполняет | Все пользователи, публикация сразу, постмодерация по жалобам |
| Таксономия | 2 уровня: разделы создаёт админ, подкатегории — пользователи |
| Ссылка ↔ категория | Ссылка уникальна по нормализованному URL, состоит во многих категориях |
| Дубли | При повторном URL показываем существующую запись; при похожей категории — подсказка и подтверждение |
| Контент | Только ссылки: URL + OG-превью + двуязычные заголовок/описание. Файлов нет |
| Доступ гостям | Нет, только авторизованным |
| Языки | Контент двуязычный (RU/EN), UI переводится локальным словарём внутри сервиса |
| Ранжирование | Голоса + уникальные переходы, сортировка по умолчанию «Актуальное» |
| Тип материала | Фиксированный список типов как фильтр первого класса |
| Фильтры | Раздел/категория, тип материала, язык материала, сортировка |
| Модерация | Порог жалоб с авто-скрытием + админка `/admin/library` |

Осознанно не входит в v1 (YAGNI): теги, вложения-файлы, публичные подборки, комментарии, гостевой доступ, полный i18n портала, уровни доверия пользователей.

## 3. Что уже есть в проекте и переиспользуется

Проверено по `apps/api/package.json` и коду:

- `cheerio` — парсинг HTML и OG-тегов;
- `sharp` — ресайз превью в webp;
- `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` — хранение превью, как у аватаров (`users.service.ts`, `user-gallery.service.ts`);
- `@nestjs/throttler` — rate limit;
- `ioredis` — опциональный lease-лок воркера;
- паттерн фонового воркера — `apps/api/src/modules/motivation/motivation-worker.service.ts`: очередь в самой БД, `setInterval` 30 с, Redis-лок опционален (в `docker-compose.yml` Redis нет, воркер работает и без него);
- паттерн таблиц переводов и пользовательских настроек языка — `MotivationPostTranslation`, `MotivationPreference`.

Новой инфраструктуры сервис не требует.

## 4. Границы модуля

Соблюдается `docs/service-module-contract.md`:

- backend: `apps/api/src/modules/library/`, одна строка регистрации в `apps/api/src/app.module.ts`;
- модуль импортирует только `AuthModule`, глобальный `PrismaService` и типы из `@vedamatch/shared`;
- `User` читается read-only; запись в `User` запрещена, поэтому язык интерфейса хранится в собственной модели `LibraryPreference`;
- все маршруты с префиксом `library/`;
- модели БД с префиксом `Library`, отдельным блоком в конце `apps/api/prisma/schema.prisma` с комментарием `// ===== Library service =====`;
- frontend: `apps/web/src/app/library/`, компоненты `apps/web/src/components/library/`, клиент `apps/web/src/lib/library-api.ts`;
- shared-типы: `packages/shared/src/library.ts` + реэкспорт в `index.ts`;
- запись в каталоге: `Service` со `slug: 'library'`, `url: '/library'`, `status: 'coming_soon'` до готовности фазы A.

## 5. Модель данных

Разделы и категории — две отдельные модели, а не одно дерево с `parentId`: права на создание выражены схемой, а не проверками в рантайме.

### Энумы

- `LibraryEntryType`: `website`, `article`, `video`, `audio`, `book`, `course`, `app`, `telegram_channel`, `community`, `other`
- `LibraryEntryStatus`: `published`, `hidden_by_reports`, `removed_by_admin`
- `LibraryEnrichmentStatus`: `pending`, `queued`, `ready`, `failed`
- `LibraryCategoryStatus`: `active`, `hidden_by_reports`, `merged`, `removed`
- `LibraryReportTargetType`: `entry`, `category`
- `LibraryReportReason`: `broken_link`, `spam`, `offensive`, `wrong_category`, `duplicate`, `copyright`, `other`
- `LibraryReportStatus`: `open`, `accepted`, `rejected`

### Модели

**LibrarySection** — раздел верхнего уровня, создаёт только админ.
`id`, `slug` (unique), `titleRu`, `titleEn`, `descriptionRu?`, `descriptionEn?`, `iconKey?`, `position`, `createdAt`, `updatedAt`.

**LibraryCategory** — подкатегория, создаёт любой пользователь.
`id`, `sectionId` → LibrarySection, `slug` (unique в паре с `sectionId`), `titleRu?`, `titleEn?` (минимум одно обязательно), `descriptionRu?`, `descriptionEn?`, `createdById?` → User, `status`, `mergedIntoId?` → LibraryCategory, `normalizedRu`, `normalizedEn` (для `pg_trgm`), `entriesCount`, `followersCount`, `openReportsCount`, `needsReview`, `createdAt`, `updatedAt`.
Индексы: `sectionId`, `status`, GIN trgm на `normalizedRu` и `normalizedEn`.

Требование «минимум одно название обязательно» проверяется на уровне приложения (DTO-валидация в модуле), а не констрейнтом БД. То же для `LibraryEntry`.

Slug категории генерируется на бэкенде: из `titleEn`, если он заполнен, иначе транслитерацией `titleRu`; результат приводится к kebab-case, при коллизии внутри раздела дописывается числовой суффикс. Пользователь slug не вводит.

**LibraryEntry** — ссылка.
`id`, `url`, `urlNormalized` (unique), `canonicalUrl?`, `domain`, `type`, `contentLanguage` (VarChar(8)), `titleRu?`, `titleEn?` (минимум одно обязательно), `descriptionRu?`, `descriptionEn?`, `ogTitle?`, `ogDescription?`, `ogSiteName?`, `faviconUrl?`, `previewKey?`, `previewUrl?`, `enrichmentStatus`, `enrichmentError?`, `enrichedAt?`, `httpStatus?`, `lastCheckedAt?`, `addedById` → User, `status`, `needsReview`, `usefulCount`, `notUsefulCount`, `uniqueClickCount`, `bookmarkCount`, `openReportsCount`, `rankScore` (Float), `searchVector` (`Unsupported("tsvector")`), `publishedAt`, `createdAt`, `updatedAt`.
Индексы: `[status, rankScore]`, `[status, createdAt]`, `type`, `contentLanguage`, `domain`, `addedById`, GIN на `searchVector`.

**LibraryEntryCategory** — связь many-to-many.
`entryId`, `categoryId`, `addedById`, `createdAt`, составной PK `[entryId, categoryId]`.

**LibraryVote** — голос.
`userId`, `entryId`, `value` (`1` или `-1`), `createdAt`, `updatedAt`, PK `[userId, entryId]`.

**LibraryClick** — уникальные переходы, устойчиво к накрутке.
`userId`, `entryId`, `count`, `lastClickAt`, PK `[userId, entryId]`. `LibraryEntry.uniqueClickCount` = число строк по записи.

**LibraryBookmark** — закладка на ссылку.
`userId`, `entryId`, `note?`, `createdAt`, PK `[userId, entryId]`.

**LibraryCategoryFollow** — подписка на категорию.
`userId`, `categoryId`, `createdAt`, PK `[userId, categoryId]`.

**LibraryCollection** — личная подборка (в v1 приватная).
`id`, `ownerId` → User, `title`, `description?`, `itemsCount`, `createdAt`, `updatedAt`.

**LibraryCollectionItem**.
`collectionId`, `entryId`, `position`, `note?`, `createdAt`, PK `[collectionId, entryId]`.

**LibraryReport** — жалоба.
`id`, `reporterId` → User, `targetType`, `entryId?`, `categoryId?`, `reason`, `comment?`, `status`, `resolvedById?`, `resolvedAt?`, `resolutionNote?`, `createdAt`.
Уникальные индексы `[reporterId, entryId]` и `[reporterId, categoryId]`: в Postgres NULL-значения не конфликтуют, поэтому одна пара индексов корректно запрещает повторную жалобу на один объект.

**LibraryPreference** — настройки пользователя внутри сервиса.
`userId` (PK) → User, `uiLanguage` (default `"ru"`), `contentLanguages` (String[]), `createdAt`, `updatedAt`.

**LibraryModerationAudit** — аудит действий админа.
`id`, `adminId` → User, `action`, `targetType`, `entryId?`, `categoryId?`, `reason?`, `createdAt`.

## 6. Дедупликация

### Дубли ссылок

Нормализация URL перед записью:

1. схема приводится к `https`;
2. host в lower-case, снимается префикс `www.`;
3. вырезаются трекинговые параметры: `utm_*`, `fbclid`, `gclid`, `yclid`, `ref`;
4. убирается хвостовой слеш и фрагмент `#...`;
5. остальные query-параметры сортируются по алфавиту;
6. для YouTube остаётся только `v=<id>`, для youtu.be — раскрывается в канонический вид.

`urlNormalized` — только ключ дедупликации. Переход пользователя и обогащение всегда идут по исходному `url`, поэтому приведение схемы к `https` не ломает сайты, работающие только по `http`.

Уникальный индекс по `urlNormalized`. При повторном добавлении API отвечает `409 Conflict` с телом существующей записи. UI показывает не ошибку, а выбор: «Открыть существующую запись» или «Добавить её в мою категорию» (создаётся только строка в `LibraryEntryCategory`).

### Дубли категорий

Пока пользователь печатает название, `GET /library/categories/suggest?q=` ищет похожие через `pg_trgm` по `normalizedRu` и `normalizedEn` во всех разделах и показывает подсказку «Возможно, вы имели в виду…».

При создании, если similarity превышает `0.75`, API отвечает `422` со списком похожих категорий. Создание в этом случае требует явного `force: true`.

Админ объединяет дубли: у поглощённой категории `status: merged` и `mergedIntoId`, связи `LibraryEntryCategory` и подписки переносятся, старый slug отдаёт редирект.

## 7. Обогащение ссылок

Публикация никогда не ждёт внешний сайт.

1. Пользователь вставляет URL, фронт вызывает `POST /library/entries/preview`.
2. Бэкенд за 5 секунд пытается вытянуть OG-теги через `cheerio` и предзаполняет форму.
3. Пользователь правит заголовок, описание, тип и язык материала, выбирает категории.
4. Запись сохраняется со `enrichmentStatus: pending` и публикуется сразу.
5. Воркер скачивает OG-картинку, `sharp` конвертирует в webp 640×360, файл кладётся в S3 по ключу `library/entries/{entryId}/preview.webp`, статус становится `ready`.
6. При провале — `failed` с кодом в `enrichmentError`; карточка показывает favicon домена.

Воркер повторяет паттерн `MotivationWorkerService`: очередь в БД (выборка записей со статусом `pending`), `setInterval` 30 секунд, опциональный Redis-lease, ограничение попыток.

### SSRF-защита

Сервис ходит по пользовательским URL, поэтому обязательны:

- только схемы `http` и `https`;
- резолв DNS с отбраковкой loopback, private, link-local и multicast диапазонов (IPv4 и IPv6);
- максимум 3 редиректа, каждый проверяется заново;
- тело ответа не больше 2 МБ, картинка не больше 5 МБ;
- таймаут 5 секунд;
- собственный User-Agent `VedaMatchLibraryBot`;
- запрет на нестандартные порты кроме 80 и 443.

## 8. Ранжирование и поиск

Формула «Актуальное» — объяснимая, без чёрного ящика:

```
quality    = max(0, useful - 1.5 * notUseful)
engagement = log10(1 + uniqueClicks + 2 * bookmarks)
rankScore  = (1 + quality + engagement) / (hoursSincePublish + 6) ^ 1.3
```

`rankScore` денормализован в `LibraryEntry` и пересчитывается при голосе, переходе и закладке. Тот же воркер раз в 15 минут пересчитывает затухание для записей моложе 30 дней; для более старых затухание пренебрежимо и пересчёт не нужен.

Дополнительные сортировки: «Популярное» — по `quality + engagement` без затухания; «Новое» — по `publishedAt`.

Записи с явно отрицательным качеством (`notUseful >= 3 * useful` при пяти и более голосах) опускаются в конец выдачи и получают `needsReview`, попадая в очередь админа.

До фазы C закладок ещё нет, `bookmarkCount` равен нулю и слагаемое просто не влияет на результат. До фазы B нет ни голосов, ни переходов, поэтому в фазе A доступна только сортировка «Новое», а «Актуальное» и «Популярное» включаются вместе с фазой B и тогда же становятся сортировкой по умолчанию.

Поиск: generated-колонка `searchVector` вида

```sql
to_tsvector('russian', coalesce(title_ru,'') || ' ' || coalesce(description_ru,'')) ||
to_tsvector('english', coalesce(title_en,'') || ' ' || coalesce(description_en,''))
```

с GIN-индексом. В Prisma объявляется как `Unsupported("tsvector")?`, сама колонка и индекс создаются raw SQL в миграции. Той же миграцией включаются расширения `pg_trgm` и `unaccent`.

## 9. API

Все маршруты с префиксом `library/`, все требуют авторизации (`AuthGuard`).

Каталог:

```http
GET    library/sections
GET    library/categories?sectionId&q&sort
GET    library/categories/suggest?q
POST   library/categories            { sectionId, titleRu?, titleEn?, descriptionRu?, descriptionEn?, force? }
GET    library/categories/:slug
POST   library/categories/:id/follow
DELETE library/categories/:id/follow
```

Ссылки:

```http
GET    library/entries?sectionId&categoryId&type&language&sort&q&cursor
POST   library/entries/preview       { url }
POST   library/entries               { url, type, contentLanguage, titleRu?, titleEn?, descriptionRu?, descriptionEn?, categoryIds[] }
GET    library/entries/:id
PATCH  library/entries/:id           автор правит описание, тип, язык, категории; админ — всё
DELETE library/entries/:id           автор — только пока нет голосов и запись не старше 24 часов; иначе админ
POST   library/entries/:id/vote      { value: 1 | -1 | 0 }
POST   library/entries/:id/click
POST   library/entries/:id/bookmark  { note? }
DELETE library/entries/:id/bookmark
```

### Права на изменение

- **Ссылка.** Автор правит описание, тип, язык материала и набор категорий. URL после создания не меняется — если он неверен, запись удаляется или на неё отправляется жалоба `broken_link`. Удалить свою ссылку автор может, пока по ней нет голосов и она не старше 24 часов; позже удаляет только админ, потому что запись уже могла попасть в чужие закладки и подборки.
- **Категория.** После создания категория принадлежит сообществу: названия и описания правит только админ (`PATCH library/admin/categories/:id`), автор не имеет привилегий. Это исключает подмену смысла категории, в которую другие люди уже добавили ссылки.
- **Раздел.** Только админ.

Личный раздел:

```http
GET    library/me/bookmarks
GET    library/me/entries
GET    library/me/following
GET    library/me/preferences
PATCH  library/me/preferences        { uiLanguage?, contentLanguages? }
GET    library/collections
POST   library/collections           { title, description? }
PATCH  library/collections/:id
DELETE library/collections/:id
POST   library/collections/:id/items/:entryId    { note?, position? }
DELETE library/collections/:id/items/:entryId
```

Жалобы и админка:

```http
POST   library/reports               { targetType, targetId, reason, comment? }
GET    library/admin/reports?status&targetType
POST   library/admin/reports/:id/accept    { resolutionNote? }
POST   library/admin/reports/:id/reject    { resolutionNote? }
PATCH  library/admin/entries/:id/status    { status, reason }
POST   library/admin/categories/:id/merge  { intoId, reason }
PATCH  library/admin/categories/:id       { titleRu?, titleEn?, descriptionRu?, descriptionEn?, sectionId?, status? }
GET    library/admin/sections
POST   library/admin/sections
PATCH  library/admin/sections/:id
```

Пагинация ленты — курсорная (`cursor` = пара `rankScore`/`id` или `publishedAt`/`id` в зависимости от сортировки).

## 10. Frontend

Маршруты:

- `/library` — главная: полоса разделов, панель фильтров, лента;
- `/library/[section]` — раздел с подкатегориями;
- `/library/[section]/[category]` — лента категории;
- `/library/entry/[id]` — карточка ссылки;
- `/library/add` — добавление ссылки;
- `/library/me` — табы: закладки, подборки, мои ссылки, подписки;
- `/admin/library` — жалобы, объединение категорий, управление разделами.

Компоненты в `apps/web/src/components/library/`: `section-strip`, `entry-filters`, `entry-card`, `entry-list`, `category-picker`, `add-entry-form`, `duplicate-notice`, `similar-category-notice`, `report-dialog`, `collection-picker`, `locale-switch`.

Главная страница: сверху горизонтальная полоса разделов (иконка, название, счётчик записей), под ней фильтры (раздел → категория, тип материала, язык материала, сортировка), затем лента карточек с курсорной пагинацией.

Карточка ссылки: превью или favicon, домен, заголовок, описание в две строки, бейдж типа, язык материала, кнопка «полезно» со счётчиком, число переходов, закладка, жалоба. Клик по карточке открывает внешний URL в новой вкладке немедленно, а `POST library/entries/:id/click` уходит в фоне и переход не задерживает.

Двуязычность: словарь `apps/web/src/components/library/i18n.ts` с ключами `ru` и `en`, хук `useLibraryLocale()` читает `LibraryPreference.uiLanguage` (фоллбэк — `navigator.language`), переключатель RU/EN в шапке сервиса. Контент показывается по текущей локали с фоллбэком на другой язык, чтобы записи не выглядели пустыми.

## 11. Модерация

Одна жалоба от пользователя на один объект (уникальные индексы в `LibraryReport`).

Порог — три жалобы от разных пользователей:

- ссылка автоматически переходит в `hidden_by_reports` до решения админа;
- категория автоматически скрывается только если в ней меньше пяти ссылок, иначе получает `needsReview` — иначе три жалобы обнуляли бы работу сотен людей.

Жалобы пользователя, у которого уже три и более отклонённых жалоб, в пороге не учитываются. Отдельная модель для этого не нужна: счёт берётся запросом по `LibraryReport` со `status: rejected`.

Решение админа: `accept` — контент остаётся скрытым либо получает `removed_by_admin`; `reject` — контент возвращается в `published`, `openReportsCount` обнуляется. Каждое действие пишется в `LibraryModerationAudit`.

Rate limits через `@nestjs/throttler`: добавление ссылки 20/час, создание категории 5/час, жалоба 10/час, клик 60/мин, `entries/preview` 30/час.

## 12. Обработка ошибок

- `409` — URL уже есть в базе, в теле существующая запись; UI предлагает открыть её или добавить в свою категорию.
- `422` — найдена похожая категория; в теле список похожих, повтор с `force: true`.
- Сбой обогащения не блокирует публикацию: `enrichmentStatus: failed`, карточка показывает favicon.
- Битые ссылки: `httpStatus` фиксируется при обогащении, пользователю доступна жалоба `broken_link`.
- Недоступный S3 не ломает добавление: превью остаётся `pending` и будет повторено воркером.
- Отсутствие Redis не ломает воркер: он работает без распределённого лока (как `MotivationWorkerService`).

## 13. Фазы реализации

**Фаза A. Ядро каталога.** Prisma-модели и миграции (включая `pg_trgm`, `unaccent`, `searchVector`), shared-типы, разделы, создание категорий с дедупом, добавление ссылок с ручными полями, связь many-to-many, лента с фильтрами и сортировкой «Новое», полнотекстовый поиск, словарь i18n и переключатель языка. Превью ещё нет — показывается favicon. Запись сервиса в seed со `status: coming_soon`.

Статус: реализовано 2026-07-29, сервис в каталоге со статусом `coming_soon` до завершения фазы B.

Стартовые разделы для seed (`LibrarySection`, RU / EN):

1. Философия и писания / Philosophy and scriptures
2. Практика и садхана / Practice and sadhana
3. Лекции и видео / Lectures and video
4. Музыка и киртан / Music and kirtan
5. Здоровье и аюрведа / Health and Ayurveda
6. Обучение и курсы / Education and courses
7. Общины и храмы / Communities and temples
8. Инструменты и приложения / Tools and apps

Разделы неизменяемы для пользователей; новые добавляет админ через `/admin/library`.

**Фаза B. Обогащение и качество.** OG-парсер с SSRF-защитой, `entries/preview`, воркер превью в S3, голоса, уникальные переходы, `rankScore` и пересчёт затухания. Перевод сервиса в `status: active`.

**Фаза C. Личное.** Закладки с заметкой, подписки на категории, личные подборки, страница `/library/me`.

**Фаза D. Модерация.** Жалобы, авто-скрытие по порогу, `/admin/library`, объединение дублей категорий, аудит действий.

**Фаза E. Потом.** Публичные подборки, воркер проверки битых ссылок, теги, вложения-файлы, RSS и экспорт.

Каждая фаза получает собственный план реализации: спека покрывает сервис целиком, но одним планом реализуется одна фаза. Фазы идут строго по порядку, так как B опирается на модели A, а D — на счётчики B.

## 14. Тестирование

Unit-тесты чистых функций по образцу `apps/api/src/modules/auth/password.spec.ts` и `apps/web/src/lib/union-location.spec.ts`:

- нормализация URL (трекинговые параметры, YouTube, слеши, регистр);
- формула `rankScore` и монотонность по голосам и времени;
- порог similarity для категорий;
- SSRF-guard на таблице опасных адресов (`127.0.0.1`, `10.0.0.0/8`, `169.254.0.0/16`, `::1`, `localhost`, нестандартные порты);
- фоллбэк локали при пустом переводе;
- расчёт порога авто-скрытия с учётом отклонённых жалобщиков.

E2E через `supertest`:

- повторный URL отдаёт `409` с существующей записью;
- похожая категория отдаёт `422`, создаётся с `force: true`;
- три жалобы от разных пользователей скрывают ссылку;
- жалоба пользователя с тремя отклонёнными жалобами порог не двигает;
- категория с пятью и более ссылками не скрывается автоматически.

Перед сдачей каждой фазы: `prisma validate`, `prisma generate`, `lint`, `build`, `test`.

## 15. Чек-лист по контракту сервисного модуля

1. Блок моделей `// ===== Library service =====` в `apps/api/prisma/schema.prisma` + миграция.
2. `packages/shared/src/library.ts` + реэкспорт в `index.ts`.
3. `apps/api/src/modules/library/` + одна строка в `app.module.ts`.
4. Запись сервиса в `apps/api/prisma/seed.ts` со `status: 'coming_soon'` и базовыми разделами.
5. `apps/web/src/app/library/`, `apps/web/src/components/library/`, `apps/web/src/lib/library-api.ts`.
6. По готовности фазы B — `status: 'active'` и относительный `url: '/library'`.
