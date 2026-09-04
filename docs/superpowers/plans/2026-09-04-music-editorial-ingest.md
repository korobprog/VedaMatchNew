# Редакционное пополнение аудиотеки — план реализации

> **Для агентов:** выполнять по задачам через `superpowers:subagent-driven-development`
> или `superpowers:executing-plans`. Шаги помечены чекбоксами `- [ ]`.

**Цель:** администратор портала или админ сервиса Музыка собирает партию
записей из файлов, ссылок или zip-архива, правит метаданные таблицей и
публикует их в общий каталог от имени портала.

**Архитектура:** две таблицы (`MusicIngestBatch`, `MusicIngestItem`), стадия в
существующем `MusicWorkerService` и раздел `/admin/music/ingest`. Позиция —
накладная на доставку файла; метаданные живут в обычном `MusicTrack` со
статусом `draft`, который правится существующими админ-ручками каталога.
Источники (`upload`, `url`, `zip`) отличаются только первым шагом, дальше идёт
общая дорога: проверка → разбор тегов → черновик → публикация.

**Стек:** NestJS 11, Prisma, S3 (`@aws-sdk/client-s3` + новый
`@aws-sdk/lib-storage`), `music-metadata`, `unzipper`, Next.js 16 App Router.

**Спецификация:** [docs/superpowers/specs/2026-09-04-music-editorial-ingest-design.md](../specs/2026-09-04-music-editorial-ingest-design.md).
Контекст сервиса — [docs/music-service-plan.md](../../music-service-plan.md).

## Глобальные ограничения

- **Контракт сервисного модуля** ([docs/service-module-contract.md](../../service-module-contract.md)):
  модуль `music` импортирует только `AuthModule`, глобальный `PrismaService`,
  типы из `@vedamatch/shared` и `EventEmitter2`. Чужие фичевые модули —
  нельзя, общие хелперы дублируются внутрь папки. Все новые файлы API живут в
  `apps/api/src/modules/music/`.
- **Префикс моделей `Music*`**, новый блок в конце `schema.prisma`. FK — только
  на `User` и на модели своего сервиса.
- **Права:** каждая ручка под `AuthGuard` и `isAdmin(user)` из
  `music/is-admin.ts` (`canAdminService(user, 'music')`). Отказ — 403.
- **Имя наружу** — через `resolveDisplayName()`; в админке осознанно мирское
  `name`, как и в остальной админке.
- **Только токены** из `globals.css`, хардкод `#RRGGBB` запрещён. Контраст
  ≥ 4.5:1 (3:1 для ≥24px), цели ≥ 24×24 CSS-пикселя, фокус не отключать,
  `prefers-reduced-motion` уважать.
- **Сборку API не запускать** (`nest build` перезапишет `dist` под работающим
  `nest start --watch`): типы проверять `npx tsc -p tsconfig.json --noEmit` из
  `apps/api`.
- **Миграции руками:** `pnpm prisma migrate dev --create-only`, прочитать
  сгенерированный SQL и только потом применять. `migrate dev` без
  `--create-only` в этом репозитории предлагает снести базу.
- **Пределы файла те же, что у людей** (`music-upload-validate.ts`): mime
  `audio/mpeg` и `audio/mp4`, ≤ 150 МБ, ≤ 4 часов, ≤ 320 kbps. Меняется одно:
  личная квота не проверяется, вместо неё потолок партии.

## Структура файлов

**Чистая логика (под тестом):**

- `apps/api/src/modules/music/ingest-state.ts` — переходы позиции,
  агрегированный статус партии, что считается зависшим.
- `apps/api/src/modules/music/ingest-url-guard.ts` — можно ли ходить по
  этому адресу: схема, приватные диапазоны, редиректы.
- `apps/api/src/modules/music/ingest-zip-entry.ts` — какие записи архива
  берём.
- `apps/api/src/modules/music/ingest-order.ts` — порядок дорожек.
- Правка `apps/api/src/modules/music/music-upload-validate.ts` —
  редакционная ветка проверки заявки.

**API:**

- `music-ingest.service.ts` — партии и позиции: создание, правка, удаление,
  публикация.
- `music-ingest-fetch.service.ts` — доставка байтов: скачивание по ссылке и
  распаковка архива, потоком в S3.
- `music-ingest-process.service.ts` — общая дорога после доставки: проверка,
  теги, черновой трек.
- `music-ingest.controller.ts` — маршруты `music/admin/ingest/*`.
- Правка `music-worker.service.ts` — быстрый тик приёма.
- Правка `music-storage.service.ts` — ключ редакционного пространства и
  потоковая заливка.
- Правка `music.module.ts` — регистрация трёх сервисов и контроллера.

**Общие типы:** `packages/shared/src/music.ts` — DTO партии и позиции.

**Веб:**

- `apps/web/src/app/admin/music/ingest/page.tsx` — список партий.
- `apps/web/src/app/admin/music/ingest/[id]/page.tsx` — страница партии.
- `apps/web/src/components/music/admin/ingest-batch-list.tsx`
- `apps/web/src/components/music/admin/ingest-batch-form.tsx` — шапка партии.
- `apps/web/src/components/music/admin/ingest-sources.tsx` — три вкладки
  добавления.
- `apps/web/src/components/music/admin/ingest-items-table.tsx` — таблица
  позиций и массовые действия.
- Правка `apps/web/src/components/music/admin/admin-tabs.tsx` — пятая вкладка.
- Правка `apps/web/src/lib/music-api.ts` — клиент новых ручек.

---

## Задача 1: Модель данных и общие типы

**Файлы:**

- Изменить: `apps/api/prisma/schema.prisma` (блок `// ===== Music service =====`)
- Создать: `apps/api/prisma/migrations/20260904120000_music_ingest/migration.sql`
- Изменить: `packages/shared/src/music.ts`

**Отдаёт дальше:** модели `MusicIngestBatch` / `MusicIngestItem`, энумы
`MusicIngestBatchStatus`, `MusicIngestSource`, `MusicIngestItemStatus`; типы
`MusicIngestBatchDto`, `MusicIngestItemDto`, `MusicIngestBatchDetailDto`,
`CreateMusicIngestBatchRequest`, `UpdateMusicIngestBatchRequest`,
`AddMusicIngestFilesRequest`, `AddMusicIngestFilesResponse`,
`AddMusicIngestUrlsRequest`, `PublishMusicIngestBatchRequest`.

- [ ] **Шаг 1: Добавить модели в схему**

В конец блока Музыки в `apps/api/prisma/schema.prisma`:

```prisma
/// Партия редакционного пополнения: пачка записей, которую админ заводит
/// разом. Отдельно от `MusicUpload`, потому что у той жёсткий `uploaderId` и
/// завязка на личную квоту: подмешав редакционное, каждый запрос про квоту и
/// «мои загрузки» обязан был бы помнить «кроме редакционных».
model MusicIngestBatch {
  id          String                 @id @default(uuid())
  title       String
  createdById String?
  createdBy   User?                  @relation("MusicIngestBatches", fields: [createdById], references: [id], onDelete: SetNull)
  status      MusicIngestBatchStatus @default(draft)

  /// Основание прав редакции и строка «откуда взяли»: когда придёт
  /// претензия, отвечать придётся по конкретной записи.
  rightsBasis MusicUploadRightsBasis
  rightsNote  String?

  /// Что применяется к позициям по умолчанию.
  artistId        String?
  artist          MusicArtist? @relation(fields: [artistId], references: [id], onDelete: SetNull)
  albumId         String?
  album           MusicAlbum?  @relation(fields: [albumId], references: [id], onDelete: SetNull)
  categoryIds     String[]
  language        String?
  isLiveRecording Boolean      @default(false)

  items MusicIngestItem[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([status, updatedAt])
}

/// Позиция партии — накладная на доставку одного файла. Метаданные живут в
/// созданном черновом `MusicTrack`, а не здесь: описывать их дважды и писать
/// второй экран правки незачем.
model MusicIngestItem {
  id        String                @id @default(uuid())
  batchId   String
  batch     MusicIngestBatch      @relation(fields: [batchId], references: [id], onDelete: Cascade)
  source    MusicIngestSource
  /// Адрес, имя файла в архиве или имя выбранного файла — то, что показывают
  /// админу в строке таблицы.
  sourceRef String
  position  Int
  status    MusicIngestItemStatus @default(waiting)

  storageKey String?
  /// MD5 содержимого: у `upload` берётся из ETag объекта, у остальных
  /// считается на лету при потоковой записи. Служит только для поиска
  /// дублей.
  checksum   String?

  trackId String?     @unique
  track   MusicTrack? @relation("MusicIngestDraft", fields: [trackId], references: [id], onDelete: SetNull)

  /// На что похожа пропущенная позиция. Отдельным полем, а не через
  /// `trackId`: тот уникален и означает «черновик, созданный этой позицией»,
  /// а дублей одного и того же трека в партии бывает несколько.
  duplicateOfTrackId String?
  duplicateOf        MusicTrack? @relation("MusicIngestDuplicate", fields: [duplicateOfTrackId], references: [id], onDelete: SetNull)

  failureReason String?
  attempts      Int     @default(0)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([status, updatedAt])
  @@index([batchId, position])
  @@index([checksum])
}

enum MusicIngestBatchStatus {
  draft
  running
  ready
  published
  failed
}

enum MusicIngestSource {
  upload
  url
  zip
}

enum MusicIngestItemStatus {
  waiting
  fetching
  stored
  skipped
  failed
}
```

Обратные связи добавить в существующие модели: в `User` — строку
`musicIngestBatches MusicIngestBatch[] @relation("MusicIngestBatches")`; в
`MusicArtist` и `MusicAlbum` — `ingestBatches MusicIngestBatch[]`; в
`MusicTrack` — две обратные связи, потому что ссылок на трек две:
`ingestItem MusicIngestItem? @relation("MusicIngestDraft")` и
`ingestDuplicates MusicIngestItem[] @relation("MusicIngestDuplicate")`.

- [ ] **Шаг 2: Сгенерировать миграцию и прочитать SQL**

```bash
cd apps/api && pnpm prisma migrate dev --name music_ingest --create-only
```

Открыть созданный `migration.sql` и убедиться: только `CREATE TABLE`,
`CREATE TYPE`, `CREATE INDEX` и `ALTER TABLE ... ADD CONSTRAINT`. Ни одного
`DROP TABLE` и ни одного `DROP INDEX` по чужим таблицам. Если они есть —
удалить руками, это следы расхождения схемы с базой, а не часть работы.

- [ ] **Шаг 3: Применить и сгенерировать клиент**

```bash
cd apps/api && pnpm prisma migrate deploy && pnpm prisma generate
```

Ожидается: `1 migration applied`, затем `Generated Prisma Client`.

- [ ] **Шаг 4: Добавить DTO в общие типы**

В конец `packages/shared/src/music.ts`:

```ts
// ===== Редакционное пополнение =====

export type MusicIngestBatchStatus =
  | 'draft'
  | 'running'
  | 'ready'
  | 'published'
  | 'failed';
export type MusicIngestSource = 'upload' | 'url' | 'zip';
export type MusicIngestItemStatus =
  | 'waiting'
  | 'fetching'
  | 'stored'
  | 'skipped'
  | 'failed';

/** Партия в списке: без позиций, но с тем, что решает — объём и статус. */
export interface MusicIngestBatchDto {
  id: string;
  title: string;
  status: MusicIngestBatchStatus;
  itemCount: number;
  storedCount: number;
  failedCount: number;
  /** Сколько байт уже занято позициями этой партии. */
  sizeBytes: number;
  createdByName: string | null;
  createdAt: string;
}

/**
 * Позиция вместе с черновиком, если он уже создан: таблица показывает и
 * доставку, и метаданные, а два запроса ради одной строки не нужны.
 */
export interface MusicIngestItemDto {
  id: string;
  source: MusicIngestSource;
  sourceRef: string;
  position: number;
  status: MusicIngestItemStatus;
  failureReason: string | null;
  track: MusicTrackDto | null;
  /** Заполнен, когда позиция `skipped`: на что именно похоже. */
  duplicateOfTrackId: string | null;
}

export interface MusicIngestBatchDetailDto extends MusicIngestBatchDto {
  rightsBasis: MusicUploadRightsBasis;
  rightsNote: string | null;
  artistId: string | null;
  albumId: string | null;
  categoryIds: string[];
  language: string | null;
  isLiveRecording: boolean;
  quotaBytes: number;
  items: MusicIngestItemDto[];
}

export interface CreateMusicIngestBatchRequest {
  title: string;
  rightsBasis: MusicUploadRightsBasis;
  rightsNote?: string;
}

export interface UpdateMusicIngestBatchRequest {
  title?: string;
  rightsBasis?: MusicUploadRightsBasis;
  rightsNote?: string | null;
  artistId?: string | null;
  albumId?: string | null;
  categoryIds?: string[];
  language?: string | null;
  isLiveRecording?: boolean;
}

/** Заявка на N файлов разом: браузер льёт их параллельно. */
export interface AddMusicIngestFilesRequest {
  files: { fileName: string; mime: string; sizeBytes: number }[];
}

export interface AddMusicIngestFilesResponse {
  items: {
    itemId: string;
    url: string;
    headers: Record<string, string>;
  }[];
}

export interface AddMusicIngestUrlsRequest {
  /** По адресу на строку; пустые строки отбрасываются на сервере. */
  urls: string[];
}

export interface PublishMusicIngestBatchRequest {
  /** Непусто — из партии собирается системная подборка с этим названием. */
  playlistTitle?: string;
}
```

- [ ] **Шаг 5: Собрать типы и проверить**

```bash
pnpm --filter @vedamatch/shared build && cd apps/api && npx tsc -p tsconfig.json --noEmit
```

Ожидается: обе команды без ошибок.

- [ ] **Шаг 6: Коммит**

```bash
git add apps/api/prisma packages/shared/src/music.ts
git commit -m "feat(music): модели редакционного пополнения аудиотеки"
```

---

## Задача 2: Чистая логика состояний

**Файлы:**

- Создать: `apps/api/src/modules/music/ingest-state.ts`
- Тест: `apps/api/src/modules/music/ingest-state.spec.ts`

**Отдаёт дальше:** `batchStatusFor(items)`, `isItemStale(item, now)`,
`INGEST_MAX_ATTEMPTS`, `INGEST_STALE_MS`.

- [ ] **Шаг 1: Написать падающий тест**

```ts
// apps/api/src/modules/music/ingest-state.spec.ts
import {
  INGEST_STALE_MS,
  batchStatusFor,
  isItemStale,
} from './ingest-state';

const at = (minutesAgo: number) =>
  new Date(Date.now() - minutesAgo * 60 * 1000);

describe('batchStatusFor', () => {
  it('пустая партия остаётся черновиком: публиковать нечего', () => {
    expect(batchStatusFor([])).toBe('draft');
  });

  it('пока хоть одна позиция ждёт или качается — партия работает', () => {
    expect(batchStatusFor([{ status: 'stored' }, { status: 'waiting' }])).toBe(
      'running',
    );
    expect(batchStatusFor([{ status: 'fetching' }])).toBe('running');
  });

  it('всё доставлено — партия готова к правке и публикации', () => {
    expect(batchStatusFor([{ status: 'stored' }, { status: 'stored' }])).toBe(
      'ready',
    );
  });

  it('дубли не мешают готовности: пропуск — это нормальный исход', () => {
    expect(batchStatusFor([{ status: 'stored' }, { status: 'skipped' }])).toBe(
      'ready',
    );
  });

  it('часть упала, часть доставлена — партия готова, упавшее повторяют', () => {
    expect(batchStatusFor([{ status: 'stored' }, { status: 'failed' }])).toBe(
      'ready',
    );
  });

  it('упало всё — партия failed: публиковать нечего', () => {
    expect(batchStatusFor([{ status: 'failed' }, { status: 'failed' }])).toBe(
      'failed',
    );
  });

  it('только пропуски — тоже failed: ни одной новой записи не появилось', () => {
    expect(batchStatusFor([{ status: 'skipped' }])).toBe('failed');
  });
});

describe('isItemStale', () => {
  it('качается недолго — не зависла', () => {
    expect(isItemStale({ status: 'fetching', updatedAt: at(5) }, new Date())).toBe(
      false,
    );
  });

  it('качается дольше получаса — зависла, вернуть в очередь', () => {
    expect(isItemStale({ status: 'fetching', updatedAt: at(31) }, new Date())).toBe(
      true,
    );
  });

  it('ждущая позиция не зависает, сколько бы ни ждала', () => {
    // `waiting` не занята процессом: её просто ещё не взяли в работу.
    expect(isItemStale({ status: 'waiting', updatedAt: at(600) }, new Date())).toBe(
      false,
    );
  });

  it('порог ровно на границе считается зависанием', () => {
    const now = new Date();
    const updatedAt = new Date(now.getTime() - INGEST_STALE_MS);
    expect(isItemStale({ status: 'fetching', updatedAt }, now)).toBe(true);
  });
});
```

- [ ] **Шаг 2: Убедиться, что тест падает**

Выполнить: `pnpm --filter @vedamatch/api test -- ingest-state`
Ожидается: FAIL, «Cannot find module './ingest-state'».

- [ ] **Шаг 3: Реализовать**

```ts
// apps/api/src/modules/music/ingest-state.ts
import type { MusicIngestBatchStatus, MusicIngestItemStatus } from '@vedamatch/shared';

/**
 * Состояние партии и её позиций.
 *
 * Чистыми функциями, а не методами сервиса: правила «когда партия готова» и
 * «когда позиция зависла» — единственное здесь, что можно испортить незаметно,
 * и проверять их базой незачем.
 */

/** Три попытки, потом позиция признаётся упавшей и ждёт решения человека. */
export const INGEST_MAX_ATTEMPTS = 3;

/**
 * Полчаса — не норматив скачивания, а признак того, что процесс, взявший
 * позицию, до неё уже не вернётся: перезапуск деплоя, падение, обрыв.
 * Файл в 150 МБ по медленному каналу в этот срок укладывается.
 */
export const INGEST_STALE_MS = 30 * 60 * 1000;

export interface IngestItemState {
  status: MusicIngestItemStatus;
}

/**
 * Статус партии по её позициям.
 *
 * `ready` — доставлено хоть что-то и никто больше не в работе: дальше
 * человек правит метаданные и публикует. `failed` — работа кончилась, но не
 * появилось ни одной новой записи; пропуск дублей сюда тоже попадает, потому
 * что публиковать в такой партии нечего.
 */
export function batchStatusFor(
  items: readonly IngestItemState[],
): MusicIngestBatchStatus {
  if (items.length === 0) return 'draft';
  if (items.some((item) => item.status === 'waiting' || item.status === 'fetching'))
    return 'running';
  if (items.some((item) => item.status === 'stored')) return 'ready';
  return 'failed';
}

export interface IngestStaleCheck {
  status: MusicIngestItemStatus;
  updatedAt: Date;
}

/**
 * Позиция, взятая в работу и с тех пор молчащая. Только `fetching`:
 * `waiting` никем не занята, и «зависнуть» ей не в чем.
 */
export function isItemStale(item: IngestStaleCheck, now: Date): boolean {
  if (item.status !== 'fetching') return false;
  return now.getTime() - item.updatedAt.getTime() >= INGEST_STALE_MS;
}
```

- [ ] **Шаг 4: Тесты зелёные**

Выполнить: `pnpm --filter @vedamatch/api test -- ingest-state`
Ожидается: PASS, 11 тестов.

- [ ] **Шаг 5: Коммит**

```bash
git add apps/api/src/modules/music/ingest-state.ts apps/api/src/modules/music/ingest-state.spec.ts
git commit -m "feat(music): состояния партии редакционного пополнения"
```

---

## Задача 3: Редакционная ветка проверки

**Файлы:**

- Изменить: `apps/api/src/modules/music/music-upload-validate.ts`
- Тест: `apps/api/src/modules/music/music-upload-validate.spec.ts` (дописать)

**Потребляет:** ничего из предыдущих задач.
**Отдаёт дальше:** `validateMusicIngestRequest(facts, limits)` с фактами
`{ mime, sizeBytes, batchUsedBytes }` и новую причину отказа
`batch_quota_exceeded`; `MUSIC_INGEST_DEFAULT_BATCH_QUOTA_BYTES`.

- [ ] **Шаг 1: Написать падающий тест**

Дописать в конец `music-upload-validate.spec.ts`:

```ts
import {
  MUSIC_INGEST_DEFAULT_BATCH_QUOTA_BYTES,
  validateMusicIngestRequest,
} from './music-upload-validate';

describe('validateMusicIngestRequest', () => {
  const facts = {
    mime: 'audio/mpeg',
    sizeBytes: 10 * 1024 * 1024,
    batchUsedBytes: 0,
  };

  it('пропускает обычный файл', () => {
    expect(validateMusicIngestRequest(facts)).toBeNull();
  });

  it('не спрашивает основание прав у позиции: оно задано на партии', () => {
    // У личной загрузки это поле обязательно; у редакционной оно одно на всю
    // партию, и требовать его с каждой дорожки бессмысленно.
    expect(validateMusicIngestRequest({ ...facts })).toBeNull();
  });

  it('держит те же пределы по типу и размеру, что и личная загрузка', () => {
    expect(validateMusicIngestRequest({ ...facts, mime: 'audio/flac' })).toBe(
      'mime_not_accepted',
    );
    expect(
      validateMusicIngestRequest({ ...facts, sizeBytes: 200 * 1024 * 1024 }),
    ).toBe('file_too_large');
    expect(validateMusicIngestRequest({ ...facts, sizeBytes: 0 })).toBe(
      'file_empty',
    );
  });

  it('считает потолок партии, а не личную квоту', () => {
    expect(
      validateMusicIngestRequest({
        ...facts,
        batchUsedBytes: MUSIC_INGEST_DEFAULT_BATCH_QUOTA_BYTES,
      }),
    ).toBe('batch_quota_exceeded');
  });

  it('пускает файл, ровно укладывающийся в остаток партии', () => {
    expect(
      validateMusicIngestRequest({
        ...facts,
        batchUsedBytes: MUSIC_INGEST_DEFAULT_BATCH_QUOTA_BYTES - facts.sizeBytes,
      }),
    ).toBeNull();
  });
});
```

- [ ] **Шаг 2: Убедиться, что тест падает**

Выполнить: `pnpm --filter @vedamatch/api test -- music-upload-validate`
Ожидается: FAIL, «validateMusicIngestRequest is not a function».

- [ ] **Шаг 3: Реализовать**

В `music-upload-validate.ts` добавить причину `batch_quota_exceeded` в
`MusicUploadRejection` и строку к `MUSIC_UPLOAD_REJECTION_TEXT`:

```ts
    batch_quota_exceeded:
      'Партия упёрлась в потолок объёма. Опубликуйте её и заведите следующую.',
```

И новую проверку в конец файла:

```ts
/**
 * Потолок объёма одной партии.
 *
 * Двадцать гигабайт — это примерно полторы сотни часовых записей: хватает на
 * большой архив за раз, но не даёт одной опечаткой в списке ссылок вылить в
 * бакет всё, что лежало на той стороне. Значение переопределяется
 * `MUSIC_INGEST_BATCH_QUOTA_BYTES`.
 */
export const MUSIC_INGEST_DEFAULT_BATCH_QUOTA_BYTES = 20 * 1024 * 1024 * 1024;

export interface MusicIngestRequestFacts {
  mime: string;
  sizeBytes: number;
  /** Сколько байт уже занято позициями этой партии. */
  batchUsedBytes: number;
}

export interface MusicIngestLimits extends MusicUploadLimits {
  batchQuotaBytes: number;
}

export const MUSIC_INGEST_DEFAULT_LIMITS: MusicIngestLimits = {
  ...MUSIC_UPLOAD_DEFAULT_LIMITS,
  batchQuotaBytes: MUSIC_INGEST_DEFAULT_BATCH_QUOTA_BYTES,
};

/**
 * Проверка редакционной позиции — до того, как байты пошли в бакет.
 *
 * От личной отличается ровно двумя вещами: основание прав не спрашивается
 * (оно одно на партию), а вместо квоты аккаунта считается потолок партии.
 * Остальные пределы общие, поэтому переиспользуются, а не переписываются.
 */
export function validateMusicIngestRequest(
  facts: MusicIngestRequestFacts,
  limits: MusicIngestLimits = MUSIC_INGEST_DEFAULT_LIMITS,
): MusicUploadRejection | null {
  const mime = facts.mime?.split(';')[0]?.trim().toLowerCase() ?? '';
  if (!ACCEPTED.has(mime)) return 'mime_not_accepted';

  if (!Number.isFinite(facts.sizeBytes) || facts.sizeBytes <= 0) {
    return 'file_empty';
  }
  if (facts.sizeBytes > limits.maxBytes) return 'file_too_large';

  if (facts.batchUsedBytes + facts.sizeBytes > limits.batchQuotaBytes) {
    return 'batch_quota_exceeded';
  }

  return null;
}
```

- [ ] **Шаг 4: Тесты зелёные**

Выполнить: `pnpm --filter @vedamatch/api test -- music-upload-validate`
Ожидается: PASS, включая пять новых тестов.

- [ ] **Шаг 5: Коммит**

```bash
git add apps/api/src/modules/music/music-upload-validate.ts apps/api/src/modules/music/music-upload-validate.spec.ts
git commit -m "feat(music): проверка редакционной позиции с потолком партии"
```

---

## Задача 4: Партия и источник `upload`

**Файлы:**

- Создать: `apps/api/src/modules/music/music-ingest.service.ts`
- Создать: `apps/api/src/modules/music/music-ingest.controller.ts`
- Тест: `apps/api/src/modules/music/music-ingest.service.spec.ts`
- Изменить: `apps/api/src/modules/music/music-storage.service.ts`
- Изменить: `apps/api/src/modules/music/music.module.ts`

**Потребляет:** `batchStatusFor` из задачи 2,
`validateMusicIngestRequest` и `MUSIC_INGEST_DEFAULT_LIMITS` из задачи 3.
**Отдаёт дальше:** `MusicIngestService` с методами `list(user)`, `create(user, body)`,
`detail(user, id)`, `update(user, id, body)`, `remove(user, id)`,
`addFiles(user, id, body)`, `completeFile(user, id, itemId)`,
`addUrls(user, id, body)`, `retryFailed(user, id)`, `publish(user, id, body)`,
`removeItem(user, id, itemId)`; метод хранилища
`buildIngestKey(batchId, extension): string`.

- [ ] **Шаг 1: Написать падающий тест**

```ts
// apps/api/src/modules/music/music-ingest.service.spec.ts
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { AccessTokenPayload } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { MusicIngestService } from './music-ingest.service';

const admin: AccessTokenPayload = {
  sub: 'admin-1',
  email: 'admin@example.com',
  role: 'admin',
};
const musicAdmin: AccessTokenPayload = {
  sub: 'sa-1',
  email: 'sa@example.com',
  role: 'service-admin',
  adminServices: ['music'],
};
const otherAdmin: AccessTokenPayload = {
  sub: 'sa-2',
  email: 'sa2@example.com',
  role: 'service-admin',
  adminServices: ['market'],
};

function build() {
  const prisma = {
    musicIngestBatch: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      create: jest.fn().mockResolvedValue({ id: 'b1' }),
      update: jest.fn().mockResolvedValue({ id: 'b1' }),
      delete: jest.fn().mockResolvedValue({}),
    },
    musicIngestItem: {
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    musicTrack: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      aggregate: jest.fn().mockResolvedValue({ _sum: { sizeBytes: 0 } }),
    },
    $transaction: jest.fn(async (fn: unknown) =>
      typeof fn === 'function' ? (fn as (tx: unknown) => unknown)(prisma) : null,
    ),
  };
  const storage = {
    configured: true,
    buildIngestKey: jest.fn(() => 'music/portal/b1/x.mp3'),
    presignPut: jest.fn().mockResolvedValue('https://s3/put'),
    remove: jest.fn().mockResolvedValue(undefined),
  };
  return {
    prisma,
    storage,
    service: new MusicIngestService(
      prisma as unknown as PrismaService,
      storage as never,
      { get: () => undefined } as never,
    ),
  };
}

describe('MusicIngestService: права', () => {
  it('пускает админа портала и админа сервиса', async () => {
    const { service } = build();
    await expect(service.list(admin)).resolves.toEqual([]);
    await expect(service.list(musicAdmin)).resolves.toEqual([]);
  });

  it('не пускает админа чужого сервиса', async () => {
    const { service, prisma } = build();
    await expect(service.list(otherAdmin)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.musicIngestBatch.findMany).not.toHaveBeenCalled();
  });
});

describe('MusicIngestService.addFiles', () => {
  it('заводит позиции и выдаёт подписанные ссылки', async () => {
    const { service, prisma, storage } = build();
    prisma.musicIngestBatch.findUnique.mockResolvedValue({
      id: 'b1',
      status: 'draft',
      items: [],
    });
    prisma.musicIngestItem.create.mockResolvedValue({ id: 'i1' });

    const result = await service.addFiles(admin, 'b1', {
      files: [{ fileName: 'kirtan.mp3', mime: 'audio/mpeg', sizeBytes: 1024 }],
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ itemId: 'i1', url: 'https://s3/put' });
    // Заголовки обязаны совпасть с подписью — иначе S3 ответит 403.
    expect(result.items[0].headers['Content-Length']).toBe('1024');
    expect(storage.buildIngestKey).toHaveBeenCalledWith('b1', 'mp3');
  });

  it('отказывает по типу файла и позицию не заводит', async () => {
    const { service, prisma } = build();
    prisma.musicIngestBatch.findUnique.mockResolvedValue({
      id: 'b1',
      status: 'draft',
      items: [],
    });

    await expect(
      service.addFiles(admin, 'b1', {
        files: [{ fileName: 'x.flac', mime: 'audio/flac', sizeBytes: 1024 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.musicIngestItem.create).not.toHaveBeenCalled();
  });

  it('в опубликованную партию дозаливать нельзя', async () => {
    const { service, prisma } = build();
    prisma.musicIngestBatch.findUnique.mockResolvedValue({
      id: 'b1',
      status: 'published',
      items: [],
    });

    await expect(
      service.addFiles(admin, 'b1', {
        files: [{ fileName: 'a.mp3', mime: 'audio/mpeg', sizeBytes: 10 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('MusicIngestService.publish', () => {
  it('публикует черновики партии и переводит её в published', async () => {
    const { service, prisma } = build();
    prisma.musicIngestBatch.findUnique.mockResolvedValue({
      id: 'b1',
      status: 'ready',
      items: [{ id: 'i1', status: 'stored', trackId: 't1' }],
    });

    await service.publish(admin, 'b1', {});

    expect(prisma.musicTrack.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['t1'] }, status: 'draft' },
        data: expect.objectContaining({ status: 'published' }),
      }),
    );
    expect(prisma.musicIngestBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'published' }) }),
    );
  });

  it('партию без единой доставленной позиции публиковать нечем', async () => {
    const { service, prisma } = build();
    prisma.musicIngestBatch.findUnique.mockResolvedValue({
      id: 'b1',
      status: 'failed',
      items: [{ id: 'i1', status: 'failed', trackId: null }],
    });

    await expect(service.publish(admin, 'b1', {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.musicTrack.updateMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Шаг 2: Убедиться, что тест падает**

Выполнить: `pnpm --filter @vedamatch/api test -- music-ingest.service`
Ожидается: FAIL, «Cannot find module './music-ingest.service'».

- [ ] **Шаг 3: Добавить редакционный ключ в хранилище**

В `music-storage.service.ts` рядом с `buildKey`:

```ts
  /**
   * Ключ редакционного объекта. Партия в пути, а не человек: по префиксу
   * видно, что запись портальная, и уборка партии удаляет ровно своё.
   */
  buildIngestKey(batchId: string, extension: string): string {
    const safe = extension.replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'mp3';
    return `music/portal/${batchId}/${crypto.randomUUID()}.${safe}`;
  }
```

- [ ] **Шаг 4: Реализовать сервис**

Создать `music-ingest.service.ts`. Каркас с ключевыми решениями (остальные
методы — по тому же образцу):

```ts
// apps/api/src/modules/music/music-ingest.service.ts
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  AccessTokenPayload,
  AddMusicIngestFilesRequest,
  AddMusicIngestFilesResponse,
  AddMusicIngestUrlsRequest,
  CreateMusicIngestBatchRequest,
  MusicIngestBatchDetailDto,
  MusicIngestBatchDto,
  PublishMusicIngestBatchRequest,
  UpdateMusicIngestBatchRequest,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { isAdmin } from './is-admin';
import { MusicStorageService } from './music-storage.service';
import {
  MUSIC_INGEST_DEFAULT_LIMITS,
  MUSIC_UPLOAD_REJECTION_TEXT,
  validateMusicIngestRequest,
  type MusicIngestLimits,
} from './music-upload-validate';

const EXTENSION_BY_MIME: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
};

/**
 * Партии редакционного пополнения.
 *
 * Сервис отвечает за учёт: завести партию, принять позиции, отдать
 * подписанные ссылки, опубликовать. Доставку байтов делает
 * `MusicIngestFetchService`, разбор и создание черновика —
 * `MusicIngestProcessService`: складывать всё в один класс значит получить
 * файл, который не держится в голове целиком.
 */
@Injectable()
export class MusicIngestService {
  private readonly limits: MusicIngestLimits;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: MusicStorageService,
    config: ConfigService,
  ) {
    const quota = Number(config.get<string>('MUSIC_INGEST_BATCH_QUOTA_BYTES'));
    this.limits = {
      ...MUSIC_INGEST_DEFAULT_LIMITS,
      batchQuotaBytes:
        Number.isFinite(quota) && quota > 0
          ? quota
          : MUSIC_INGEST_DEFAULT_LIMITS.batchQuotaBytes,
    };
  }

  /** 403 отдаёт guard прав, а не «не найдено»: раздел существует. */
  private assertAdmin(user: AccessTokenPayload): void {
    if (!isAdmin(user)) throw new ForbiddenException('Недостаточно прав');
  }

  async addFiles(
    user: AccessTokenPayload,
    batchId: string,
    body: AddMusicIngestFilesRequest,
  ): Promise<AddMusicIngestFilesResponse> {
    this.assertAdmin(user);
    if (!this.storage.configured) {
      throw new ServiceUnavailableException(
        'Хранилище не настроено — загрузка недоступна',
      );
    }
    const batch = await this.requireOpenBatch(batchId);
    let used = await this.batchUsedBytes(batchId);
    const items: AddMusicIngestFilesResponse['items'] = [];
    let position = batch.items.length;

    for (const file of body.files ?? []) {
      const mime = file.mime?.split(';')[0]?.trim().toLowerCase() ?? '';
      const rejection = validateMusicIngestRequest(
        { mime, sizeBytes: file.sizeBytes, batchUsedBytes: used },
        this.limits,
      );
      if (rejection) {
        throw new BadRequestException(
          `${file.fileName}: ${MUSIC_UPLOAD_REJECTION_TEXT[rejection]}`,
        );
      }

      const key = this.storage.buildIngestKey(
        batchId,
        EXTENSION_BY_MIME[mime] ?? 'mp3',
      );
      const url = await this.storage.presignPut(key, mime, file.sizeBytes);
      if (!url) {
        throw new ServiceUnavailableException('Не удалось подготовить загрузку');
      }

      const item = await this.prisma.musicIngestItem.create({
        data: {
          batchId,
          source: 'upload',
          sourceRef: file.fileName.slice(0, 200),
          position: position++,
          status: 'waiting',
          storageKey: key,
        },
      });
      used += file.sizeBytes;
      items.push({
        itemId: item.id,
        url,
        // Ровно те заголовки, что вошли в подпись: разойдутся — S3 ответит
        // 403, и разбираться в этом по логам браузера крайне неприятно.
        headers: { 'Content-Type': mime, 'Content-Length': String(file.sizeBytes) },
      });
    }

    return { items };
  }

  /**
   * Партия, в которую ещё можно добавлять. Опубликованную не трогаем: её
   * записи уже в каталоге, и дозаливка в неё означала бы вторую публикацию
   * задним числом.
   */
  private async requireOpenBatch(batchId: string) {
    const batch = await this.prisma.musicIngestBatch.findUnique({
      where: { id: batchId },
      include: { items: { orderBy: { position: 'asc' } } },
    });
    if (!batch) throw new NotFoundException('Партия не найдена');
    if (batch.status === 'published') {
      throw new BadRequestException('Партия уже опубликована');
    }
    return batch;
  }
}
```

Остальные методы того же класса:

- `list(user)` — партии с агрегатами (`itemCount`, `storedCount`,
  `failedCount`, `sizeBytes` через `musicTrack.aggregate({ where: { ingestItem:
  { batchId } }, _sum: { sizeBytes: true } })` — своего размера у позиции нет,
  байты живут у трека),
  `orderBy: { createdAt: 'desc' }`, `take: 100`.
- `create(user, body)` — `title` обязателен и обрезается до 200 символов,
  `rightsBasis` обязателен; статус `draft`, `createdById: user.sub`.
- `detail(user, id)` — партия с позициями, треками и `quotaBytes`.
- `update(user, id, body)` — только переданные поля; `categoryIds`
  проверяются на существование одним `findMany`, неизвестные отбрасываются.
- `completeFile(user, batchId, itemId)` — ставит позиции `waiting` и дёргает
  обработку (задача 5).
- `addUrls(user, id, body)` — заводит позиции `source: 'url'`, `sourceRef` —
  адрес, пустые строки и дубли адресов внутри партии отбрасываются.
- `retryFailed(user, id)` — `updateMany` по `failed` → `waiting`,
  `attempts: 0`, `failureReason: null`.
- `publish(user, id, body)` — в транзакции переводит черновики позиций
  `stored` в `published` с `publishedAt: new Date()` и ставит партии
  `published`; при пустом списке треков — `BadRequestException('В партии нет
  ни одной доставленной записи')`.
- `remove(user, id)` — удаляет черновые треки партии и их объекты в бакете,
  затем саму партию (позиции уходят каскадом). Опубликованные треки не
  трогаются: они уже часть каталога.
- `removeItem(user, id, itemId)` — убирает одну позицию: её объект в бакете и
  черновой трек, если он успел появиться. Позицию опубликованной партии
  удалять нельзя — `BadRequestException`.

- [ ] **Шаг 5: Реализовать контроллер**

```ts
// apps/api/src/modules/music/music-ingest.controller.ts
import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import type {
  AccessTokenPayload,
  AddMusicIngestFilesRequest,
  AddMusicIngestUrlsRequest,
  CreateMusicIngestBatchRequest,
  PublishMusicIngestBatchRequest,
  UpdateMusicIngestBatchRequest,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { MusicIngestService } from './music-ingest.service';

/**
 * Редакционное пополнение. Префикс — слаг сервиса, как у остальных
 * админ-ручек Музыки: единственная точка касания портала у модуля — строка в
 * `app.module.ts`.
 */
@Controller('music/admin/ingest')
@UseGuards(AuthGuard)
export class MusicIngestController {
  constructor(private readonly ingest: MusicIngestService) {}

  @Get()
  list(@CurrentUser() user: AccessTokenPayload) {
    return this.ingest.list(user);
  }

  @Post()
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: CreateMusicIngestBatchRequest,
  ) {
    return this.ingest.create(user, body);
  }

  @Get(':id')
  detail(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.ingest.detail(user, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: UpdateMusicIngestBatchRequest,
  ) {
    return this.ingest.update(user, id, body);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.ingest.remove(user, id);
  }

  @Post(':id/files')
  addFiles(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: AddMusicIngestFilesRequest,
  ) {
    return this.ingest.addFiles(user, id, body);
  }

  @Post(':id/files/:itemId/complete')
  completeFile(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ) {
    return this.ingest.completeFile(user, id, itemId);
  }

  @Post(':id/urls')
  addUrls(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: AddMusicIngestUrlsRequest,
  ) {
    return this.ingest.addUrls(user, id, body);
  }

  @Post(':id/retry')
  retry(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.ingest.retryFailed(user, id);
  }

  @Post(':id/publish')
  publish(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: PublishMusicIngestBatchRequest,
  ) {
    return this.ingest.publish(user, id, body);
  }

  @Delete(':id/items/:itemId')
  removeItem(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ) {
    return this.ingest.removeItem(user, id, itemId);
  }
}
```

- [ ] **Шаг 6: Зарегистрировать в модуле**

В `music.module.ts` добавить `MusicIngestController` в `controllers` и
`MusicIngestService` в `providers`.

- [ ] **Шаг 7: Тесты и типы**

```bash
pnpm --filter @vedamatch/api test -- music-ingest.service && cd apps/api && npx tsc -p tsconfig.json --noEmit
```

Ожидается: PASS восьми тестов, типы без ошибок.

- [ ] **Шаг 8: Коммит**

```bash
git add apps/api/src/modules/music
git commit -m "feat(music): партии редакционного пополнения и заливка файлами"
```

---

## Задача 5: Стадия приёма в воркере

**Файлы:**

- Создать: `apps/api/src/modules/music/music-ingest-process.service.ts`
- Изменить: `apps/api/src/modules/music/music-worker.service.ts`
- Изменить: `apps/api/src/modules/music/music.module.ts`

**Потребляет:** `batchStatusFor`, `isItemStale`, `INGEST_MAX_ATTEMPTS`,
`INGEST_STALE_MS` из задачи 2; `MusicIngestService` из задачи 4.
**Отдаёт дальше:** `MusicIngestProcessService.processOnce(): Promise<number>`
(сколько позиций обработано) и `MusicIngestProcessService.reviveStale():
Promise<number>` (сколько зависших возвращено в очередь).

- [ ] **Шаг 1: Реализовать обработку**

`music-ingest-process.service.ts` делает общую дорогу для всех источников:

1. Клеймит до трёх позиций: `updateMany({ where: { status: 'waiting', id: { in } }, data: { status: 'fetching', attempts: { increment: 1 } } })` — берутся только те, что вернул `updateMany` с `count > 0`.
2. Для `source: 'upload'` файл уже в бакете: `storage.head(storageKey)` даёт размер и ETag. Для `url` и `zip` зовётся `MusicIngestFetchService` (задачи 8 и 10), который возвращает `{ sizeBytes, checksum, storageKey }`.
3. `storage.readPrefix(storageKey)` → `metadata.read(...)` → `normalizeAudioMetadata` → `resolveDurationSeconds` — ровно как в `music-uploads.service.ts:completeUpload`. Длительность обязательно считается своим `resolveDurationSeconds`: пакет молча возвращает длительность прочитанного префикса, а не файла.
4. Дубль: `musicTrack.findFirst({ where: { ingestItem: { checksum } } })` плюс поиск по `musicUpload.checksum`. Нашли — позиция `skipped`, `duplicateOfTrackId` найденного трека, `failureReason: 'Уже есть в каталоге'`, объект удаляется из бакета: место он занимает, а нужен уже никому.
5. `validateMusicUploadCompletion` — те же пределы, что у людей.
6. Успех: в транзакции создаётся `MusicTrack` со `status: 'draft'`, `uploadedById: null`, названием из тегов (`fallbackTrackTitle`), значениями партии по умолчанию (`artistId`, `albumId`, `language`, `isLiveRecording`), категориями через `musicTrackCategory.createMany`, встроенной обложкой; позиция получает `status: 'stored'`, `trackId`, `checksum`.
7. Неудача: `attempts >= INGEST_MAX_ATTEMPTS` → `failed` с причиной словами, иначе обратно в `waiting`.
8. В конце — пересчёт статуса партии через `batchStatusFor`.

- [ ] **Шаг 2: Добавить быстрый тик в воркер**

В `music-worker.service.ts` рядом с существующим `TICK_MS`:

```ts
/**
 * Приём смотрят глазами: админ нажал «Запустить» и ждёт. Десятиминутный тик
 * уборки для этого не годится, поэтому у приёма свой — пятнадцать секунд.
 * Он дешёвый: сначала `count` по индексу `(status, updatedAt)`, и при пустой
 * очереди стадия сразу выходит.
 */
const INGEST_TICK_MS = 15 * 1000;
```

Второй таймер в `onModuleInit` (с `unref()`), свой флаг `ingestRunning`,
внутри — `reviveStale()` и `processOnce()`. Оба таймера гасятся в
`onModuleDestroy`.

- [ ] **Шаг 3: Дёргать стадию сразу после запуска партии**

В `MusicIngestService.completeFile` и `addUrls` после сохранения позиций
вызвать `void this.process.processOnce()` — не дожидаясь тика. Ошибку глушить
логом: очередь всё равно доберёт позицию следующим тиком.

Добавить недостающий маршрут `POST music/admin/ingest/:id/start` (в §7 спеки
он есть, в контроллер задачи 4 не попал) и метод `start(user, id)`: он
возвращает в `waiting` всё, что осталось в `failed` и `waiting`, и зовёт
`processOnce()`. Кнопка «Запустить» в админке ходит именно сюда — без неё
партия, собранная из ссылок и брошенная до перезапуска API, оживает только
следующим тиком.

- [ ] **Шаг 4: Проверить руками**

Поднять API и веб через preview, завести партию запросом и залить mp3.
Проверить в базе:

```bash
docker exec vedamatchnew-postgres-1 psql -U vedamatch -d vedamatch -c "select status, count(*) from \"MusicIngestItem\" group by status;" -c "select id, title, status, \"uploadedById\" from \"MusicTrack\" where status='draft';"
```

Ожидается: позиция `stored`, черновой трек с `uploadedById = null`.

- [ ] **Шаг 5: Коммит**

```bash
git add apps/api/src/modules/music
git commit -m "feat(music): стадия приёма редакционных позиций"
```

---

## Задача 6: Админка — список партий и страница партии

**Файлы:**

- Создать: `apps/web/src/app/admin/music/ingest/page.tsx`
- Создать: `apps/web/src/app/admin/music/ingest/[id]/page.tsx`
- Создать: `apps/web/src/components/music/admin/ingest-batch-list.tsx`
- Создать: `apps/web/src/components/music/admin/ingest-batch-form.tsx`
- Создать: `apps/web/src/components/music/admin/ingest-sources.tsx`
- Создать: `apps/web/src/components/music/admin/ingest-items-table.tsx`
- Изменить: `apps/web/src/components/music/admin/admin-tabs.tsx`
- Изменить: `apps/web/src/lib/music-api.ts`
- Тест: `apps/web/src/components/music/admin/ingest-items-table.spec.tsx`

**Потребляет:** DTO из задачи 1, ручки из задачи 4.

- [ ] **Шаг 1: Пятая вкладка**

В `admin-tabs.tsx` расширить тип `active` значением `"ingest"` и добавить в
массив `tabs` первым элементом:

```ts
    { key: "ingest" as const, href: "/admin/music/ingest", label: "Пополнение" },
```

Вкладка идёт первой: пополнение — то, ради чего в этот раздел заходят
ежедневно, а очередь и жалобы разбирают по мере появления.

- [ ] **Шаг 2: Клиент API**

Формы ответов ручек, отличных от `GET` (заданы задачей 4, отдельных DTO под
них нет): `completeFile`, `remove`, `removeItem` → `{ ok: true }`;
`start` → `{ queued: number }`; `addUrls` → `{ added: number }`;
`retryFailed` → `{ retried: number }`; `publish` → `{ published: number }`.
`addFiles` отдаёт `AddMusicIngestFilesResponse`, `create` и `update` —
`MusicIngestBatchDto`, `detail` — `MusicIngestBatchDetailDto`.

Клиент разнесён по конвенции репозитория, а не сложен в `music-api.ts`: тот
серверный (`next/headers`) и из клиентского компонента не импортируется.
Чтение — в `apps/web/src/lib/music-admin-api.ts`, изменения — в
`apps/web/src/lib/music-admin-client-api.ts`. Добавить функции:
`getIngestBatches`, `createIngestBatch`, `getIngestBatch`, `updateIngestBatch`,
`deleteIngestBatch`, `addIngestFiles`, `completeIngestFile`, `addIngestUrls`,
`retryIngest`, `publishIngestBatch`, `deleteIngestItem` — по образцу
существующих админ-функций файла.

- [ ] **Шаг 3: Написать падающий тест таблицы**

```tsx
// apps/web/src/components/music/admin/ingest-items-table.spec.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { MusicIngestItemDto } from "@vedamatch/shared";
import { IngestItemsTable } from "./ingest-items-table";

const item = (over: Partial<MusicIngestItemDto> = {}): MusicIngestItemDto => ({
  id: "i1",
  source: "upload",
  sourceRef: "kirtan.mp3",
  position: 0,
  status: "stored",
  failureReason: null,
  duplicateOfTrackId: null,
  track: null,
  ...over,
});

describe("IngestItemsTable", () => {
  it("показывает причину падения словами, а не кодом", () => {
    render(
      <IngestItemsTable
        items={[item({ status: "failed", failureReason: "сервер ответил 403" })]}
        onApplyToSelected={vi.fn()}
      />,
    );

    expect(screen.getByText(/сервер ответил 403/)).toBeInTheDocument();
  });

  it("дубль показывает ссылкой на существующую запись, а не ошибкой", () => {
    render(
      <IngestItemsTable
        items={[item({ status: "skipped", duplicateOfTrackId: "t9" })]}
        onApplyToSelected={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("link", { name: /уже есть в каталоге/i }),
    ).toHaveAttribute("href", "/music/tracks/t9");
  });

  it("массовое действие получает только отмеченные строки", async () => {
    const onApply = vi.fn();
    const user = userEvent.setup();
    render(
      <IngestItemsTable
        items={[item({ id: "a" }), item({ id: "b" })]}
        onApplyToSelected={onApply}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: /kirtan.mp3/ }));
    await user.click(screen.getByRole("button", { name: /Применить к отмеченным/ }));

    expect(onApply).toHaveBeenCalledWith(["a"]);
  });
});
```

- [ ] **Шаг 4: Убедиться, что тест падает**

Выполнить: `pnpm --filter @vedamatch/web exec vitest run src/components/music/admin/ingest-items-table.spec.tsx`
Ожидается: FAIL, «Failed to resolve import ./ingest-items-table».

- [ ] **Шаг 5: Реализовать компоненты**

- `IngestBatchList` — карточки партий: название, статус, число позиций,
  объём (`formatBytes`), кто и когда завёл. Кнопка «Новая партия» открывает
  форму с названием и основанием прав.
- `IngestBatchForm` — шапка партии: исполнитель и альбом выбором из
  справочников, категории чипами, язык, «запись с программы», основание прав,
  строка «откуда взяли». Сохраняется `PATCH`-ом по blur, без кнопки «ОК».
- `IngestSources` — три вкладки: «Файлы» (`<input type="file" multiple accept="audio/mpeg,audio/mp4">`, заливка по три штуки разом с прогрессом), «Ссылки» (textarea, по адресу на строку), «Архив» (один `.zip`).
- `IngestItemsTable` — строка на позицию: чекбокс с `aria-label` из
  `sourceRef`, статус, причина падения словами, поля названия/исполнителя/
  альбома для доставленных; над таблицей — «Применить к отмеченным».

Статусы показывать словами, а не цветом: «ждёт», «качается», «готово»,
«пропущено», «ошибка» — цвет дублирует, но не заменяет текст.

- [ ] **Шаг 6: Тесты зелёные**

Выполнить: `pnpm --filter @vedamatch/web exec vitest run src/components/music/admin/ingest-items-table.spec.tsx`
Ожидается: PASS, 3 теста.

- [ ] **Шаг 7: Проверить в браузере**

Открыть `/admin/music/ingest`, завести партию, залить два mp3, дождаться
статуса «готово», поправить названия, нажать «Опубликовать всё». Проверить,
что записи появились на `/music` в секции «Новое в каталоге».

- [ ] **Шаг 8: Коммит**

```bash
git add apps/web/src
git commit -m "feat(music): раздел «Пополнение» в админке Музыки"
```

---

## Задача 7: Проверка адреса перед скачиванием

**Файлы:**

- Создать: `apps/api/src/modules/music/ingest-url-guard.ts`
- Тест: `apps/api/src/modules/music/ingest-url-guard.spec.ts`

**Отдаёт дальше:** `checkIngestUrl(raw): IngestUrlRejection | null`,
`isPrivateAddress(ip): boolean`, `INGEST_MAX_REDIRECTS`.

- [ ] **Шаг 1: Написать падающий тест**

```ts
// apps/api/src/modules/music/ingest-url-guard.spec.ts
import { checkIngestUrl, isPrivateAddress } from './ingest-url-guard';

describe('checkIngestUrl', () => {
  it('пропускает обычный https-адрес', () => {
    expect(checkIngestUrl('https://archive.example/kirtan.mp3')).toBeNull();
  });

  it('отбивает не http-схемы', () => {
    expect(checkIngestUrl('file:///etc/passwd')).toBe('scheme_not_allowed');
    expect(checkIngestUrl('ftp://example.org/a.mp3')).toBe('scheme_not_allowed');
    // `data:` целиком помещается в строку и обходит все проверки размера.
    expect(checkIngestUrl('data:audio/mpeg;base64,AAAA')).toBe('scheme_not_allowed');
  });

  it('отбивает литеральные адреса внутренней сети', () => {
    expect(checkIngestUrl('http://127.0.0.1:5432/')).toBe('private_address');
    expect(checkIngestUrl('http://10.0.0.5/a.mp3')).toBe('private_address');
    expect(checkIngestUrl('http://169.254.169.254/latest/meta-data/')).toBe(
      'private_address',
    );
    expect(checkIngestUrl('http://[::1]/a.mp3')).toBe('private_address');
  });

  it('отбивает localhost по имени', () => {
    expect(checkIngestUrl('http://localhost:4000/health')).toBe('private_address');
  });

  it('мусор адресом не считает', () => {
    expect(checkIngestUrl('не адрес')).toBe('malformed');
    expect(checkIngestUrl('')).toBe('malformed');
  });
});

describe('isPrivateAddress', () => {
  it('знает частные диапазоны IPv4', () => {
    expect(isPrivateAddress('127.0.0.1')).toBe(true);
    expect(isPrivateAddress('10.1.2.3')).toBe(true);
    expect(isPrivateAddress('172.16.0.1')).toBe(true);
    expect(isPrivateAddress('172.32.0.1')).toBe(false);
    expect(isPrivateAddress('192.168.1.1')).toBe(true);
    expect(isPrivateAddress('169.254.169.254')).toBe(true);
    expect(isPrivateAddress('0.0.0.0')).toBe(true);
  });

  it('пропускает публичные', () => {
    expect(isPrivateAddress('93.184.216.34')).toBe(false);
    expect(isPrivateAddress('8.8.8.8')).toBe(false);
  });

  it('знает IPv6: петлю, уникальные локальные и link-local', () => {
    expect(isPrivateAddress('::1')).toBe(true);
    expect(isPrivateAddress('fc00::1')).toBe(true);
    expect(isPrivateAddress('fe80::1')).toBe(true);
    // IPv4, завёрнутый в IPv6, — обход проверки, если смотреть только на
    // префикс.
    expect(isPrivateAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateAddress('2606:4700::1111')).toBe(false);
  });
});
```

- [ ] **Шаг 2: Убедиться, что тест падает**

Выполнить: `pnpm --filter @vedamatch/api test -- ingest-url-guard`
Ожидается: FAIL, «Cannot find module './ingest-url-guard'».

- [ ] **Шаг 3: Реализовать**

Модуль экспортирует:

```ts
export type IngestUrlRejection = 'malformed' | 'scheme_not_allowed' | 'private_address';

/** Больше трёх пересылок — либо петля, либо площадка, которая нас не ждёт. */
export const INGEST_MAX_REDIRECTS = 3;
```

`isPrivateAddress` разбирает IPv4 в число и сверяет с диапазонами `0/8`,
`10/8`, `127/8`, `169.254/16`, `172.16/12`, `192.168/16`; для IPv6 —
нормализует регистр, ловит `::1`, префиксы `fc`/`fd`, `fe80::/10` и
разворачивает `::ffff:` в IPv4. `checkIngestUrl` парсит через `new URL`,
проверяет `protocol` (`http:`/`https:`), а затем хост: `localhost` и любой
литеральный IP из приватных диапазонов отбиваются сразу.

Функция намеренно не резолвит DNS: она чистая и синхронная, а резолв делает
загрузчик (задача 8) — и делает его **на каждом редиректе**, потому что имя
может указывать внутрь, а `302` увести туда же.

- [ ] **Шаг 4: Тесты зелёные**

Выполнить: `pnpm --filter @vedamatch/api test -- ingest-url-guard`
Ожидается: PASS, 8 тестов.

- [ ] **Шаг 5: Коммит**

```bash
git add apps/api/src/modules/music/ingest-url-guard.ts apps/api/src/modules/music/ingest-url-guard.spec.ts
git commit -m "feat(music): защита редакционного импорта от адресов внутренней сети"
```

---

## Задача 8: Загрузчик по ссылке

**Файлы:**

- Создать: `apps/api/src/modules/music/music-ingest-fetch.service.ts`
- Изменить: `apps/api/package.json` (зависимость `@aws-sdk/lib-storage`)
- Изменить: `apps/api/src/modules/music/music-storage.service.ts`
- Изменить: `apps/api/src/modules/music/music.module.ts`

**Потребляет:** `checkIngestUrl`, `isPrivateAddress`, `INGEST_MAX_REDIRECTS`
из задачи 7; лимиты из задачи 3.
**Отдаёт дальше:** `MusicIngestFetchService.fetchUrl(batchId, url):
Promise<{ storageKey: string; sizeBytes: number; checksum: string; mime: string }>`;
метод хранилища `putStream(key, body, mime): Promise<void>`.

- [ ] **Шаг 1: Поставить зависимость**

```bash
pnpm --filter @vedamatch/api add @aws-sdk/lib-storage
```

Нужна ради `Upload` — потоковой многочастной заливки. Обычный `PutObject`
требует длину заранее, а у скачиваемого потока её нет.

- [ ] **Шаг 2: Потоковая заливка в хранилище**

В `music-storage.service.ts`:

```ts
  /**
   * Заливка потоком. Файл не собирается в буфер: 150 МБ на позицию, три
   * позиции разом — почти полгигабайта в памяти, и API ляжет на ровном месте.
   */
  async putStream(key: string, body: Readable, mime: string): Promise<void> {
    if (!this.s3Client || !this.bucket) {
      throw new Error('Хранилище не настроено');
    }
    await new Upload({
      client: this.s3Client,
      params: { Bucket: this.bucket, Key: key, Body: body, ContentType: mime },
    }).done();
  }
```

- [ ] **Шаг 3: Реализовать загрузчик**

`fetchUrl` делает по шагам:

1. `checkIngestUrl(url)` — отказ превращается в человеческую причину.
2. `dns.promises.lookup(hostname, { all: true })`; любой адрес из
   `isPrivateAddress` — отказ. Проверка повторяется для **каждого** адреса в
   ответе: имя может резолвиться сразу в публичный и приватный.
3. `fetch(url, { redirect: 'manual' })` и ручной проход по `Location` не
   более `INGEST_MAX_REDIRECTS` раз, с повторением шагов 1–2 на каждом.
   Автоматические редиректы `fetch` не годятся: они уводят мимо проверки.
4. `Content-Type` сверяется с принимаемыми; отсутствие заголовка не отказ —
   тип уточнится по тегам.
5. Тело гонится через `PassThrough` с двумя надстройками: счётчик байтов
   (превышение `maxBytes` или остатка партии — обрыв с отказом
   `file_too_large`) и `crypto.createHash('md5')` — та же сумма, что даёт
   ETag у однокусочной заливки, поэтому дубли ловятся между источниками.
   MD5 здесь — отпечаток содержимого, не защита.
6. Общий таймаут — 15 минут на позицию через `AbortController`.

Ошибки возвращаются причиной словами: «сервер ответил 404», «не аудио:
text/html», «файл больше 150 МБ», «сервер не отвечает».

- [ ] **Шаг 4: Подключить источник `url` в обработке**

В `music-ingest-process.service.ts` для позиции с `source: 'url'` сначала
зовётся `fetchUrl`, дальше — общая дорога без изменений.

- [ ] **Шаг 5: Проверить руками**

Завести партию, добавить ссылкой заведомо публичный mp3 и заведомо
внутренний адрес `http://localhost:4000/health`. Ожидается: первая позиция
`stored`, вторая — `failed` с причиной про внутреннюю сеть, а не молчаливое
скачивание.

- [ ] **Шаг 6: Коммит**

```bash
git add apps/api
git commit -m "feat(music): импорт записей по прямым ссылкам"
```

---

## Задача 9: Разбор архива — чистая логика

**Файлы:**

- Создать: `apps/api/src/modules/music/ingest-zip-entry.ts`
- Создать: `apps/api/src/modules/music/ingest-order.ts`
- Тест: `apps/api/src/modules/music/ingest-zip-entry.spec.ts`
- Тест: `apps/api/src/modules/music/ingest-order.spec.ts`

**Отдаёт дальше:** `acceptZipEntry(entry, seen): ZipEntryVerdict`,
`INGEST_ZIP_MAX_ENTRIES`, `INGEST_ZIP_MAX_TOTAL_BYTES`;
`sortIngestEntries(entries): string[]`.

- [ ] **Шаг 1: Написать падающие тесты**

```ts
// apps/api/src/modules/music/ingest-zip-entry.spec.ts
import {
  INGEST_ZIP_MAX_ENTRIES,
  INGEST_ZIP_MAX_TOTAL_BYTES,
  acceptZipEntry,
} from './ingest-zip-entry';

const seen = (over = {}) => ({ count: 0, totalBytes: 0, ...over });

describe('acceptZipEntry', () => {
  it('берёт mp3 и m4a', () => {
    expect(acceptZipEntry({ path: 'album/01.mp3', sizeBytes: 100 }, seen())).toBe('take');
    expect(acceptZipEntry({ path: 'album/02.m4a', sizeBytes: 100 }, seen())).toBe('take');
  });

  it('молча пропускает обложки и служебное', () => {
    // Не ошибка: в архивах всегда лежат cover.jpg и мусор macOS.
    expect(acceptZipEntry({ path: 'album/cover.jpg', sizeBytes: 10 }, seen())).toBe('skip');
    expect(acceptZipEntry({ path: '__MACOSX/._01.mp3', sizeBytes: 10 }, seen())).toBe('skip');
    expect(acceptZipEntry({ path: 'album/', sizeBytes: 0 }, seen())).toBe('skip');
  });

  it('отбивает выход за пределы каталога', () => {
    expect(acceptZipEntry({ path: '../../etc/passwd.mp3', sizeBytes: 10 }, seen())).toBe('reject');
    expect(acceptZipEntry({ path: '/etc/passwd.mp3', sizeBytes: 10 }, seen())).toBe('reject');
    expect(acceptZipEntry({ path: 'C:\\Windows\\a.mp3', sizeBytes: 10 }, seen())).toBe('reject');
  });

  it('игнорирует вложенные архивы, а не раскрывает их', () => {
    expect(acceptZipEntry({ path: 'album/more.zip', sizeBytes: 10 }, seen())).toBe('skip');
  });

  it('отбивает архив, у которого слишком много записей', () => {
    expect(
      acceptZipEntry({ path: 'a.mp3', sizeBytes: 10 }, seen({ count: INGEST_ZIP_MAX_ENTRIES })),
    ).toBe('reject');
  });

  it('отбивает распаковку, переросшую потолок: это zip-бомба', () => {
    expect(
      acceptZipEntry(
        { path: 'a.mp3', sizeBytes: 1024 },
        seen({ totalBytes: INGEST_ZIP_MAX_TOTAL_BYTES }),
      ),
    ).toBe('reject');
  });
});
```

```ts
// apps/api/src/modules/music/ingest-order.spec.ts
import { sortIngestEntries } from './ingest-order';

describe('sortIngestEntries', () => {
  it('номер из тегов важнее имени файла', () => {
    const sorted = sortIngestEntries([
      { ref: 'b.mp3', trackNumber: 1 },
      { ref: 'a.mp3', trackNumber: 2 },
    ]);
    expect(sorted).toEqual(['b.mp3', 'a.mp3']);
  });

  it('без тегов сортирует имена по-человечески: 2 перед 10', () => {
    const sorted = sortIngestEntries([
      { ref: 'track10.mp3', trackNumber: null },
      { ref: 'track2.mp3', trackNumber: null },
    ]);
    expect(sorted).toEqual(['track2.mp3', 'track10.mp3']);
  });

  it('часть с тегами, часть без: с тегами идут первыми, остальные по имени', () => {
    const sorted = sortIngestEntries([
      { ref: 'zzz.mp3', trackNumber: null },
      { ref: 'aaa.mp3', trackNumber: 3 },
    ]);
    expect(sorted).toEqual(['aaa.mp3', 'zzz.mp3']);
  });

  it('одинаковые номера разводит по имени, а не оставляет на волю сортировки', () => {
    const sorted = sortIngestEntries([
      { ref: 'b.mp3', trackNumber: 1 },
      { ref: 'a.mp3', trackNumber: 1 },
    ]);
    expect(sorted).toEqual(['a.mp3', 'b.mp3']);
  });
});
```

- [ ] **Шаг 2: Убедиться, что тесты падают**

Выполнить: `pnpm --filter @vedamatch/api test -- "ingest-(zip-entry|order)"`
Ожидается: FAIL, оба модуля не найдены.

- [ ] **Шаг 3: Реализовать**

`ingest-zip-entry.ts`:

```ts
/** Двести дорожек — это уже не альбом, а чей-то целый диск. */
export const INGEST_ZIP_MAX_ENTRIES = 200;

/**
 * Четыре гигабайта распакованного на архив. Предел стоит именно на
 * распакованном объёме: архив на сорок килобайт разворачивается в гигабайты
 * нулей, и проверять его собственный размер бесполезно.
 */
export const INGEST_ZIP_MAX_TOTAL_BYTES = 4 * 1024 * 1024 * 1024;

export type ZipEntryVerdict = 'take' | 'skip' | 'reject';
```

`take` — аудио, `skip` — всё остальное содержимое (обложки, тексты, мусор
macOS, вложенные архивы, каталоги), `reject` — то, из-за чего распаковка
останавливается целиком: путь наружу и переполнение потолков. Разница важна:
чужой архив всегда содержит лишнее, и падать на `cover.jpg` нельзя, а на
`../` — обязательно.

`ingest-order.ts` — сортировка: сначала записи с номером из тегов по
возрастанию, затем остальные натуральным сравнением имён
(`localeCompare(b, 'ru', { numeric: true })`), равные номера разводятся по
имени.

- [ ] **Шаг 4: Тесты зелёные**

Выполнить: `pnpm --filter @vedamatch/api test -- "ingest-(zip-entry|order)"`
Ожидается: PASS, 10 тестов.

- [ ] **Шаг 5: Коммит**

```bash
git add apps/api/src/modules/music/ingest-zip-entry.ts apps/api/src/modules/music/ingest-order.ts apps/api/src/modules/music/ingest-zip-entry.spec.ts apps/api/src/modules/music/ingest-order.spec.ts
git commit -m "feat(music): правила разбора архива и порядок дорожек"
```

---

## Задача 10: Распаковка архива

**Файлы:**

- Изменить: `apps/api/src/modules/music/music-ingest-fetch.service.ts`
- Изменить: `apps/api/package.json` (зависимость `unzipper`)
- Изменить: `apps/api/src/modules/music/music-ingest.service.ts`

**Потребляет:** `acceptZipEntry`, `sortIngestEntries` из задачи 9;
`putStream` из задачи 8.
**Отдаёт дальше:** `MusicIngestFetchService.expandArchive(batchId, source):
Promise<number>` — сколько позиций заведено.

- [ ] **Шаг 1: Поставить зависимость**

```bash
pnpm --filter @vedamatch/api add unzipper && pnpm --filter @vedamatch/api add -D @types/unzipper
```

`unzipper.Parse()` разбирает поток на лету: архив не ложится на диск целиком
и не собирается в память.

- [ ] **Шаг 2: Реализовать распаковку**

`expandArchive` берёт архив (залитый в бакет или скачанный по ссылке тем же
`fetchUrl`), гонит его через `unzipper.Parse()` и на каждой записи:

1. `acceptZipEntry(...)` — `skip` вызывает `entry.autodrain()`, `reject`
   останавливает разбор и валит позицию архива с причиной словами;
2. `take` — поток записи уходит в `storage.putStream` под редакционным
   ключом, попутно считаются байты и MD5;
3. заводится `MusicIngestItem` с `source: 'zip'`, `sourceRef` — имя файла в
   архиве.

После разбора позиции переупорядочиваются `sortIngestEntries` по номеру из
тегов, прочитанному на общей дороге, и `position` переписывается одним
`$transaction`.

Позиция самого архива после успешного разбора становится `skipped` с
пометкой «архив разобран»: она не запись каталога, а контейнер.

- [ ] **Шаг 3: Проверить руками**

Собрать тестовый архив из трёх mp3 и `cover.jpg`, залить, убедиться: три
позиции в порядке номеров, обложка молча пропущена, архив помечен
разобранным.

- [ ] **Шаг 4: Коммит**

```bash
git add apps/api
git commit -m "feat(music): импорт альбома архивом"
```

---

## Задача 11: Подборка из партии и объём редакции

**Файлы:**

- Изменить: `apps/api/src/modules/music/music-ingest.service.ts`
- Изменить: `apps/api/src/modules/music/music-admin-queue.service.ts` (сводка)
- Изменить: `apps/web/src/components/music/admin/ingest-batch-list.tsx`

**Потребляет:** `publish` из задачи 4.

- [ ] **Шаг 1: Собрать подборку при публикации**

Сначала убрать временную заглушку из задачи 4: сейчас непустой
`playlistTitle` отвергается `BadRequestException` — молча терять параметр было
нельзя, а собирать подборку было ещё нечем.

В `publish` при непустом `playlistTitle` в той же транзакции создать
`MusicPlaylist` с `isSystem: true`, `visibility: 'public'`, владельцем —
`user.sub`, и позициями в порядке `position` партии. Витрина подхватит
подборку сама: `listSystemPlaylists` берёт системные публичные плейлисты с
`trackCount > 0`.

- [ ] **Шаг 2: Показать объём редакции в сводке**

В `music-admin-queue.service.ts` в сводку добавить `portalBytes` — сумму
`sizeBytes` треков с `uploadedById: null`. Сейчас там считаются только
загрузки людей, и портальные записи проходят мимо счёта, хотя платит за них
тот же бакет.

- [ ] **Шаг 3: Проверить**

```bash
pnpm --filter @vedamatch/api test && pnpm --filter @vedamatch/web test
```

Ожидается: обе сюиты зелёные.

- [ ] **Шаг 4: Коммит**

```bash
git add apps/api apps/web
git commit -m "feat(music): подборка из партии и учёт объёма редакции"
```

---

## Известный долг

Объект упавшей позиции остаётся в бакете: так «Повторить упавшие» остаётся
осмысленным — файл уже долит и второй раз его качать незачем. Плата за это —
байты, которые не считает ни потолок партии (он считает по трекам), ни
счётчик занятого места. Убираются они только удалением позиции или партии.
Когда появится статистика хранилища, в стадию уборки воркера стоит добавить
сбор объектов у позиций, упавших больше недели назад.

## Проверка перед сдачей

- [ ] `pnpm --filter @vedamatch/api test` — зелено.
- [ ] `pnpm --filter @vedamatch/web test` — зелено.
- [ ] `cd apps/api && npx tsc -p tsconfig.json --noEmit` — без ошибок.
- [ ] `pnpm --filter @vedamatch/web exec tsc --noEmit` — без ошибок.
- [ ] `pnpm lint` — новых претензий в изменённых файлах нет.
- [ ] Ручной прогон: партия из файла, партия из ссылки, партия из архива,
      публикация, запись видна на `/music`.
- [ ] Админ чужого сервиса (`adminServices: ['market']`) получает 403 на
      `music/admin/ingest`.
- [ ] `.env.example` дополнен `MUSIC_INGEST_BATCH_QUOTA_BYTES` с пояснением,
      сколько это в часах записи.
