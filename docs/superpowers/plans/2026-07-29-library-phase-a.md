# VedaMatch Library — Фаза A: ядро каталога

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Рабочий каталог ссылок: админские разделы, пользовательские подкатегории с защитой от дублей, добавление ссылок с уникальностью по URL, лента с фильтрами и полнотекстовым поиском, двуязычный интерфейс.

**Architecture:** Изолированный сервисный модуль по `docs/service-module-contract.md`. Backend — `apps/api/src/modules/library/` (NestJS, Prisma, ручная валидация в сервисах, как в `support.service.ts`). Frontend — `apps/web/src/app/library/` (Next.js App Router, server components читают через `lib/library-api.ts`, мутации из client components прямым fetch с `credentials: "include"`). Общие типы — `packages/shared/src/library.ts`.

**Tech Stack:** NestJS 11, Prisma 6 + PostgreSQL 16 (`pg_trgm`, `unaccent`, tsvector), Next.js 16 + React 19, Tailwind 4, Jest (API), Vitest (web).

**Спека:** `docs/superpowers/specs/2026-07-29-library-links-service-design.md`

## Global Constraints

- Slug сервиса — `library`. Все API-маршруты с префиксом `library/`, все модели БД с префиксом `Library`.
- Модуль импортирует только `AuthModule`, глобальный `PrismaService` и типы из `@vedamatch/shared`. Импорт других фичевых модулей запрещён.
- `User` читается только на чтение. Язык интерфейса хранится в `LibraryPreference`, не в `User`.
- Валидация — вручную в сервисах через `BadRequestException`/`ConflictException`/`NotFoundException`. `class-validator` и `zod` в проекте не установлены, ставить их нельзя.
- Тесты API — Jest, файлы `*.spec.ts` рядом с исходником. Тесты web — Vitest, файлы `*.spec.ts`/`*.spec.tsx`.
- Дизайн-токены Tailwind: фон `bg-bg-0`, текст `text-text-0` / `text-text-1` / `text-text-2`, стекло `glass` + `border border-glass-brd`, заголовки `font-display`. Новые цвета не вводить.
- Иконки — `lucide-react`. Он уже установлен, других иконочных библиотек не добавлять.
- Все тексты интерфейса сервиса идут через словарь `apps/web/src/components/library/i18n.ts`, хардкод строк в компонентах запрещён.
- Статические `metadata` Next.js являются техническим исключением: для SEO допускаются отдельные русские `title`/`description`, не отображаемые в UI.
- Seed продублирован: любое изменение вносится и в `apps/api/prisma/seed.ts`, и в `apps/api/prisma/seed.cjs` (рантайм использует `.cjs`).
- Команды запускаются из корня монорепо через pnpm-фильтры: `pnpm --filter @vedamatch/api test`, `pnpm --filter @vedamatch/web test`.
- В фазе A нет голосов, переходов, превью, закладок, подборок и жалоб. Не реализовывать их заранее.

---

## File Structure

**Backend (`apps/api/`)**

| Файл | Ответственность |
|---|---|
| `prisma/schema.prisma` | блок `// ===== Library service =====` с моделями фазы A |
| `prisma/migrations/<ts>_library_core/migration.sql` | таблицы + расширения + tsvector + GIN/trgm индексы |
| `src/modules/library/library.module.ts` | сборка модуля, одна строка в `app.module.ts` |
| `src/modules/library/url-normalize.ts` | чистая нормализация URL (ключ дедупликации) |
| `src/modules/library/url-normalize.spec.ts` | тесты нормализации |
| `src/modules/library/category-slug.ts` | транслит, slug, нормализация названий для trgm |
| `src/modules/library/category-slug.spec.ts` | тесты slug и нормализации |
| `src/modules/library/library-sections.service.ts` | чтение разделов со счётчиками |
| `src/modules/library/library-sections.controller.ts` | `GET library/sections` |
| `src/modules/library/library-categories.service.ts` | список, подсказка дублей, создание категории |
| `src/modules/library/library-categories.service.spec.ts` | тесты правил создания категории |
| `src/modules/library/library-categories.controller.ts` | маршруты категорий |
| `src/modules/library/library-entries.service.ts` | создание ссылки, дубль-409, лента, поиск |
| `src/modules/library/library-entries.service.spec.ts` | тесты валидации и дубля URL |
| `src/modules/library/library-feed-query.ts` | сборка WHERE/ORDER/курсора для ленты |
| `src/modules/library/library-feed-query.spec.ts` | тесты курсора и сортировки |
| `src/modules/library/library-entries.controller.ts` | маршруты ссылок |
| `src/modules/library/library-preferences.service.ts` | язык интерфейса пользователя |
| `src/modules/library/library-preferences.controller.ts` | `GET/PATCH library/me/preferences` |

**Shared (`packages/shared/`)**: `src/library.ts` + реэкспорт в `src/index.ts`.

**Frontend (`apps/web/`)**

| Файл | Ответственность |
|---|---|
| `src/lib/library-api.ts` | server-side чтение API сервиса |
| `src/lib/library-query.ts` | чистая сборка query-строки без `next/headers` |
| `src/components/library/i18n.ts` | словарь ru/en + выбор текста контента по локали |
| `src/components/library/i18n.spec.ts` | тесты фоллбэка локали |
| `src/components/library/section-strip.tsx` | полоса разделов |
| `src/components/library/entry-filters.tsx` | панель фильтров (client) |
| `src/components/library/entry-card.tsx` | карточка ссылки |
| `src/components/library/entry-list.tsx` | лента + «показать ещё» (client) |
| `src/components/library/add-entry-form.tsx` | форма добавления, обработка 409 |
| `src/components/library/category-create-form.tsx` | создание категории, обработка 422 |
| `src/components/library/locale-switch.tsx` | переключатель RU/EN |
| `src/app/library/page.tsx` | главная: разделы + фильтры + лента |
| `src/app/library/[section]/page.tsx` | раздел с подкатегориями |
| `src/app/library/[section]/[category]/page.tsx` | лента категории |
| `src/app/library/entry/[id]/page.tsx` | карточка ссылки |
| `src/app/library/add/page.tsx` | добавление ссылки |

---

## Task 1: Prisma-модели и миграция ядра

**Files:**
- Create: `apps/api/prisma/migrations/<ts>_library_core/migration.sql`
- Create: `apps/api/prisma/migrations/20260729120000_library_core/migration.sql`
- Test: `apps/api/src/modules/library/library-schema.spec.ts`

**Interfaces:**
- Consumes: ничего.
- Produces: Prisma-клиент с моделями `LibrarySection`, `LibraryCategory`, `LibraryEntry`, `LibraryEntryCategory`, `LibraryPreference` и энумами `LibraryEntryType`, `LibraryEntryStatus`, `LibraryEnrichmentStatus`, `LibraryCategoryStatus`.

- [ ] **Step 1: Написать падающий тест на наличие энумов в клиенте**

Создать `apps/api/src/modules/library/library-schema.spec.ts`:

```ts
import {
  LibraryCategoryStatus,
  LibraryEnrichmentStatus,
  LibraryEntryStatus,
  LibraryEntryType,
} from '@prisma/client';

describe('Library Prisma schema', () => {
  it('exposes entry types required by the catalog', () => {
    expect(Object.values(LibraryEntryType)).toEqual(
      expect.arrayContaining([
        'website',
        'article',
        'video',
        'audio',
        'book',
        'course',
        'app',
        'telegram_channel',
        'community',
        'other',
      ]),
    );
  });

  it('exposes moderation and enrichment statuses', () => {
    expect(Object.values(LibraryEntryStatus)).toEqual([
      'published',
      'hidden_by_reports',
      'removed_by_admin',
    ]);
    expect(Object.values(LibraryEnrichmentStatus)).toEqual([
      'pending',
      'queued',
      'ready',
      'failed',
    ]);
    expect(Object.values(LibraryCategoryStatus)).toEqual([
      'active',
      'hidden_by_reports',
      'merged',
      'removed',
    ]);
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @vedamatch/api test -- library-schema`
Expected: FAIL — `LibraryEntryType` не экспортируется из `@prisma/client`.

- [ ] **Step 3: Добавить блок моделей в `apps/api/prisma/schema.prisma`**

В конец файла:

```prisma
// ===== Library service =====

enum LibraryEntryType {
  website
  article
  video
  audio
  book
  course
  app
  telegram_channel
  community
  other
}

enum LibraryEntryStatus {
  published
  hidden_by_reports
  removed_by_admin
}

enum LibraryEnrichmentStatus {
  pending
  queued
  ready
  failed
}

enum LibraryCategoryStatus {
  active
  hidden_by_reports
  merged
  removed
}

model LibrarySection {
  id            String   @id @default(uuid())
  slug          String   @unique
  titleRu       String
  titleEn       String
  descriptionRu String?
  descriptionEn String?
  iconKey       String?
  position      Int      @default(0)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  categories LibraryCategory[]

  @@index([position])
}

model LibraryCategory {
  id              String                @id @default(uuid())
  sectionId       String
  section         LibrarySection        @relation(fields: [sectionId], references: [id], onDelete: Cascade)
  slug            String
  titleRu         String?
  titleEn         String?
  descriptionRu   String?
  descriptionEn   String?
  normalizedRu    String                @default("")
  normalizedEn    String                @default("")
  createdById     String?
  createdBy       User?                 @relation("LibraryCategoryAuthor", fields: [createdById], references: [id], onDelete: SetNull)
  status          LibraryCategoryStatus @default(active)
  mergedIntoId    String?
  mergedInto      LibraryCategory?      @relation("LibraryCategoryMerge", fields: [mergedIntoId], references: [id], onDelete: SetNull)
  mergedFrom      LibraryCategory[]     @relation("LibraryCategoryMerge")
  entriesCount    Int                   @default(0)
  followersCount  Int                   @default(0)
  openReportsCount Int                  @default(0)
  needsReview     Boolean               @default(false)
  createdAt       DateTime              @default(now())
  updatedAt       DateTime              @updatedAt

  entries LibraryEntryCategory[]

  @@unique([sectionId, slug])
  @@index([sectionId, status])
  @@index([status, entriesCount])
}

model LibraryEntry {
  id               String                  @id @default(uuid())
  url              String
  urlNormalized    String                  @unique
  canonicalUrl     String?
  domain           String
  type             LibraryEntryType
  contentLanguage  String                  @default("ru") @db.VarChar(8)
  titleRu          String?
  titleEn          String?
  descriptionRu    String?
  descriptionEn    String?
  ogTitle          String?
  ogDescription    String?
  ogSiteName       String?
  faviconUrl       String?
  previewKey       String?
  previewUrl       String?
  enrichmentStatus LibraryEnrichmentStatus @default(pending)
  enrichmentError  String?
  enrichedAt       DateTime?
  httpStatus       Int?
  lastCheckedAt    DateTime?
  addedById        String?
  addedBy          User?                   @relation("LibraryEntryAuthor", fields: [addedById], references: [id], onDelete: SetNull)
  status           LibraryEntryStatus      @default(published)
  needsReview      Boolean                 @default(false)
  usefulCount      Int                     @default(0)
  notUsefulCount   Int                     @default(0)
  uniqueClickCount Int                     @default(0)
  bookmarkCount    Int                     @default(0)
  openReportsCount Int                     @default(0)
  rankScore        Float                   @default(0)
  publishedAt      DateTime                @default(now())
  createdAt        DateTime                @default(now())
  updatedAt        DateTime                @updatedAt

  categories LibraryEntryCategory[]

  @@index([status, publishedAt(sort: Desc)])
  @@index([status, rankScore(sort: Desc)])
  @@index([type])
  @@index([contentLanguage])
  @@index([domain])
  @@index([addedById])
}

model LibraryEntryCategory {
  entryId    String
  entry      LibraryEntry    @relation(fields: [entryId], references: [id], onDelete: Cascade)
  categoryId String
  category   LibraryCategory @relation(fields: [categoryId], references: [id], onDelete: Cascade)
  addedById  String?
  createdAt  DateTime        @default(now())

  @@id([entryId, categoryId])
  @@index([categoryId])
}

model LibraryPreference {
  userId           String   @id
  user             User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  uiLanguage       String   @default("ru") @db.VarChar(8)
  contentLanguages String[] @default([])
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
}
```

- [ ] **Step 4: Добавить обратные связи в `model User`**

В `model User` (около строки 138) дописать три строки рядом с остальными связями:

```prisma
  libraryCategories LibraryCategory[]  @relation("LibraryCategoryAuthor")
  libraryEntries    LibraryEntry[]     @relation("LibraryEntryAuthor")
  libraryPreference LibraryPreference?
```

- [ ] **Step 5: Проверить схему**

Run: `pnpm --filter @vedamatch/api exec prisma validate`
Expected: `The schema at prisma/schema.prisma is valid`

- [ ] **Step 6: Сгенерировать миграцию без применения**

Run: `pnpm --filter @vedamatch/api exec prisma migrate dev --name library_core --create-only`
Expected: создана папка `prisma/migrations/<timestamp>_library_core/` с `migration.sql`. Если timestamp отличается от `20260729120000` — это нормально, дальше используем фактическое имя папки.

- [ ] **Step 7: Дописать в конец сгенерированного `migration.sql` расширения, tsvector и trgm-индексы**

```sql
-- Расширения для поиска и подсказки дублей
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Полнотекстовый вектор: русская и английская части объединяются
ALTER TABLE "LibraryEntry"
  ADD COLUMN "searchVector" tsvector GENERATED ALWAYS AS (
    to_tsvector('russian', coalesce("titleRu", '') || ' ' || coalesce("descriptionRu", '')) ||
    to_tsvector('english', coalesce("titleEn", '') || ' ' || coalesce("descriptionEn", ''))
  ) STORED;

CREATE INDEX "LibraryEntry_searchVector_idx" ON "LibraryEntry" USING GIN ("searchVector");

-- Подсказка похожих категорий
CREATE INDEX "LibraryCategory_normalizedRu_trgm_idx" ON "LibraryCategory" USING GIN ("normalizedRu" gin_trgm_ops);
CREATE INDEX "LibraryCategory_normalizedEn_trgm_idx" ON "LibraryCategory" USING GIN ("normalizedEn" gin_trgm_ops);
```

- [ ] **Step 8: Объявить generated-колонку в схеме, чтобы Prisma о ней знала**

В `model LibraryEntry` дописать после `rankScore`:

```prisma
  /// Generated column, создаётся SQL-миграцией. Prisma её не пишет.
  searchVector Unsupported("tsvector")?
```

- [ ] **Step 9: Применить миграцию и сгенерировать клиент**

Run: `pnpm --filter @vedamatch/api exec prisma migrate deploy; pnpm --filter @vedamatch/api exec prisma generate`
Expected: миграция применена без интерактивного drift-reset, затем выведено `Generated Prisma Client`.

- [ ] **Step 10: Запустить тест и убедиться, что он проходит**

Run: `pnpm --filter @vedamatch/api test -- library-schema`
Expected: PASS, 2 теста.

- [ ] **Step 11: Коммит**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations apps/api/src/modules/library/library-schema.spec.ts
git commit -m "feat(library): модели и миграция ядра каталога"
```

---

## Task 2: Нормализация URL

**Files:**
- Create: `apps/api/src/modules/library/url-normalize.ts`
- Test: `apps/api/src/modules/library/url-normalize.spec.ts`

**Interfaces:**
- Consumes: ничего.
- Produces: `normalizeUrl(input: string): NormalizedUrl` где `NormalizedUrl = { url: string; normalized: string; domain: string }`; бросает `Error` с сообщением `unsupported_url` на нелегальный ввод.

- [ ] **Step 1: Написать падающий тест**

Создать `apps/api/src/modules/library/url-normalize.spec.ts`:

```ts
import { normalizeUrl } from './url-normalize';

describe('normalizeUrl', () => {
  it('strips tracking params, www and trailing slash', () => {
    const result = normalizeUrl(
      'HTTP://WWW.Example.com/Path/?utm_source=tg&fbclid=1&id=7#section',
    );

    expect(result.normalized).toBe('https://example.com/Path?id=7');
    expect(result.domain).toBe('example.com');
  });

  it('keeps the original url untouched for redirects', () => {
    const result = normalizeUrl('http://example.com/a/');

    expect(result.url).toBe('http://example.com/a/');
    expect(result.normalized).toBe('https://example.com/a');
  });

  it('sorts query params so that param order is not a new entry', () => {
    const first = normalizeUrl('https://example.com/?b=2&a=1');
    const second = normalizeUrl('https://example.com/?a=1&b=2');

    expect(first.normalized).toBe(second.normalized);
  });

  it('collapses youtube variants to a single key', () => {
    const watch = normalizeUrl(
      'https://www.youtube.com/watch?v=abc123&t=42s&list=PL1',
    );
    const short = normalizeUrl('https://youtu.be/abc123?si=xyz');

    expect(watch.normalized).toBe('https://youtube.com/watch?v=abc123');
    expect(short.normalized).toBe(watch.normalized);
  });

  it.each([
    'ftp://example.com/file',
    'javascript:alert(1)',
    'not-a-url',
    '',
    'https://example.com:8443/file',
    'https://user:secret@example.com/file',
  ])('rejects %s', (input) => {
    expect(() => normalizeUrl(input)).toThrow('unsupported_url');
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @vedamatch/api test -- url-normalize`
Expected: FAIL — `Cannot find module './url-normalize'`.

- [ ] **Step 3: Реализовать минимально достаточный код**

Создать `apps/api/src/modules/library/url-normalize.ts`:

```ts
export interface NormalizedUrl {
  /** Исходный адрес — по нему идут переходы и обогащение. */
  url: string;
  /** Ключ дедупликации, уникален в базе. */
  normalized: string;
  domain: string;
}

const TRACKING_PARAMS = /^(utm_|fbclid$|gclid$|yclid$|ref$|si$)/i;

export function normalizeUrl(input: string): NormalizedUrl {
  const raw = input.trim();
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('unsupported_url');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('unsupported_url');
  }
  if (
    parsed.username ||
    parsed.password ||
    (parsed.port && parsed.port !== '80' && parsed.port !== '443')
  ) {
    throw new Error('unsupported_url');
  }

  const domain = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const youtubeId = extractYoutubeId(domain, parsed);
  const query = new URLSearchParams();

  if (youtubeId) {
    query.set('v', youtubeId);
  } else {
    for (const [key, value] of [...parsed.searchParams].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      if (!TRACKING_PARAMS.test(key)) query.set(key, value);
    }
  }

  const path = youtubeId
    ? '/watch'
    : parsed.pathname.replace(/\/+$/, '') || '';
  const search = query.toString();
  const host = youtubeId ? 'youtube.com' : domain;

  return {
    url: raw,
    normalized: `https://${host}${path}${search ? `?${search}` : ''}`,
    domain: host,
  };
}

function extractYoutubeId(domain: string, parsed: URL): string | null {
  if (domain === 'youtu.be') return parsed.pathname.slice(1) || null;
  if (domain === 'youtube.com' && parsed.pathname === '/watch') {
    return parsed.searchParams.get('v');
  }
  return null;
}
```

- [ ] **Step 4: Запустить тест и убедиться, что он проходит**

Run: `pnpm --filter @vedamatch/api test -- url-normalize`
Expected: PASS, 8 тестов (`it.each` даёт 4).

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/modules/library/url-normalize.ts apps/api/src/modules/library/url-normalize.spec.ts
git commit -m "feat(library): нормализация URL как ключ дедупликации"
```

---

## Task 3: Slug и нормализация названий категорий

**Files:**
- Create: `apps/api/src/modules/library/category-slug.ts`
- Test: `apps/api/src/modules/library/category-slug.spec.ts`

**Interfaces:**
- Consumes: ничего.
- Produces: `buildCategorySlug(input: { titleRu?: string | null; titleEn?: string | null }): string`, `normalizeTitle(value: string | null | undefined): string`, `withSlugSuffix(slug: string, attempt: number): string`.

- [ ] **Step 1: Написать падающий тест**

Создать `apps/api/src/modules/library/category-slug.spec.ts`:

```ts
import {
  buildCategorySlug,
  normalizeTitle,
  withSlugSuffix,
} from './category-slug';

describe('buildCategorySlug', () => {
  it('prefers the english title', () => {
    expect(
      buildCategorySlug({ titleRu: 'Лекции по Гите', titleEn: 'Gita Lectures' }),
    ).toBe('gita-lectures');
  });

  it('transliterates russian when english is missing', () => {
    expect(buildCategorySlug({ titleRu: 'Лекции по Гите' })).toBe(
      'lekcii-po-gite',
    );
  });

  it('falls back to a stable placeholder for unsupported scripts', () => {
    expect(buildCategorySlug({ titleRu: '中文' })).toBe('category');
  });
});

describe('normalizeTitle', () => {
  it('lowercases and collapses whitespace and punctuation', () => {
    expect(normalizeTitle('  Лекции   по  Гите!! ')).toBe('лекции по гите');
  });

  it('returns an empty string for missing values', () => {
    expect(normalizeTitle(null)).toBe('');
    expect(normalizeTitle(undefined)).toBe('');
  });
});

describe('withSlugSuffix', () => {
  it('keeps the first attempt clean and numbers the rest', () => {
    expect(withSlugSuffix('gita', 0)).toBe('gita');
    expect(withSlugSuffix('gita', 2)).toBe('gita-3');
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @vedamatch/api test -- category-slug`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать код**

Создать `apps/api/src/modules/library/category-slug.ts`:

```ts
const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh',
  з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
  п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c',
  ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu',
  я: 'ya',
};

/** Нормализованное название для trgm-поиска похожих категорий. */
export function normalizeTitle(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .toLocaleLowerCase('ru-RU')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildCategorySlug(input: {
  titleRu?: string | null;
  titleEn?: string | null;
}): string {
  const source = input.titleEn?.trim() ? input.titleEn : input.titleRu;
  const normalized = normalizeTitle(source);
  const latin = [...normalized]
    .map((char) => TRANSLIT[char] ?? char)
    .join('')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return latin || 'category';
}

export function withSlugSuffix(slug: string, attempt: number): string {
  return attempt === 0 ? slug : `${slug}-${attempt + 1}`;
}
```

- [ ] **Step 4: Запустить тест и убедиться, что он проходит**

Run: `pnpm --filter @vedamatch/api test -- category-slug`
Expected: PASS, 6 тестов.

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/modules/library/category-slug.ts apps/api/src/modules/library/category-slug.spec.ts
git commit -m "feat(library): slug и нормализация названий категорий"
```

---

## Task 4: Shared-типы сервиса

**Files:**
- Create: `packages/shared/src/library.ts`
- Modify: `packages/shared/src/index.ts:1-6`

**Interfaces:**
- Consumes: ничего.
- Produces: типы, которые используют все последующие задачи: `LibraryEntryType`, `LibraryEntryStatus`, `LibraryLocale`, `LibrarySectionDto`, `LibraryCategoryDto`, `LibraryCategorySuggestion`, `LibraryEntryDto`, `LibraryFeedResponse`, `LibraryFeedSort`, `CreateLibraryCategoryRequest`, `CreateLibraryCategoryConflict`, `CreateLibraryEntryRequest`, `LibraryDuplicateEntryConflict`, `LibraryPreferencesDto`, `UpdateLibraryPreferencesRequest`.

- [ ] **Step 1: Создать файл типов**

Создать `packages/shared/src/library.ts`:

```ts
export type LibraryEntryType =
  | 'website'
  | 'article'
  | 'video'
  | 'audio'
  | 'book'
  | 'course'
  | 'app'
  | 'telegram_channel'
  | 'community'
  | 'other';

export type LibraryEntryStatus =
  | 'published'
  | 'hidden_by_reports'
  | 'removed_by_admin';

export type LibraryLocale = 'ru' | 'en';

/** Сортировки ленты. `actual` и `popular` наполняются данными в фазе B. */
export type LibraryFeedSort = 'new' | 'actual' | 'popular';

export interface LibrarySectionDto {
  id: string;
  slug: string;
  titleRu: string;
  titleEn: string;
  descriptionRu: string | null;
  descriptionEn: string | null;
  iconKey: string | null;
  position: number;
  categoriesCount: number;
  entriesCount: number;
}

export interface LibraryCategoryDto {
  id: string;
  sectionId: string;
  sectionSlug: string;
  slug: string;
  titleRu: string | null;
  titleEn: string | null;
  descriptionRu: string | null;
  descriptionEn: string | null;
  entriesCount: number;
  createdAt: string;
}

export interface LibraryCategorySuggestion {
  id: string;
  sectionSlug: string;
  slug: string;
  titleRu: string | null;
  titleEn: string | null;
  entriesCount: number;
  similarity: number;
}

export interface LibraryEntryDto {
  id: string;
  url: string;
  domain: string;
  type: LibraryEntryType;
  contentLanguage: string;
  titleRu: string | null;
  titleEn: string | null;
  descriptionRu: string | null;
  descriptionEn: string | null;
  faviconUrl: string | null;
  previewUrl: string | null;
  status: LibraryEntryStatus;
  usefulCount: number;
  uniqueClickCount: number;
  publishedAt: string;
  categories: Array<Pick<LibraryCategoryDto, 'id' | 'slug' | 'sectionSlug' | 'titleRu' | 'titleEn'>>;
  addedBy: { id: string; name: string } | null;
}

export interface LibraryFeedResponse {
  items: LibraryEntryDto[];
  /** `null` — данных больше нет. */
  nextCursor: string | null;
  total: number;
}

export interface CreateLibraryCategoryRequest {
  sectionId: string;
  titleRu?: string | null;
  titleEn?: string | null;
  descriptionRu?: string | null;
  descriptionEn?: string | null;
  /** `true` — пользователь подтвердил создание при найденных похожих. */
  force?: boolean;
}

/** Тело ответа `422` при похожей существующей категории. */
export interface CreateLibraryCategoryConflict {
  code: 'similar_category_exists';
  suggestions: LibraryCategorySuggestion[];
}

export interface CreateLibraryEntryRequest {
  url: string;
  type: LibraryEntryType;
  contentLanguage: string;
  titleRu?: string | null;
  titleEn?: string | null;
  descriptionRu?: string | null;
  descriptionEn?: string | null;
  categoryIds: string[];
}

/** Тело ответа `409` при уже существующем URL. */
export interface LibraryDuplicateEntryConflict {
  code: 'entry_already_exists';
  entry: LibraryEntryDto;
}

export interface LibraryPreferencesDto {
  uiLanguage: LibraryLocale;
  contentLanguages: string[];
}

export interface UpdateLibraryPreferencesRequest {
  uiLanguage?: LibraryLocale;
  contentLanguages?: string[];
}
```

- [ ] **Step 2: Добавить реэкспорт в `packages/shared/src/index.ts`**

В блок реэкспортов в начале файла (строки 1-6) добавить строку после `export * from './union';`:

```ts
export * from './library';
```

- [ ] **Step 3: Проверить типы**

Run: `pnpm --filter @vedamatch/shared lint`
Expected: без ошибок (`tsc --noEmit` завершается кодом 0).

- [ ] **Step 4: Коммит**

```bash
git add packages/shared/src/library.ts packages/shared/src/index.ts
git commit -m "feat(library): shared-типы сервиса"
```

---

## Task 5: Модуль и разделы каталога

**Files:**
- Create: `apps/api/src/modules/library/library-sections.service.ts`
- Create: `apps/api/src/modules/library/library-sections.controller.ts`
- Create: `apps/api/src/modules/library/library.module.ts`
- Modify: `apps/api/src/app.module.ts:15` (импорт) и `:31` (в массив `imports`)
- Test: `apps/api/src/modules/library/library-sections.service.spec.ts`

**Interfaces:**
- Consumes: `LibrarySectionDto` из Task 4; Prisma-модели из Task 1.
- Produces: `LibrarySectionsService.list(): Promise<LibrarySectionDto[]>`; зарегистрированный `LibraryModule`; маршрут `GET library/sections`.

- [ ] **Step 1: Написать падающий тест**

Создать `apps/api/src/modules/library/library-sections.service.spec.ts`:

```ts
import { LibrarySectionsService } from './library-sections.service';

describe('LibrarySectionsService', () => {
  it('returns sections ordered by position with aggregated counters', async () => {
    const prisma = {
      librarySection: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'section-1',
            slug: 'philosophy',
            titleRu: 'Философия и писания',
            titleEn: 'Philosophy and scriptures',
            descriptionRu: null,
            descriptionEn: null,
            iconKey: 'book',
            position: 1,
            categories: [{ entriesCount: 3 }, { entriesCount: 4 }],
          },
        ]),
      },
      libraryEntry: {
        count: jest.fn().mockResolvedValue(7),
      },
      libraryCategory: {
        count: jest.fn().mockResolvedValue(2),
      },
    };
    const service = new LibrarySectionsService(prisma as never);

    const result = await service.list();

    expect(prisma.librarySection.findMany).toHaveBeenCalledWith({
      orderBy: { position: 'asc' },
    });
    expect(prisma.libraryCategory.count).toHaveBeenCalledWith({
      where: { sectionId: 'section-1', status: 'active' },
    });
    expect(prisma.libraryEntry.count).toHaveBeenCalledWith({
      where: {
        status: 'published',
        categories: {
          some: { category: { sectionId: 'section-1' } },
        },
      },
    });
    expect(result).toEqual([
      {
        id: 'section-1',
        slug: 'philosophy',
        titleRu: 'Философия и писания',
        titleEn: 'Philosophy and scriptures',
        descriptionRu: null,
        descriptionEn: null,
        iconKey: 'book',
        position: 1,
        categoriesCount: 2,
        entriesCount: 7,
      },
    ]);
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @vedamatch/api test -- library-sections`
Expected: FAIL — модуль `./library-sections.service` не найден.

- [ ] **Step 3: Реализовать сервис**

Создать `apps/api/src/modules/library/library-sections.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import type { LibrarySectionDto } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class LibrarySectionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<LibrarySectionDto[]> {
    const sections = await this.prisma.librarySection.findMany({
      orderBy: { position: 'asc' },
    });
    const entriesCounts = await Promise.all(
      sections.map((section) =>
        this.prisma.libraryEntry.count({
          where: {
            status: 'published',
            categories: { some: { category: { sectionId: section.id } } },
          },
        }),
      ),
    );
    const categoriesCounts = await Promise.all(
      sections.map((section) =>
        this.prisma.libraryCategory.count({
          where: { sectionId: section.id, status: 'active' },
        }),
      ),
    );

    return sections.map((section, index) => ({
      id: section.id,
      slug: section.slug,
      titleRu: section.titleRu,
      titleEn: section.titleEn,
      descriptionRu: section.descriptionRu,
      descriptionEn: section.descriptionEn,
      iconKey: section.iconKey,
      position: section.position,
      categoriesCount: categoriesCounts[index],
      entriesCount: entriesCounts[index],
    }));
  }
}
```

- [ ] **Step 4: Реализовать контроллер**

Создать `apps/api/src/modules/library/library-sections.controller.ts`:

```ts
import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { LibrarySectionsService } from './library-sections.service';

@Controller('library/sections')
@UseGuards(AuthGuard)
export class LibrarySectionsController {
  constructor(private readonly sections: LibrarySectionsService) {}

  @Get()
  list() {
    return this.sections.list();
  }
}
```

- [ ] **Step 5: Создать модуль**

Создать `apps/api/src/modules/library/library.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LibrarySectionsController } from './library-sections.controller';
import { LibrarySectionsService } from './library-sections.service';

@Module({
  imports: [AuthModule],
  controllers: [LibrarySectionsController],
  providers: [LibrarySectionsService],
})
export class LibraryModule {}
```

- [ ] **Step 6: Зарегистрировать модуль в `apps/api/src/app.module.ts`**

Добавить импорт после строки с `BillingModule`:

```ts
import { LibraryModule } from './modules/library/library.module';
```

И добавить `LibraryModule,` последним элементом массива `imports` (после `BillingModule,`).

- [ ] **Step 7: Запустить тест и сборку**

Run: `pnpm --filter @vedamatch/api test -- library-sections`
Expected: PASS, 1 тест.

Run: `pnpm --filter @vedamatch/api build`
Expected: сборка без ошибок.

- [ ] **Step 8: Коммит**

```bash
git add apps/api/src/modules/library apps/api/src/app.module.ts
git commit -m "feat(library): модуль сервиса и разделы каталога"
```

---

## Task 6: Категории — подсказка дублей и создание

**Files:**
- Create: `apps/api/src/modules/library/library-categories.service.ts`
- Create: `apps/api/src/modules/library/library-categories.controller.ts`
- Modify: `apps/api/src/modules/library/library.module.ts` (добавить контроллер и сервис)
- Test: `apps/api/src/modules/library/library-categories.service.spec.ts`

**Interfaces:**
- Consumes: `normalizeTitle`, `buildCategorySlug`, `withSlugSuffix` (Task 3); `CreateLibraryCategoryRequest`, `LibraryCategoryDto`, `LibraryCategorySuggestion` (Task 4).
- Produces: `LibraryCategoriesService` с методами `listBySection(sectionSlug: string): Promise<LibraryCategoryDto[]>`, `suggest(query: string): Promise<LibraryCategorySuggestion[]>`, `create(userId: string, body: CreateLibraryCategoryRequest): Promise<LibraryCategoryDto>`. Порог блокировки — экспортируемая константа `SIMILARITY_BLOCK_THRESHOLD = 0.75`.

- [ ] **Step 1: Написать падающий тест**

Создать `apps/api/src/modules/library/library-categories.service.spec.ts`:

```ts
import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import { LibraryCategoriesService } from './library-categories.service';

const SECTION = { id: 'section-1', slug: 'philosophy' };

function prismaMock(overrides: Record<string, unknown> = {}) {
  return {
    librarySection: {
      findUnique: jest.fn().mockResolvedValue(SECTION),
    },
    libraryCategory: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          ...data,
          id: 'category-1',
          entriesCount: 0,
          createdAt: new Date('2026-07-29T10:00:00.000Z'),
          section: SECTION,
        }),
      ),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe('LibraryCategoriesService.create', () => {
  it('requires at least one title', async () => {
    const service = new LibraryCategoriesService(prismaMock() as never);

    await expect(
      service.create('user-1', { sectionId: SECTION.id }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('blocks creation when a similar category exists', async () => {
    const prisma = prismaMock({
      $queryRaw: jest.fn().mockResolvedValue([
        {
          id: 'category-9',
          sectionSlug: 'philosophy',
          slug: 'gita-lectures',
          titleRu: 'Лекции по Гите',
          titleEn: null,
          entriesCount: 12,
          similarity: 0.91,
        },
      ]),
    });
    const service = new LibraryCategoriesService(prisma as never);

    await expect(
      service.create('user-1', {
        sectionId: SECTION.id,
        titleRu: 'Лекции по гите',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(prisma.libraryCategory.create).not.toHaveBeenCalled();
  });

  it('creates the category when the user confirms with force', async () => {
    const prisma = prismaMock({
      $queryRaw: jest.fn().mockResolvedValue([
        {
          id: 'category-9',
          sectionSlug: 'philosophy',
          slug: 'gita-lectures',
          titleRu: 'Лекции по Гите',
          titleEn: null,
          entriesCount: 12,
          similarity: 0.91,
        },
      ]),
    });
    const service = new LibraryCategoriesService(prisma as never);

    const result = await service.create('user-1', {
      sectionId: SECTION.id,
      titleRu: 'Лекции по гите',
      force: true,
    });

    expect(result.slug).toBe('lekcii-po-gite');
    expect(prisma.libraryCategory.create).toHaveBeenCalledTimes(1);
  });

  it('stores normalized titles and the author', async () => {
    const prisma = prismaMock();
    const service = new LibraryCategoriesService(prisma as never);

    await service.create('user-1', {
      sectionId: SECTION.id,
      titleRu: '  Лекции по Гите!  ',
      titleEn: 'Gita Lectures',
    });

    const { data } = prisma.libraryCategory.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(data.normalizedRu).toBe('лекции по гите');
    expect(data.normalizedEn).toBe('gita lectures');
    expect(data.createdById).toBe('user-1');
    expect(data.slug).toBe('gita-lectures');
  });

  it('appends a numeric suffix when the slug is taken in the section', async () => {
    const prisma = prismaMock();
    prisma.libraryCategory.findFirst = jest
      .fn()
      .mockResolvedValueOnce({ id: 'taken' })
      .mockResolvedValueOnce(null);
    const service = new LibraryCategoriesService(prisma as never);

    const result = await service.create('user-1', {
      sectionId: SECTION.id,
      titleEn: 'Gita Lectures',
    });

    expect(result.slug).toBe('gita-lectures-2');
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @vedamatch/api test -- library-categories`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать сервис**

Создать `apps/api/src/modules/library/library-categories.service.ts`:

```ts
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CreateLibraryCategoryConflict,
  CreateLibraryCategoryRequest,
  LibraryCategoryDto,
  LibraryCategorySuggestion,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildCategorySlug,
  normalizeTitle,
  withSlugSuffix,
} from './category-slug';

/** Выше этого сходства создание требует явного подтверждения пользователем. */
export const SIMILARITY_BLOCK_THRESHOLD = 0.75;
/** Порог для подсказок в форме: шире, чтобы показать варианты. */
const SIMILARITY_SUGGEST_THRESHOLD = 0.3;
const MAX_TITLE_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_SLUG_ATTEMPTS = 20;

interface SuggestionRow {
  id: string;
  sectionSlug: string;
  slug: string;
  titleRu: string | null;
  titleEn: string | null;
  entriesCount: number;
  similarity: number;
}

@Injectable()
export class LibraryCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async listBySection(sectionSlug: string): Promise<LibraryCategoryDto[]> {
    const section = await this.prisma.librarySection.findUnique({
      where: { slug: sectionSlug },
    });
    if (!section) throw new NotFoundException('section_not_found');

    const categories = await this.prisma.libraryCategory.findMany({
      where: { sectionId: section.id, status: 'active' },
      orderBy: [{ entriesCount: 'desc' }, { createdAt: 'asc' }],
    });

    return categories.map((category) =>
      toCategoryDto(category, section.slug),
    );
  }

  async suggest(query: string): Promise<LibraryCategorySuggestion[]> {
    const normalized = normalizeTitle(query);
    if (normalized.length < 3) return [];
    return this.findSimilar(normalized, SIMILARITY_SUGGEST_THRESHOLD);
  }

  async create(
    userId: string,
    body: CreateLibraryCategoryRequest,
  ): Promise<LibraryCategoryDto> {
    const titleRu = trimOrNull(body.titleRu);
    const titleEn = trimOrNull(body.titleEn);
    if (!titleRu && !titleEn) {
      throw new BadRequestException('title_required');
    }
    for (const title of [titleRu, titleEn]) {
      if (title && title.length > MAX_TITLE_LENGTH) {
        throw new BadRequestException('title_too_long');
      }
    }
    const descriptionRu = trimOrNull(body.descriptionRu);
    const descriptionEn = trimOrNull(body.descriptionEn);
    for (const description of [descriptionRu, descriptionEn]) {
      if (description && description.length > MAX_DESCRIPTION_LENGTH) {
        throw new BadRequestException('description_too_long');
      }
    }

    const section = await this.prisma.librarySection.findUnique({
      where: { id: body.sectionId },
    });
    if (!section) throw new NotFoundException('section_not_found');

    const normalizedRu = normalizeTitle(titleRu);
    const normalizedEn = normalizeTitle(titleEn);

    if (!body.force) {
      const suggestionGroups = await Promise.all(
        [normalizedRu, normalizedEn]
          .filter((value): value is string => Boolean(value))
          .map((value) =>
            this.findSimilar(value, SIMILARITY_BLOCK_THRESHOLD),
          ),
      );
      const suggestions = [
        ...new Map(
          suggestionGroups
            .flat()
            .map((suggestion) => [suggestion.id, suggestion]),
        ).values(),
      ].sort((left, right) => right.similarity - left.similarity);
      if (suggestions.length > 0) {
        const payload: CreateLibraryCategoryConflict = {
          code: 'similar_category_exists',
          suggestions,
        };
        throw new UnprocessableEntityException(payload);
      }
    }

    const baseSlug = buildCategorySlug({ titleRu, titleEn });
    const slug = await this.findFreeSlug(section.id, baseSlug);

    const created = await this.prisma.libraryCategory.create({
      data: {
        sectionId: section.id,
        slug,
        titleRu,
        titleEn,
        descriptionRu,
        descriptionEn,
        normalizedRu,
        normalizedEn,
        createdById: userId,
      },
    });

    return toCategoryDto(created, section.slug);
  }

  private async findSimilar(
    normalized: string,
    threshold: number,
  ): Promise<LibraryCategorySuggestion[]> {
    if (!normalized) return [];
    const rows = await this.prisma.$queryRaw<SuggestionRow[]>(Prisma.sql`
      SELECT c."id",
             s."slug" AS "sectionSlug",
             c."slug",
             c."titleRu",
             c."titleEn",
             c."entriesCount",
             GREATEST(
               similarity(c."normalizedRu", ${normalized}),
               similarity(c."normalizedEn", ${normalized})
             ) AS "similarity"
      FROM "LibraryCategory" c
      JOIN "LibrarySection" s ON s."id" = c."sectionId"
      WHERE c."status" = 'active'
        AND GREATEST(
              similarity(c."normalizedRu", ${normalized}),
              similarity(c."normalizedEn", ${normalized})
            ) >= ${threshold}
      ORDER BY "similarity" DESC
      LIMIT 5
    `);

    return rows.map((row) => ({
      id: row.id,
      sectionSlug: row.sectionSlug,
      slug: row.slug,
      titleRu: row.titleRu,
      titleEn: row.titleEn,
      entriesCount: Number(row.entriesCount),
      similarity: Number(row.similarity),
    }));
  }

  private async findFreeSlug(
    sectionId: string,
    baseSlug: string,
  ): Promise<string> {
    for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
      const candidate = withSlugSuffix(baseSlug, attempt);
      const taken = await this.prisma.libraryCategory.findFirst({
        where: { sectionId, slug: candidate },
        select: { id: true },
      });
      if (!taken) return candidate;
    }
    throw new BadRequestException('slug_conflict');
  }
}

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function toCategoryDto(
  category: {
    id: string;
    sectionId: string;
    slug: string;
    titleRu: string | null;
    titleEn: string | null;
    descriptionRu: string | null;
    descriptionEn: string | null;
    entriesCount: number;
    createdAt: Date;
  },
  sectionSlug: string,
): LibraryCategoryDto {
  return {
    id: category.id,
    sectionId: category.sectionId,
    sectionSlug,
    slug: category.slug,
    titleRu: category.titleRu,
    titleEn: category.titleEn,
    descriptionRu: category.descriptionRu,
    descriptionEn: category.descriptionEn,
    entriesCount: category.entriesCount,
    createdAt: category.createdAt.toISOString(),
  };
}
```

- [ ] **Step 4: Реализовать контроллер**

Создать `apps/api/src/modules/library/library-categories.controller.ts`:

```ts
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type {
  AccessTokenPayload,
  CreateLibraryCategoryRequest,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { LibraryCategoriesService } from './library-categories.service';

@Controller('library/categories')
@UseGuards(AuthGuard)
export class LibraryCategoriesController {
  constructor(private readonly categories: LibraryCategoriesService) {}

  @Get('suggest')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  suggest(@Query('q') query: string) {
    return this.categories.suggest(query ?? '');
  }

  @Get('section/:sectionSlug')
  listBySection(@Param('sectionSlug') sectionSlug: string) {
    return this.categories.listBySection(sectionSlug);
  }

  @Post()
  @Throttle({ default: { ttl: 3_600_000, limit: 5 } })
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: CreateLibraryCategoryRequest,
  ) {
    return this.categories.create(user.sub, body);
  }
}
```

- [ ] **Step 5: Подключить в модуль**

В `apps/api/src/modules/library/library.module.ts` добавить импорты и записи в массивы:

```ts
import { LibraryCategoriesController } from './library-categories.controller';
import { LibraryCategoriesService } from './library-categories.service';
```

`controllers: [LibrarySectionsController, LibraryCategoriesController],`
`providers: [LibrarySectionsService, LibraryCategoriesService],`

- [ ] **Step 6: Запустить тесты**

Run: `pnpm --filter @vedamatch/api test -- library-categories`
Expected: PASS, 5 тестов.

- [ ] **Step 7: Коммит**

```bash
git add apps/api/src/modules/library
git commit -m "feat(library): создание категорий с защитой от дублей"
```

---

## Task 7: Курсор и запрос ленты

**Files:**
- Create: `apps/api/src/modules/library/library-feed-query.ts`
- Test: `apps/api/src/modules/library/library-feed-query.spec.ts`

**Interfaces:**
- Consumes: `LibraryFeedSort` (Task 4).
- Produces: `encodeCursor(value: { publishedAt: Date; id: string }): string`, `decodeCursor(cursor: string | undefined): { publishedAt: Date; id: string } | null`, `resolveSort(sort: string | undefined): LibraryFeedSort`, `feedOrderBy(sort: LibraryFeedSort): Prisma.LibraryEntryOrderByWithRelationInput[]`. Задача 8 использует их для `findMany`.

В фазе A `resolveSort` разрешает только `new`. Значения `actual` и `popular` из shared-типа принудительно сводятся к `new`; UI их не показывает. Эти сортировки и курсоры по `rankScore` включаются только в фазе B.

- [ ] **Step 1: Написать падающий тест**

Создать `apps/api/src/modules/library/library-feed-query.spec.ts`:

```ts
import {
  decodeCursor,
  encodeCursor,
  feedOrderBy,
  resolveSort,
} from './library-feed-query';

describe('feed cursor', () => {
  it('round-trips publishedAt and id', () => {
    const cursor = encodeCursor({
      publishedAt: new Date('2026-07-29T10:00:00.000Z'),
      id: 'entry-1',
    });

    expect(decodeCursor(cursor)).toEqual({
      publishedAt: new Date('2026-07-29T10:00:00.000Z'),
      id: 'entry-1',
    });
  });

  it.each([undefined, '', 'garbage', 'eyJ4IjoxfQ=='])(
    'returns null for %s instead of throwing',
    (cursor) => {
      expect(decodeCursor(cursor as string | undefined)).toBeNull();
    },
  );
});

describe('resolveSort', () => {
  it('defaults to new in phase A and rejects later-phase sorts', () => {
    expect(resolveSort(undefined)).toBe('new');
    expect(resolveSort('unknown')).toBe('new');
    expect(resolveSort('popular')).toBe('new');
    expect(resolveSort('actual')).toBe('new');
  });
});

describe('feedOrderBy', () => {
  it('always adds id as a tie-breaker for stable pagination', () => {
    expect(feedOrderBy('new')).toEqual([
      { publishedAt: 'desc' },
      { id: 'desc' },
    ]);
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @vedamatch/api test -- library-feed-query`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать код**

Создать `apps/api/src/modules/library/library-feed-query.ts`:

```ts
import { Prisma } from '@prisma/client';
import type { LibraryFeedSort } from '@vedamatch/shared';

const SORTS: LibraryFeedSort[] = ['new'];

export function resolveSort(sort: string | undefined): LibraryFeedSort {
  return SORTS.includes(sort as LibraryFeedSort)
    ? (sort as LibraryFeedSort)
    : 'new';
}

/** `id` вторым ключом — иначе одинаковые значения ломают курсорную пагинацию. */
export function feedOrderBy(
  sort: LibraryFeedSort,
): Prisma.LibraryEntryOrderByWithRelationInput[] {
  return [{ publishedAt: 'desc' }, { id: 'desc' }];
}

export function encodeCursor(value: {
  publishedAt: Date;
  id: string;
}): string {
  return Buffer.from(
    JSON.stringify({ p: value.publishedAt.toISOString(), i: value.id }),
    'utf8',
  ).toString('base64url');
}

export function decodeCursor(
  cursor: string | undefined,
): { publishedAt: Date; id: string } | null {
  if (!cursor) return null;
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw) as { p?: unknown; i?: unknown };
    if (typeof parsed.p !== 'string' || typeof parsed.i !== 'string') {
      return null;
    }
    const publishedAt = new Date(parsed.p);
    if (Number.isNaN(publishedAt.getTime())) return null;
    return { publishedAt, id: parsed.i };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Запустить тест и убедиться, что он проходит**

Run: `pnpm --filter @vedamatch/api test -- library-feed-query`
Expected: PASS, 8 тестов.

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/modules/library/library-feed-query.ts apps/api/src/modules/library/library-feed-query.spec.ts
git commit -m "feat(library): курсорная пагинация и сортировки ленты"
```

---

## Task 8: Ссылки — создание с дубль-409 и лента с фильтрами

**Files:**
- Create: `apps/api/src/modules/library/library-entries.service.ts`
- Create: `apps/api/src/modules/library/library-entries.controller.ts`
- Modify: `apps/api/src/modules/library/library.module.ts`
- Test: `apps/api/src/modules/library/library-entries.service.spec.ts`

**Interfaces:**
- Consumes: `normalizeUrl` (Task 2); `resolveSort`, `feedOrderBy`, `encodeCursor`, `decodeCursor` (Task 7); `CreateLibraryEntryRequest`, `LibraryEntryDto`, `LibraryFeedResponse`, `LibraryDuplicateEntryConflict` (Task 4).
- Produces: `LibraryEntriesService.create(userId, body): Promise<LibraryEntryDto>`, `.feed(filters): Promise<LibraryFeedResponse>`, `.byId(id): Promise<LibraryEntryDto>`; тип `LibraryFeedFilters = { sectionSlug?: string; categorySlug?: string; type?: string; language?: string; sort?: string; q?: string; cursor?: string }`.

- [ ] **Step 1: Написать падающий тест**

Создать `apps/api/src/modules/library/library-entries.service.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { LibraryEntriesService } from './library-entries.service';

const NOW = new Date('2026-07-29T10:00:00.000Z');

function entryRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entry-1',
    url: 'https://example.com/a',
    domain: 'example.com',
    type: 'article',
    contentLanguage: 'ru',
    titleRu: 'Статья',
    titleEn: null,
    descriptionRu: null,
    descriptionEn: null,
    faviconUrl: null,
    previewUrl: null,
    status: 'published',
    usefulCount: 0,
    uniqueClickCount: 0,
    publishedAt: NOW,
    addedBy: { id: 'user-1', name: 'Тест' },
    categories: [],
    ...overrides,
  };
}

function prismaMock(overrides: Record<string, unknown> = {}) {
  const libraryEntry = {
    findUnique: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn().mockResolvedValue(entryRecord()),
  };
  return {
    libraryEntry,
    libraryCategory: {
      findMany: jest.fn().mockResolvedValue([{ id: 'category-1' }]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    libraryEntryCategory: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: jest.fn(
      (callback: (tx: unknown) => unknown) =>
        callback({
          libraryEntry,
          libraryEntryCategory: {
            createMany: jest.fn().mockResolvedValue({ count: 1 }),
          },
          libraryCategory: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
        }) as unknown,
    ),
    $queryRaw: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    url: 'https://example.com/a',
    type: 'article' as const,
    contentLanguage: 'ru',
    titleRu: 'Статья',
    categoryIds: ['category-1'],
    ...overrides,
  };
}

describe('LibraryEntriesService.create', () => {
  it('rejects an overlong url before database access', async () => {
    const prisma = prismaMock();
    const service = new LibraryEntriesService(prisma as never);

    await expect(
      service.create('user-1', validBody({ url: `https://example.com/${'a'.repeat(2000)}` })),
    ).rejects.toMatchObject({ response: 'url_too_long' });
    expect(prisma.libraryEntry.findUnique).not.toHaveBeenCalled();
  });

  it('rejects an unsupported url', async () => {
    const service = new LibraryEntriesService(prismaMock() as never);

    await expect(
      service.create('user-1', validBody({ url: 'ftp://example.com' })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires at least one title', async () => {
    const service = new LibraryEntriesService(prismaMock() as never);

    await expect(
      service.create('user-1', validBody({ titleRu: null, titleEn: null })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires at least one category', async () => {
    const service = new LibraryEntriesService(prismaMock() as never);

    await expect(
      service.create('user-1', validBody({ categoryIds: [] })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns 409 with the existing entry for a duplicate url', async () => {
    const prisma = prismaMock();
    prisma.libraryEntry.findUnique = jest
      .fn()
      .mockResolvedValue(entryRecord({ id: 'existing' }));
    const service = new LibraryEntriesService(prisma as never);

    await expect(
      service.create(
        'user-1',
        validBody({ url: 'https://WWW.example.com/a/?utm_source=x' }),
      ),
    ).rejects.toMatchObject({
      status: 409,
      response: {
        code: 'entry_already_exists',
        entry: expect.objectContaining({ id: 'existing' }),
      },
    });
  });

  it('stores the normalized url and domain', async () => {
    const prisma = prismaMock();
    const service = new LibraryEntriesService(prisma as never);

    await service.create(
      'user-1',
      validBody({ url: 'https://WWW.Example.com/a/?utm_source=x' }),
    );

    const { data } = prisma.libraryEntry.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(data.urlNormalized).toBe('https://example.com/a');
    expect(data.domain).toBe('example.com');
    expect(data.url).toBe('https://WWW.Example.com/a/?utm_source=x');
    expect(data.addedById).toBe('user-1');
    expect(data.enrichmentStatus).toBe('pending');
  });

  it('rejects category ids that do not exist', async () => {
    const prisma = prismaMock();
    prisma.libraryCategory.findMany = jest.fn().mockResolvedValue([]);
    const service = new LibraryEntriesService(prisma as never);

    await expect(
      service.create('user-1', validBody()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('LibraryEntriesService.feed', () => {
  it('filters published entries by type and language', async () => {
    const prisma = prismaMock();
    const service = new LibraryEntriesService(prisma as never);

    await service.feed({ type: 'video', language: 'en' });

    const args = prisma.libraryEntry.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
      take: number;
    };
    expect(args.where).toMatchObject({
      status: 'published',
      type: 'video',
      contentLanguage: 'en',
    });
    expect(args.take).toBe(21);
  });

  it('returns nextCursor only when a full page was fetched', async () => {
    const prisma = prismaMock();
    prisma.libraryEntry.findMany = jest
      .fn()
      .mockResolvedValue(
        Array.from({ length: 21 }, (_, index) =>
          entryRecord({ id: `entry-${index}` }),
        ),
      );
    const service = new LibraryEntriesService(prisma as never);

    const result = await service.feed({});

    expect(result.items).toHaveLength(20);
    expect(result.nextCursor).not.toBeNull();
  });

  it('ignores a broken cursor instead of failing', async () => {
    const prisma = prismaMock();
    const service = new LibraryEntriesService(prisma as never);

    const result = await service.feed({ cursor: 'garbage' });

    expect(result.items).toEqual([]);
    expect(result.nextCursor).toBeNull();
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @vedamatch/api test -- library-entries`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать сервис**

Создать `apps/api/src/modules/library/library-entries.service.ts`:

```ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CreateLibraryEntryRequest,
  LibraryDuplicateEntryConflict,
  LibraryEntryDto,
  LibraryEntryType,
  LibraryFeedResponse,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  decodeCursor,
  encodeCursor,
  feedOrderBy,
  resolveSort,
} from './library-feed-query';
import { normalizeUrl } from './url-normalize';

const PAGE_SIZE = 20;
const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_CATEGORIES = 5;
const ENTRY_TYPES: LibraryEntryType[] = [
  'website',
  'article',
  'video',
  'audio',
  'book',
  'course',
  'app',
  'telegram_channel',
  'community',
  'other',
];

export interface LibraryFeedFilters {
  sectionSlug?: string;
  categorySlug?: string;
  type?: string;
  language?: string;
  sort?: string;
  q?: string;
  cursor?: string;
}

const ENTRY_SELECT = {
  id: true,
  url: true,
  domain: true,
  type: true,
  contentLanguage: true,
  titleRu: true,
  titleEn: true,
  descriptionRu: true,
  descriptionEn: true,
  faviconUrl: true,
  previewUrl: true,
  status: true,
  usefulCount: true,
  uniqueClickCount: true,
  publishedAt: true,
  addedBy: { select: { id: true, name: true } },
  categories: {
    select: {
      category: {
        select: {
          id: true,
          slug: true,
          titleRu: true,
          titleEn: true,
          section: { select: { slug: true } },
        },
      },
    },
  },
} satisfies Prisma.LibraryEntrySelect;

@Injectable()
export class LibraryEntriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: string,
    body: CreateLibraryEntryRequest,
  ): Promise<LibraryEntryDto> {
    if (!body.url || body.url.length > 2000) {
      throw new BadRequestException('url_too_long');
    }
    let normalized: ReturnType<typeof normalizeUrl>;
    try {
      normalized = normalizeUrl(body.url ?? '');
    } catch {
      throw new BadRequestException('unsupported_url');
    }

    if (!ENTRY_TYPES.includes(body.type)) {
      throw new BadRequestException('unsupported_type');
    }

    const titleRu = trimOrNull(body.titleRu);
    const titleEn = trimOrNull(body.titleEn);
    if (!titleRu && !titleEn) throw new BadRequestException('title_required');
    for (const title of [titleRu, titleEn]) {
      if (title && title.length > MAX_TITLE_LENGTH) {
        throw new BadRequestException('title_too_long');
      }
    }

    const descriptionRu = trimOrNull(body.descriptionRu);
    const descriptionEn = trimOrNull(body.descriptionEn);
    for (const description of [descriptionRu, descriptionEn]) {
      if (description && description.length > MAX_DESCRIPTION_LENGTH) {
        throw new BadRequestException('description_too_long');
      }
    }

    const categoryIds = [...new Set(body.categoryIds ?? [])];
    if (categoryIds.length === 0) {
      throw new BadRequestException('category_required');
    }
    if (categoryIds.length > MAX_CATEGORIES) {
      throw new BadRequestException('too_many_categories');
    }

    const existing = await this.prisma.libraryEntry.findUnique({
      where: { urlNormalized: normalized.normalized },
      select: ENTRY_SELECT,
    });
    if (existing) {
      const payload: LibraryDuplicateEntryConflict = {
        code: 'entry_already_exists',
        entry: toEntryDto(existing),
      };
      throw new ConflictException(payload);
    }

    const categories = await this.prisma.libraryCategory.findMany({
      where: { id: { in: categoryIds }, status: 'active' },
      select: { id: true },
    });
    if (categories.length !== categoryIds.length) {
      throw new BadRequestException('category_not_found');
    }

    const language = normalizeLanguage(body.contentLanguage);

    const created = await this.prisma.$transaction(async (tx) => {
      const entry = await tx.libraryEntry.create({
        data: {
          url: normalized.url,
          urlNormalized: normalized.normalized,
          domain: normalized.domain,
          type: body.type,
          contentLanguage: language,
          titleRu,
          titleEn,
          descriptionRu,
          descriptionEn,
          addedById: userId,
          enrichmentStatus: 'pending',
        },
        select: ENTRY_SELECT,
      });
      await tx.libraryEntryCategory.createMany({
        data: categoryIds.map((categoryId) => ({
          entryId: entry.id,
          categoryId,
          addedById: userId,
        })),
      });
      await tx.libraryCategory.updateMany({
        where: { id: { in: categoryIds } },
        data: { entriesCount: { increment: 1 } },
      });
      return entry;
    });

    return toEntryDto(created);
  }

  async feed(filters: LibraryFeedFilters): Promise<LibraryFeedResponse> {
    const sort = resolveSort(filters.sort);
    const cursor = decodeCursor(filters.cursor);
    const where: Prisma.LibraryEntryWhereInput = { status: 'published' };

    if (filters.type && ENTRY_TYPES.includes(filters.type as LibraryEntryType)) {
      where.type = filters.type as LibraryEntryType;
    }
    if (filters.language) {
      where.contentLanguage = normalizeLanguage(filters.language);
    }
    if (filters.categorySlug) {
      where.categories = { some: { category: { slug: filters.categorySlug } } };
    } else if (filters.sectionSlug) {
      where.categories = {
        some: { category: { section: { slug: filters.sectionSlug } } },
      };
    }
    if (cursor && sort === 'new') {
      where.OR = [
        { publishedAt: { lt: cursor.publishedAt } },
        { publishedAt: cursor.publishedAt, id: { lt: cursor.id } },
      ];
    }

    const searchIds = await this.searchIds(filters.q);
    if (searchIds) {
      if (searchIds.length === 0) {
        return { items: [], nextCursor: null, total: 0 };
      }
      where.id = { in: searchIds };
    }

    const [rows, total] = await Promise.all([
      this.prisma.libraryEntry.findMany({
        where,
        orderBy: feedOrderBy(sort),
        take: PAGE_SIZE + 1,
        select: ENTRY_SELECT,
      }),
      this.prisma.libraryEntry.count({ where }),
    ]);

    const hasMore = rows.length > PAGE_SIZE;
    const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
    const last = page.at(-1);

    return {
      items: page.map(toEntryDto),
      nextCursor:
        hasMore && last
          ? encodeCursor({ publishedAt: last.publishedAt, id: last.id })
          : null,
      total,
    };
  }

  async byId(id: string): Promise<LibraryEntryDto> {
    const entry = await this.prisma.libraryEntry.findUnique({
      where: { id },
      select: ENTRY_SELECT,
    });
    if (!entry || entry.status !== 'published') {
      throw new NotFoundException('entry_not_found');
    }
    return toEntryDto(entry);
  }

  /** `null` — поиска нет; массив — найденные id в порядке релевантности. */
  private async searchIds(query: string | undefined): Promise<string[] | null> {
    const trimmed = query?.trim();
    if (!trimmed || trimmed.length < 2) return null;
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "LibraryEntry"
      WHERE "status" = 'published'
        AND "searchVector" @@ (
          plainto_tsquery('russian', ${trimmed}) ||
          plainto_tsquery('english', ${trimmed})
        )
      ORDER BY ts_rank(
        "searchVector",
        plainto_tsquery('russian', ${trimmed}) ||
        plainto_tsquery('english', ${trimmed})
      ) DESC
      LIMIT 200
    `);
    return rows.map((row) => row.id);
  }
}

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeLanguage(value: string | undefined): string {
  const normalized = value?.trim().toLowerCase().slice(0, 8);
  return normalized || 'ru';
}

type EntryRow = Prisma.LibraryEntryGetPayload<{ select: typeof ENTRY_SELECT }>;

function toEntryDto(entry: EntryRow): LibraryEntryDto {
  return {
    id: entry.id,
    url: entry.url,
    domain: entry.domain,
    type: entry.type,
    contentLanguage: entry.contentLanguage,
    titleRu: entry.titleRu,
    titleEn: entry.titleEn,
    descriptionRu: entry.descriptionRu,
    descriptionEn: entry.descriptionEn,
    faviconUrl: entry.faviconUrl,
    previewUrl: entry.previewUrl,
    status: entry.status,
    usefulCount: entry.usefulCount,
    uniqueClickCount: entry.uniqueClickCount,
    publishedAt: entry.publishedAt.toISOString(),
    categories: entry.categories.map((link) => ({
      id: link.category.id,
      slug: link.category.slug,
      sectionSlug: link.category.section.slug,
      titleRu: link.category.titleRu,
      titleEn: link.category.titleEn,
    })),
    addedBy: entry.addedBy
      ? { id: entry.addedBy.id, name: entry.addedBy.name }
      : null,
  };
}
```

Примечание для реализующего: в тесте `feed` мок возвращает записи с полем `categories: []`, поэтому `toEntryDto` должен спокойно работать с пустым массивом — так и есть.

- [ ] **Step 4: Реализовать контроллер**

Создать `apps/api/src/modules/library/library-entries.controller.ts`:

```ts
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type {
  AccessTokenPayload,
  CreateLibraryEntryRequest,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import {
  LibraryEntriesService,
  type LibraryFeedFilters,
} from './library-entries.service';

@Controller('library/entries')
@UseGuards(AuthGuard)
export class LibraryEntriesController {
  constructor(private readonly entries: LibraryEntriesService) {}

  @Get()
  feed(@Query() query: LibraryFeedFilters) {
    return this.entries.feed(query);
  }

  @Get(':id')
  byId(@Param('id') id: string) {
    return this.entries.byId(id);
  }

  @Post()
  @Throttle({ default: { ttl: 3_600_000, limit: 20 } })
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: CreateLibraryEntryRequest,
  ) {
    return this.entries.create(user.sub, body);
  }
}
```

- [ ] **Step 5: Подключить в модуль**

В `library.module.ts` добавить `LibraryEntriesController` в `controllers` и `LibraryEntriesService` в `providers` с соответствующими импортами.

- [ ] **Step 6: Запустить тесты и сборку**

Run: `pnpm --filter @vedamatch/api test -- library-entries`
Expected: PASS, 9 тестов.

Run: `pnpm --filter @vedamatch/api build`
Expected: без ошибок.

- [ ] **Step 7: Коммит**

```bash
git add apps/api/src/modules/library
git commit -m "feat(library): добавление ссылок и лента с фильтрами"
```

---

## Task 9: Язык интерфейса пользователя

**Files:**
- Create: `apps/api/src/modules/library/library-preferences.service.ts`
- Create: `apps/api/src/modules/library/library-preferences.controller.ts`
- Modify: `apps/api/src/modules/library/library.module.ts`
- Test: `apps/api/src/modules/library/library-preferences.service.spec.ts`

**Interfaces:**
- Consumes: `LibraryPreferencesDto`, `UpdateLibraryPreferencesRequest`, `LibraryLocale` (Task 4).
- Produces: `LibraryPreferencesService.get(userId): Promise<LibraryPreferencesDto>`, `.update(userId, body): Promise<LibraryPreferencesDto>`. Маршруты `GET library/me/preferences`, `PATCH library/me/preferences`.

- [ ] **Step 1: Написать падающий тест**

Создать `apps/api/src/modules/library/library-preferences.service.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { LibraryPreferencesService } from './library-preferences.service';

function prismaMock() {
  return {
    libraryPreference: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockImplementation(({ create }: { create: Record<string, unknown> }) =>
        Promise.resolve({ uiLanguage: 'en', contentLanguages: [], ...create }),
      ),
    },
  };
}

describe('LibraryPreferencesService', () => {
  it('defaults to russian when the user has no row yet', async () => {
    const service = new LibraryPreferencesService(prismaMock() as never);

    await expect(service.get('user-1')).resolves.toEqual({
      uiLanguage: 'ru',
      contentLanguages: [],
    });
  });

  it('rejects an unsupported ui language', async () => {
    const service = new LibraryPreferencesService(prismaMock() as never);

    await expect(
      service.update('user-1', { uiLanguage: 'de' as never }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('upserts the chosen locale', async () => {
    const prisma = prismaMock();
    const service = new LibraryPreferencesService(prisma as never);

    const result = await service.update('user-1', { uiLanguage: 'en' });

    expect(prisma.libraryPreference.upsert).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      create: { userId: 'user-1', uiLanguage: 'en', contentLanguages: [] },
      update: { uiLanguage: 'en' },
    });
    expect(result.uiLanguage).toBe('en');
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @vedamatch/api test -- library-preferences`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать сервис**

Создать `apps/api/src/modules/library/library-preferences.service.ts`:

```ts
import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  LibraryLocale,
  LibraryPreferencesDto,
  UpdateLibraryPreferencesRequest,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';

const LOCALES: LibraryLocale[] = ['ru', 'en'];
const MAX_CONTENT_LANGUAGES = 8;

@Injectable()
export class LibraryPreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string): Promise<LibraryPreferencesDto> {
    const row = await this.prisma.libraryPreference.findUnique({
      where: { userId },
    });
    return {
      uiLanguage: toLocale(row?.uiLanguage),
      contentLanguages: row?.contentLanguages ?? [],
    };
  }

  async update(
    userId: string,
    body: UpdateLibraryPreferencesRequest,
  ): Promise<LibraryPreferencesDto> {
    if (body.uiLanguage && !LOCALES.includes(body.uiLanguage)) {
      throw new BadRequestException('unsupported_locale');
    }
    if (body.contentLanguages) {
      if (body.contentLanguages.length > MAX_CONTENT_LANGUAGES) {
        throw new BadRequestException('too_many_languages');
      }
      if (body.contentLanguages.some((value) => value.length > 8)) {
        throw new BadRequestException('unsupported_language');
      }
    }

    const update: Record<string, unknown> = {};
    if (body.uiLanguage) update.uiLanguage = body.uiLanguage;
    if (body.contentLanguages) update.contentLanguages = body.contentLanguages;

    const row = await this.prisma.libraryPreference.upsert({
      where: { userId },
      create: {
        userId,
        uiLanguage: body.uiLanguage ?? 'ru',
        contentLanguages: body.contentLanguages ?? [],
      },
      update,
    });

    return {
      uiLanguage: toLocale(row.uiLanguage),
      contentLanguages: row.contentLanguages,
    };
  }
}

function toLocale(value: string | undefined): LibraryLocale {
  return value === 'en' ? 'en' : 'ru';
}
```

- [ ] **Step 4: Реализовать контроллер**

Создать `apps/api/src/modules/library/library-preferences.controller.ts`:

```ts
import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import type {
  AccessTokenPayload,
  UpdateLibraryPreferencesRequest,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { LibraryPreferencesService } from './library-preferences.service';

@Controller('library/me/preferences')
@UseGuards(AuthGuard)
export class LibraryPreferencesController {
  constructor(private readonly preferences: LibraryPreferencesService) {}

  @Get()
  get(@CurrentUser() user: AccessTokenPayload) {
    return this.preferences.get(user.sub);
  }

  @Patch()
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: UpdateLibraryPreferencesRequest,
  ) {
    return this.preferences.update(user.sub, body);
  }
}
```

- [ ] **Step 5: Подключить в модуль и проверить итоговый вид `library.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LibraryCategoriesController } from './library-categories.controller';
import { LibraryCategoriesService } from './library-categories.service';
import { LibraryEntriesController } from './library-entries.controller';
import { LibraryEntriesService } from './library-entries.service';
import { LibraryPreferencesController } from './library-preferences.controller';
import { LibraryPreferencesService } from './library-preferences.service';
import { LibrarySectionsController } from './library-sections.controller';
import { LibrarySectionsService } from './library-sections.service';

@Module({
  imports: [AuthModule],
  controllers: [
    LibrarySectionsController,
    LibraryCategoriesController,
    LibraryEntriesController,
    LibraryPreferencesController,
  ],
  providers: [
    LibrarySectionsService,
    LibraryCategoriesService,
    LibraryEntriesService,
    LibraryPreferencesService,
  ],
})
export class LibraryModule {}
```

- [ ] **Step 6: Запустить все тесты модуля**

Run: `pnpm --filter @vedamatch/api test -- library`
Expected: PASS, все спеки сервиса (schema, url-normalize, category-slug, sections, categories, feed-query, entries, preferences).

- [ ] **Step 7: Коммит**

```bash
git add apps/api/src/modules/library
git commit -m "feat(library): язык интерфейса сервиса в LibraryPreference"
```

---

## Task 10: Seed — сервис и восемь разделов

**Files:**
- Create: `apps/api/prisma/library-sections-data.js`
- Modify: `apps/api/prisma/seed.ts:5-60` (массив `services`), `:63-80` (main)
- Modify: `apps/api/prisma/seed.cjs` (те же правки в CommonJS-варианте)
- Test: `apps/api/src/modules/library/library-seed-data.spec.ts`

**Interfaces:**
- Consumes: модели Task 1.
- Produces: запись `Service` со `slug: 'library'` и восемь `LibrarySection`. Экспортируемый из seed массив не нужен — тест проверяет данные через отдельный модуль `apps/api/prisma/library-sections-data.js`, который подключают оба seed-файла.

- [ ] **Step 1: Написать падающий тест**

Создать `apps/api/src/modules/library/library-seed-data.spec.ts`:

```ts
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
const {
  librarySections,
} = require('../../../prisma/library-sections-data.js') as {
  librarySections: Array<{
    slug: string;
    titleRu: string;
    titleEn: string;
    position: number;
  }>;
};

describe('library seed sections', () => {
  it('defines eight starter sections', () => {
    expect(librarySections).toHaveLength(8);
  });

  it('keeps slugs unique and positions sequential', () => {
    const slugs = librarySections.map((section) => section.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(librarySections.map((section) => section.position)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
  });

  it('provides both russian and english titles', () => {
    for (const section of librarySections) {
      expect(section.titleRu.length).toBeGreaterThan(0);
      expect(section.titleEn.length).toBeGreaterThan(0);
    }
  });
});
```

Файл находится в `src`, потому что Jest API использует `rootDir: src`; данные подключаются относительным путём:

```ts
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
const {
  librarySections,
} = require('../../../prisma/library-sections-data.js') as {
  librarySections: Array<{
    slug: string;
    titleRu: string;
    titleEn: string;
    position: number;
  }>;
};
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @vedamatch/api test -- library-seed-data`
Expected: FAIL — `Cannot find module '../../../prisma/library-sections-data.js'`.

- [ ] **Step 3: Создать общий модуль данных разделов**

Создать `apps/api/prisma/library-sections-data.js`:

```js
const librarySections = [
  {
    slug: 'philosophy',
    titleRu: 'Философия и писания',
    titleEn: 'Philosophy and scriptures',
    iconKey: 'book-open',
    position: 1,
  },
  {
    slug: 'practice',
    titleRu: 'Практика и садхана',
    titleEn: 'Practice and sadhana',
    iconKey: 'sunrise',
    position: 2,
  },
  {
    slug: 'lectures',
    titleRu: 'Лекции и видео',
    titleEn: 'Lectures and video',
    iconKey: 'play-circle',
    position: 3,
  },
  {
    slug: 'music',
    titleRu: 'Музыка и киртан',
    titleEn: 'Music and kirtan',
    iconKey: 'music',
    position: 4,
  },
  {
    slug: 'health',
    titleRu: 'Здоровье и аюрведа',
    titleEn: 'Health and Ayurveda',
    iconKey: 'heart-pulse',
    position: 5,
  },
  {
    slug: 'education',
    titleRu: 'Обучение и курсы',
    titleEn: 'Education and courses',
    iconKey: 'graduation-cap',
    position: 6,
  },
  {
    slug: 'communities',
    titleRu: 'Общины и храмы',
    titleEn: 'Communities and temples',
    iconKey: 'users',
    position: 7,
  },
  {
    slug: 'tools',
    titleRu: 'Инструменты и приложения',
    titleEn: 'Tools and apps',
    iconKey: 'wrench',
    position: 8,
  },
];

module.exports = { librarySections };
```

- [ ] **Step 4: Добавить сервис и разделы в `apps/api/prisma/seed.cjs`**

В начало файла после `const prisma = new PrismaClient();`:

```js
const { librarySections } = require('./library-sections-data.js');
```

В массив `services` добавить элемент:

```js
  {
    slug: 'library',
    name: 'Библиотека ссылок',
    description: 'Общая база полезных материалов: статьи, видео, книги, курсы и каналы',
    url: '/library',
    status: 'coming_soon',
    category: 'knowledge',
    public: true,
    seekerVisible: true,
    practitionerVisible: true,
    yogiVisible: true,
    devoteeSelfIdentifiedVisible: true,
    devoteeVerifiedVisible: true,
  },
```

Внутри `prisma.$transaction` после цикла по сервисам добавить:

```js
    for (const section of librarySections) {
      await transaction.librarySection.upsert({
        where: { slug: section.slug },
        update: section,
        create: section,
      });
    }
```

И расширить лог:

```js
  console.log(
    `Seeded ${services.length} services and ${librarySections.length} library sections`,
  );
```

- [ ] **Step 5: Повторить те же правки в `apps/api/prisma/seed.ts`**

Импорт в TypeScript-варианте:

```ts
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { librarySections } = require('./library-sections-data.js') as {
  librarySections: Array<{
    slug: string;
    titleRu: string;
    titleEn: string;
    iconKey: string;
    position: number;
  }>;
};
```

Элемент сервиса такой же, но со `status: 'coming_soon' as const`. Блок upsert разделов и лог идентичны.

- [ ] **Step 6: Запустить тест и seed**

Run: `pnpm --filter @vedamatch/api test -- library-seed-data`
Expected: PASS, 3 теста.

Run: `pnpm --filter @vedamatch/api seed`
Expected: `Seeded 5 services and 8 library sections`.

- [ ] **Step 7: Коммит**

```bash
git add apps/api/prisma apps/api/src/modules/library/library-seed-data.spec.ts
git commit -m "feat(library): seed сервиса и стартовых разделов"
```

---

## Task 11: Словарь i18n и выбор языка контента

**Files:**
- Create: `apps/web/src/components/library/i18n.ts`
- Test: `apps/web/src/components/library/i18n.spec.ts`

**Interfaces:**
- Consumes: `LibraryLocale`, `LibraryEntryType` (Task 4).
- Produces: `libraryDictionary: Record<LibraryLocale, LibraryDictionary>`, `t(locale, key): string`, `pickLocalized(locale, value: { ru: string | null; en: string | null }): string`, `entryTypeLabel(locale, type): string`. Все веб-задачи берут строки только отсюда.

- [ ] **Step 1: Написать падающий тест**

Создать `apps/web/src/components/library/i18n.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import { entryTypeLabel, pickLocalized, t } from "./i18n";

describe("pickLocalized", () => {
  it("prefers the current locale", () => {
    expect(pickLocalized("en", { ru: "Статья", en: "Article" })).toBe("Article");
    expect(pickLocalized("ru", { ru: "Статья", en: "Article" })).toBe("Статья");
  });

  it("falls back to the other language instead of showing nothing", () => {
    expect(pickLocalized("en", { ru: "Статья", en: null })).toBe("Статья");
    expect(pickLocalized("ru", { ru: null, en: "Article" })).toBe("Article");
  });

  it("returns an empty string when both are missing", () => {
    expect(pickLocalized("ru", { ru: null, en: null })).toBe("");
  });
});

describe("t", () => {
  it("returns localized ui strings", () => {
    expect(t("ru", "feed.empty")).toBe("Пока ничего не добавлено");
    expect(t("en", "feed.empty")).toBe("Nothing here yet");
  });

  it("falls back to the key when a translation is missing", () => {
    expect(t("en", "missing.key" as never)).toBe("missing.key");
  });
});

describe("entryTypeLabel", () => {
  it("localizes every entry type", () => {
    expect(entryTypeLabel("ru", "video")).toBe("Видео");
    expect(entryTypeLabel("en", "telegram_channel")).toBe("Telegram channel");
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @vedamatch/web test i18n`
Expected: FAIL — `Failed to resolve import "./i18n"`.

- [ ] **Step 3: Реализовать словарь**

Создать `apps/web/src/components/library/i18n.ts`:

```ts
import type { LibraryEntryType, LibraryLocale } from "@vedamatch/shared";

const ui = {
  ru: {
    "service.title": "Библиотека ссылок",
    "service.subtitle":
      "Общая база полезных материалов: пополняйте её и находите нужное быстрее",
    "nav.sections": "Разделы",
    "nav.add": "Добавить ссылку",
    "filters.title": "Фильтры",
    "filters.section": "Раздел",
    "filters.category": "Категория",
    "filters.type": "Тип материала",
    "filters.language": "Язык материала",
    "filters.sort": "Сортировка",
    "filters.search": "Поиск",
    "filters.reset": "Сбросить",
    "filters.all": "Все",
    "sort.new": "Новое",
    "sort.actual": "Актуальное",
    "sort.popular": "Популярное",
    "feed.empty": "Пока ничего не добавлено",
    "feed.more": "Показать ещё",
    "feed.loading": "Загружаем…",
    "entry.open": "Открыть",
    "entry.addedBy": "Добавил",
    "entry.categories": "Категории",
    "entry.useful": "Полезно",
    "entry.clicks": "Переходов",
    "entry.notFound": "Ссылка не найдена",
    "add.title": "Добавить ссылку",
    "add.url": "Адрес ссылки",
    "add.type": "Тип материала",
    "add.language": "Язык материала",
    "add.titleRu": "Заголовок по-русски",
    "add.titleEn": "Заголовок по-английски",
    "add.descriptionRu": "Описание по-русски",
    "add.descriptionEn": "Описание по-английски",
    "add.categories": "Категории",
    "add.submit": "Добавить",
    "add.titleRequired": "Заполните заголовок хотя бы на одном языке",
    "add.categoryRequired": "Выберите хотя бы одну категорию",
    "add.duplicate": "Такая ссылка уже есть в библиотеке",
    "add.duplicateOpen": "Открыть существующую запись",
    "add.unsupportedUrl": "Ссылка должна начинаться с http:// или https://",
    "add.failed": "Не удалось добавить ссылку, попробуйте позже",
    "category.create": "Создать категорию",
    "category.titleRu": "Название по-русски",
    "category.titleEn": "Название по-английски",
    "category.similar": "Похожие категории уже есть",
    "category.similarHint":
      "Проверьте список: возможно, нужная категория уже создана",
    "category.forceCreate": "Всё равно создать новую",
    "category.empty": "В этом разделе ещё нет категорий",
    "category.entries": "материалов",
    "locale.switch": "Язык интерфейса",
  },
  en: {
    "service.title": "Links library",
    "service.subtitle":
      "A shared base of useful materials: contribute and find things faster",
    "nav.sections": "Sections",
    "nav.add": "Add a link",
    "filters.title": "Filters",
    "filters.section": "Section",
    "filters.category": "Category",
    "filters.type": "Material type",
    "filters.language": "Material language",
    "filters.sort": "Sorting",
    "filters.search": "Search",
    "filters.reset": "Reset",
    "filters.all": "All",
    "sort.new": "Newest",
    "sort.actual": "Trending",
    "sort.popular": "Popular",
    "feed.empty": "Nothing here yet",
    "feed.more": "Show more",
    "feed.loading": "Loading…",
    "entry.open": "Open",
    "entry.addedBy": "Added by",
    "entry.categories": "Categories",
    "entry.useful": "Useful",
    "entry.clicks": "Clicks",
    "entry.notFound": "Link not found",
    "add.title": "Add a link",
    "add.url": "Link address",
    "add.type": "Material type",
    "add.language": "Material language",
    "add.titleRu": "Russian title",
    "add.titleEn": "English title",
    "add.descriptionRu": "Russian description",
    "add.descriptionEn": "English description",
    "add.categories": "Categories",
    "add.submit": "Add",
    "add.titleRequired": "Fill in the title in at least one language",
    "add.categoryRequired": "Pick at least one category",
    "add.duplicate": "This link is already in the library",
    "add.duplicateOpen": "Open the existing entry",
    "add.unsupportedUrl": "The link must start with http:// or https://",
    "add.failed": "Could not add the link, please try again later",
    "category.create": "Create a category",
    "category.titleRu": "Russian name",
    "category.titleEn": "English name",
    "category.similar": "Similar categories already exist",
    "category.similarHint":
      "Check the list: the category you need may already be there",
    "category.forceCreate": "Create a new one anyway",
    "category.empty": "This section has no categories yet",
    "category.entries": "materials",
    "locale.switch": "Interface language",
  },
} as const;

export type LibraryTextKey = keyof (typeof ui)["ru"];

const entryTypes: Record<LibraryLocale, Record<LibraryEntryType, string>> = {
  ru: {
    website: "Сайт",
    article: "Статья",
    video: "Видео",
    audio: "Аудио",
    book: "Книга",
    course: "Курс",
    app: "Приложение",
    telegram_channel: "Telegram-канал",
    community: "Община",
    other: "Другое",
  },
  en: {
    website: "Website",
    article: "Article",
    video: "Video",
    audio: "Audio",
    book: "Book",
    course: "Course",
    app: "App",
    telegram_channel: "Telegram channel",
    community: "Community",
    other: "Other",
  },
};

export const libraryDictionary = ui;

export function t(locale: LibraryLocale, key: LibraryTextKey): string {
  return ui[locale][key] ?? key;
}

/** Контент показываем на текущем языке, но пустоту не показываем никогда. */
export function pickLocalized(
  locale: LibraryLocale,
  value: { ru: string | null; en: string | null },
): string {
  const primary = locale === "en" ? value.en : value.ru;
  const fallback = locale === "en" ? value.ru : value.en;
  return primary?.trim() || fallback?.trim() || "";
}

export function entryTypeLabel(
  locale: LibraryLocale,
  type: LibraryEntryType,
): string {
  return entryTypes[locale][type];
}
```

- [ ] **Step 4: Запустить тест и убедиться, что он проходит**

Run: `pnpm --filter @vedamatch/web test i18n`
Expected: PASS, 6 тестов.

- [ ] **Step 5: Коммит**

```bash
git add apps/web/src/components/library/i18n.ts apps/web/src/components/library/i18n.spec.ts
git commit -m "feat(library): словарь интерфейса ru/en"
```

---

## Task 12: Server-side API-клиент сервиса

**Files:**
- Create: `apps/web/src/lib/library-api.ts`
- Create: `apps/web/src/lib/library-query.ts`
- Test: `apps/web/src/lib/library-query.spec.ts`

**Interfaces:**
- Consumes: типы Task 4.
- Produces: `getLibrarySections()`, `getLibraryCategories(sectionSlug)`, `getLibraryFeed(params)`, `getLibraryEntry(id)`, `getLibraryPreferences()` и чистый helper `buildLibraryQuery(params)` из `library-query.ts`. API-функции возвращают `null` при 401/404, как в `union-api.ts`.

- [ ] **Step 1: Написать падающий тест на сборку query-строки**

Создать `apps/web/src/lib/library-query.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildLibraryQuery } from "./library-query";

describe("buildLibraryQuery", () => {
  it("keeps only filled values and takes the first of arrays", () => {
    expect(
      buildLibraryQuery({
        type: "video",
        language: "",
        sort: undefined,
        categorySlug: ["philosophy", "extra"],
      }),
    ).toBe("?type=video&categorySlug=philosophy");
  });

  it("returns an empty string when there is nothing to send", () => {
    expect(buildLibraryQuery({})).toBe("");
    expect(buildLibraryQuery(undefined)).toBe("");
  });

  it("encodes values", () => {
    expect(buildLibraryQuery({ q: "бхагавад гита" })).toBe(
      "?q=%D0%B1%D1%85%D0%B0%D0%B3%D0%B0%D0%B2%D0%B0%D0%B4+%D0%B3%D0%B8%D1%82%D0%B0",
    );
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @vedamatch/web test library-query`
Expected: FAIL — модуль `./library-query` не найден.

- [ ] **Step 3: Реализовать query helper**

Создать `apps/web/src/lib/library-query.ts`:

```ts
export function buildLibraryQuery(
  params?: Record<string, string | string[] | undefined>,
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first) query.set(key, first);
  }
  const encoded = query.toString();
  return encoded ? `?${encoded}` : "";
}
```

- [ ] **Step 4: Реализовать клиент**

Создать `apps/web/src/lib/library-api.ts`:

```ts
// API-клиент сервиса Library. См. docs/service-module-contract.md
import { cookies } from "next/headers";
import type {
  LibraryCategoryDto,
  LibraryEntryDto,
  LibraryFeedResponse,
  LibraryPreferencesDto,
  LibrarySectionDto,
} from "@vedamatch/shared";
import { buildLibraryQuery } from "./library-query";

const API_URL = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

/** Server-side запрос к Library API с access_token из cookie. null — нет доступа. */
async function libraryGet<T>(path: string): Promise<T | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value;
  if (!token) return null;

  const res = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (res.status === 401) return null;
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

export const getLibrarySections = () =>
  libraryGet<LibrarySectionDto[]>("/library/sections");

export const getLibraryCategories = (sectionSlug: string) =>
  libraryGet<LibraryCategoryDto[]>(
    `/library/categories/section/${encodeURIComponent(sectionSlug)}`,
  );

export const getLibraryFeed = (
  params?: Record<string, string | string[] | undefined>,
) =>
  libraryGet<LibraryFeedResponse>(
    `/library/entries${buildLibraryQuery(params)}`,
  );

export const getLibraryEntry = (id: string) =>
  libraryGet<LibraryEntryDto>(`/library/entries/${encodeURIComponent(id)}`);

export const getLibraryPreferences = () =>
  libraryGet<LibraryPreferencesDto>("/library/me/preferences");
```

- [ ] **Step 5: Запустить тест и убедиться, что он проходит**

Run: `pnpm --filter @vedamatch/web test library-query`
Expected: PASS, 3 теста.

- [ ] **Step 6: Коммит**

```bash
git add apps/web/src/lib/library-api.ts apps/web/src/lib/library-query.ts apps/web/src/lib/library-query.spec.ts
git commit -m "feat(library): server-side клиент API сервиса"
```

---

## Task 13: Карточка ссылки, полоса разделов, фильтры

**Files:**
- Create: `apps/web/src/components/library/entry-card.tsx`
- Create: `apps/web/src/components/library/section-strip.tsx`
- Create: `apps/web/src/components/library/entry-filters.tsx`
- Create: `apps/web/src/components/library/entry-list.tsx`
- Create: `apps/web/src/components/library/locale-switch.tsx`
- Test: `apps/web/src/components/library/entry-card.spec.tsx`

**Interfaces:**
- Consumes: `t`, `pickLocalized`, `entryTypeLabel` (Task 11); типы Task 4.
- Produces: `<EntryCard entry locale />`, `<SectionStrip sections locale activeSlug? />`, `<EntryFilters locale categories />`, `<EntryList initialFeed locale query />`, `<LocaleSwitch locale />`. Фильтры пишут параметры в URL через `useRouter`.

- [ ] **Step 1: Написать падающий тест карточки**

Создать `apps/web/src/components/library/entry-card.spec.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { LibraryEntryDto } from "@vedamatch/shared";
import { EntryCard } from "./entry-card";

const entry: LibraryEntryDto = {
  id: "entry-1",
  url: "https://example.com/a",
  domain: "example.com",
  type: "video",
  contentLanguage: "ru",
  titleRu: "Лекция по Гите",
  titleEn: null,
  descriptionRu: "Разбор второй главы",
  descriptionEn: null,
  faviconUrl: null,
  previewUrl: null,
  status: "published",
  usefulCount: 4,
  uniqueClickCount: 11,
  publishedAt: "2026-07-29T10:00:00.000Z",
  categories: [
    {
      id: "category-1",
      slug: "gita",
      sectionSlug: "philosophy",
      titleRu: "Гита",
      titleEn: null,
    },
  ],
  addedBy: { id: "user-1", name: "Тест" },
};

describe("EntryCard", () => {
  it("renders the localized title, domain and type badge", () => {
    render(<EntryCard entry={entry} locale="ru" />);

    expect(screen.getByText("Лекция по Гите")).toBeDefined();
    expect(screen.getByText("example.com")).toBeDefined();
    expect(screen.getByText("Видео")).toBeDefined();
  });

  it("falls back to the russian title in english locale", () => {
    render(<EntryCard entry={entry} locale="en" />);

    expect(screen.getByText("Лекция по Гите")).toBeDefined();
    expect(screen.getByText("Video")).toBeDefined();
  });

  it("opens the external url in a new tab", () => {
    render(<EntryCard entry={entry} locale="ru" />);
    const link = screen.getByRole("link", { name: /Лекция по Гите/ });

    expect(link.getAttribute("href")).toBe("https://example.com/a");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @vedamatch/web test -- entry-card`
Expected: FAIL — импорт `./entry-card` не разрешается.

- [ ] **Step 3: Реализовать карточку**

Создать `apps/web/src/components/library/entry-card.tsx`:

```tsx
import Link from "next/link";
import { ExternalLink, ThumbsUp } from "lucide-react";
import type { LibraryEntryDto, LibraryLocale } from "@vedamatch/shared";
import { entryTypeLabel, pickLocalized, t } from "./i18n";

export function EntryCard({
  entry,
  locale,
}: {
  entry: LibraryEntryDto;
  locale: LibraryLocale;
}) {
  const title = pickLocalized(locale, {
    ru: entry.titleRu,
    en: entry.titleEn,
  });
  const description = pickLocalized(locale, {
    ru: entry.descriptionRu,
    en: entry.descriptionEn,
  });

  return (
    <article className="glass rounded-2xl border border-glass-brd p-4">
      <div className="mb-2 flex items-center gap-2 text-xs text-text-2">
        <span>{entry.domain}</span>
        <span aria-hidden>·</span>
        <span className="rounded-full border border-glass-brd px-2 py-0.5">
          {entryTypeLabel(locale, entry.type)}
        </span>
        <span className="uppercase">{entry.contentLanguage}</span>
      </div>

      <h3 className="mb-1 font-display text-base font-semibold text-text-0">
        <a
          href={entry.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 hover:underline"
        >
          {title}
          <ExternalLink aria-hidden className="h-3.5 w-3.5" />
        </a>
      </h3>

      {description && (
        <p className="mb-3 line-clamp-2 text-sm text-text-1">{description}</p>
      )}

      <div className="flex flex-wrap items-center gap-3 text-xs text-text-2">
        <span className="inline-flex items-center gap-1">
          <ThumbsUp aria-hidden className="h-3.5 w-3.5" />
          {entry.usefulCount}
        </span>
        <span>
          {t(locale, "entry.clicks")}: {entry.uniqueClickCount}
        </span>
        {entry.categories.map((category) => (
          <Link
            key={category.id}
            href={`/library/${category.sectionSlug}/${category.slug}`}
            className="rounded-full bg-glass-brd/40 px-2 py-0.5 hover:text-text-0"
          >
            {pickLocalized(locale, {
              ru: category.titleRu,
              en: category.titleEn,
            })}
          </Link>
        ))}
        <Link href={`/library/entry/${entry.id}`} className="ml-auto hover:text-text-0">
          {t(locale, "entry.open")}
        </Link>
      </div>
    </article>
  );
}
```

- [ ] **Step 4: Запустить тест карточки**

Run: `pnpm --filter @vedamatch/web test -- entry-card`
Expected: PASS, 3 теста.

- [ ] **Step 5: Реализовать полосу разделов**

Создать `apps/web/src/components/library/section-strip.tsx`:

```tsx
import Link from "next/link";
import type { LibraryLocale, LibrarySectionDto } from "@vedamatch/shared";
import { pickLocalized } from "./i18n";

export function SectionStrip({
  sections,
  locale,
  activeSlug,
}: {
  sections: LibrarySectionDto[];
  locale: LibraryLocale;
  activeSlug?: string;
}) {
  return (
    <nav className="mb-6 flex gap-2 overflow-x-auto pb-1">
      {sections.map((section) => {
        const active = section.slug === activeSlug;
        return (
          <Link
            key={section.id}
            href={`/library/${section.slug}`}
            className={`glass shrink-0 rounded-xl border px-3 py-2 text-sm ${
              active
                ? "border-glass-brd text-text-0"
                : "border-transparent text-text-1 hover:text-text-0"
            }`}
          >
            <span className="block font-medium">
              {pickLocalized(locale, {
                ru: section.titleRu,
                en: section.titleEn,
              })}
            </span>
            <span className="text-xs text-text-2">{section.entriesCount}</span>
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 6: Реализовать панель фильтров**

Создать `apps/web/src/components/library/entry-filters.tsx`:

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type {
  LibraryCategoryDto,
  LibraryEntryType,
  LibraryFeedSort,
  LibraryLocale,
} from "@vedamatch/shared";
import { entryTypeLabel, pickLocalized, t } from "./i18n";

const TYPES: LibraryEntryType[] = [
  "website",
  "article",
  "video",
  "audio",
  "book",
  "course",
  "app",
  "telegram_channel",
  "community",
  "other",
];
const SORTS: LibraryFeedSort[] = ["new"];
const LANGUAGES = ["ru", "en"];

export function EntryFilters({
  locale,
  categories,
}: {
  locale: LibraryLocale;
  categories: LibraryCategoryDto[];
}) {
  const router = useRouter();
  const params = useSearchParams();

  function apply(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("cursor");
    router.push(`?${next.toString()}`);
  }

  return (
    <section className="glass mb-6 grid gap-3 rounded-2xl border border-glass-brd p-4 sm:grid-cols-2 lg:grid-cols-4">
      {categories.length > 0 && (
        <label className="text-sm text-text-1">
          {t(locale, "filters.category")}
          <select
            className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-text-0"
            value={params.get("categorySlug") ?? ""}
            onChange={(event) => apply("categorySlug", event.target.value)}
          >
            <option value="">{t(locale, "filters.all")}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.slug}>
                {pickLocalized(locale, {
                  ru: category.titleRu,
                  en: category.titleEn,
                })}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="text-sm text-text-1">
        {t(locale, "filters.type")}
        <select
          className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-text-0"
          value={params.get("type") ?? ""}
          onChange={(event) => apply("type", event.target.value)}
        >
          <option value="">{t(locale, "filters.all")}</option>
          {TYPES.map((type) => (
            <option key={type} value={type}>
              {entryTypeLabel(locale, type)}
            </option>
          ))}
        </select>
      </label>

      <label className="text-sm text-text-1">
        {t(locale, "filters.language")}
        <select
          className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-text-0"
          value={params.get("language") ?? ""}
          onChange={(event) => apply("language", event.target.value)}
        >
          <option value="">{t(locale, "filters.all")}</option>
          {LANGUAGES.map((language) => (
            <option key={language} value={language}>
              {language.toUpperCase()}
            </option>
          ))}
        </select>
      </label>

      <label className="text-sm text-text-1">
        {t(locale, "filters.sort")}
        <select
          className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-text-0"
          value={params.get("sort") ?? "new"}
          onChange={(event) => apply("sort", event.target.value)}
        >
          {SORTS.map((sort) => (
            <option key={sort} value={sort}>
              {t(locale, `sort.${sort}` as never)}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}
```

- [ ] **Step 7: Реализовать UI-пагинацию ленты**

Создать `apps/web/src/components/library/entry-list.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import type { LibraryFeedResponse, LibraryLocale } from "@vedamatch/shared";
import { buildLibraryQuery } from "@/lib/library-query";
import { EntryCard } from "./entry-card";
import { t } from "./i18n";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function EntryList({
  initialFeed,
  locale,
  query,
}: {
  initialFeed: LibraryFeedResponse;
  locale: LibraryLocale;
  query: Record<string, string | string[] | undefined>;
}) {
  const [feed, setFeed] = useState(initialFeed);
  const [pending, setPending] = useState(false);

  async function loadMore() {
    if (!feed.nextCursor || pending) return;
    setPending(true);
    try {
      const path = buildLibraryQuery({ ...query, cursor: feed.nextCursor });
      const response = await fetch(`${API_URL}/library/entries${path}`, {
        credentials: "include",
      });
      if (!response.ok) return;
      const next = (await response.json()) as LibraryFeedResponse;
      setFeed({
        ...next,
        items: [...feed.items, ...next.items],
      });
    } finally {
      setPending(false);
    }
  }

  if (feed.items.length === 0) {
    return (
      <p className="glass rounded-2xl border border-glass-brd p-6 text-sm text-text-1">
        {t(locale, "feed.empty")}
      </p>
    );
  }

  return (
    <div>
      <div className="grid gap-3">
        {feed.items.map((entry) => (
          <EntryCard key={entry.id} entry={entry} locale={locale} />
        ))}
      </div>
      {feed.nextCursor && (
        <button
          type="button"
          disabled={pending}
          onClick={() => void loadMore()}
          className="mt-4 w-full rounded-xl border border-glass-brd px-4 py-2 text-sm text-text-0 disabled:opacity-50"
        >
          {pending ? t(locale, "feed.loading") : t(locale, "feed.more")}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Реализовать переключатель RU/EN**

Создать `apps/web/src/components/library/locale-switch.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import type { LibraryLocale } from "@vedamatch/shared";
import { t } from "./i18n";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function LocaleSwitch({ locale }: { locale: LibraryLocale }) {
  const router = useRouter();

  async function change(next: LibraryLocale) {
    if (next === locale) return;
    const response = await fetch(`${API_URL}/library/me/preferences`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uiLanguage: next }),
    });
    if (response.ok) router.refresh();
  }

  return (
    <label className="inline-flex items-center gap-2 text-xs text-text-2">
      <span>{t(locale, "locale.switch")}</span>
      <select
        value={locale}
        onChange={(event) => void change(event.target.value as LibraryLocale)}
        className="rounded-lg border border-glass-brd bg-bg-0 px-2 py-1 text-text-0"
      >
        <option value="ru">RU</option>
        <option value="en">EN</option>
      </select>
    </label>
  );
}
```

- [ ] **Step 9: Проверить сборку и тесты**

Run: `pnpm --filter @vedamatch/web test -- entry-card`
Expected: PASS.

Run: `pnpm --filter @vedamatch/web lint`
Expected: без ошибок.

- [ ] **Step 10: Коммит**

```bash
git add apps/web/src/components/library
git commit -m "feat(library): карточка ссылки, полоса разделов и фильтры"
```

---

## Task 14: Главная страница, страницы раздела и категории

**Files:**
- Create: `apps/web/src/app/library/page.tsx`
- Create: `apps/web/src/app/library/[section]/page.tsx`
- Create: `apps/web/src/app/library/[section]/[category]/page.tsx`
- Create: `apps/web/src/app/library/entry/[id]/page.tsx`

**Interfaces:**
- Consumes: `getLibrarySections`, `getLibraryCategories`, `getLibraryFeed`, `getLibraryEntry`, `getLibraryPreferences` (Task 12); `SectionStrip`, `EntryFilters`, `EntryCard`, `EntryList`, `LocaleSwitch` (Task 13); `getProfile`, `Header` из портала.
- Produces: рабочие маршруты `/library`, `/library/[section]`, `/library/[section]/[category]`, `/library/entry/[id]`.

- [ ] **Step 1: Реализовать главную страницу**

Создать `apps/web/src/app/library/page.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getProfile } from "@/lib/api";
import {
  getLibraryFeed,
  getLibraryPreferences,
  getLibrarySections,
} from "@/lib/library-api";
import { Header } from "@/components/header";
import { EntryFilters } from "@/components/library/entry-filters";
import { EntryList } from "@/components/library/entry-list";
import { LocaleSwitch } from "@/components/library/locale-switch";
import { SectionStrip } from "@/components/library/section-strip";
import { t } from "@/components/library/i18n";

export const metadata: Metadata = {
  title: "Библиотека ссылок — VedaMatch",
  description:
    "Общая база полезных материалов VedaMatch: статьи, видео, книги, курсы и каналы",
};

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getProfile();
  if (!user) redirect("/login");

  const params = await searchParams;
  const [sections, preferences, feed] = await Promise.all([
    getLibrarySections(),
    getLibraryPreferences(),
    getLibraryFeed(params),
  ]);
  const locale = preferences?.uiLanguage ?? "ru";

  return (
    <div className="relative min-h-screen bg-bg-0">
      <Header user={user} />
      <main className="mx-auto max-w-5xl px-4 py-8 pb-24">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold text-text-0">
              {t(locale, "service.title")}
            </h1>
            <p className="text-text-1">{t(locale, "service.subtitle")}</p>
          </div>
          <Link
            href="/library/add"
            className="rounded-xl bg-glass-brd/40 px-4 py-2 text-sm text-text-0 hover:bg-glass-brd/60"
          >
            {t(locale, "nav.add")}
          </Link>
        </div>

        <div className="mb-4 flex justify-end">
          <LocaleSwitch locale={locale} />
        </div>
        <SectionStrip sections={sections ?? []} locale={locale} />
        <EntryFilters locale={locale} categories={[]} />

        {feed && <EntryList initialFeed={feed} locale={locale} query={params} />}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Реализовать страницу раздела**

Создать `apps/web/src/app/library/[section]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getProfile } from "@/lib/api";
import {
  getLibraryCategories,
  getLibraryFeed,
  getLibraryPreferences,
  getLibrarySections,
} from "@/lib/library-api";
import { Header } from "@/components/header";
import { EntryFilters } from "@/components/library/entry-filters";
import { EntryList } from "@/components/library/entry-list";
import { SectionStrip } from "@/components/library/section-strip";
import { pickLocalized, t } from "@/components/library/i18n";

export default async function LibrarySectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getProfile();
  if (!user) redirect("/login");

  const { section: sectionSlug } = await params;
  const query = await searchParams;
  const [sections, categories, preferences, feed] = await Promise.all([
    getLibrarySections(),
    getLibraryCategories(sectionSlug),
    getLibraryPreferences(),
    getLibraryFeed({ ...query, sectionSlug }),
  ]);

  const section = sections?.find((item) => item.slug === sectionSlug);
  if (!section) notFound();

  const locale = preferences?.uiLanguage ?? "ru";

  return (
    <div className="relative min-h-screen bg-bg-0">
      <Header user={user} />
      <main className="mx-auto max-w-5xl px-4 py-8 pb-24">
        <SectionStrip
          sections={sections ?? []}
          locale={locale}
          activeSlug={sectionSlug}
        />

        <h1 className="mb-4 font-display text-2xl font-bold text-text-0">
          {pickLocalized(locale, {
            ru: section.titleRu,
            en: section.titleEn,
          })}
        </h1>

        {categories && categories.length > 0 ? (
          <ul className="mb-6 flex flex-wrap gap-2">
            {categories.map((category) => (
              <li key={category.id}>
                <Link
                  href={`/library/${sectionSlug}/${category.slug}`}
                  className="glass rounded-xl border border-glass-brd px-3 py-2 text-sm text-text-1 hover:text-text-0"
                >
                  {pickLocalized(locale, {
                    ru: category.titleRu,
                    en: category.titleEn,
                  })}
                  <span className="ml-2 text-xs text-text-2">
                    {category.entriesCount}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="glass mb-6 rounded-2xl border border-glass-brd p-6 text-sm text-text-1">
            {t(locale, "category.empty")}
          </p>
        )}

        <EntryFilters locale={locale} categories={categories ?? []} />

        {feed && (
          <EntryList
            initialFeed={feed}
            locale={locale}
            query={{ ...query, sectionSlug }}
          />
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Реализовать страницу категории**

Создать `apps/web/src/app/library/[section]/[category]/page.tsx`:

```tsx
import { notFound, redirect } from "next/navigation";
import { getProfile } from "@/lib/api";
import {
  getLibraryCategories,
  getLibraryFeed,
  getLibraryPreferences,
  getLibrarySections,
} from "@/lib/library-api";
import { Header } from "@/components/header";
import { EntryFilters } from "@/components/library/entry-filters";
import { EntryList } from "@/components/library/entry-list";
import { SectionStrip } from "@/components/library/section-strip";
import { pickLocalized, t } from "@/components/library/i18n";

export default async function LibraryCategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ section: string; category: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getProfile();
  if (!user) redirect("/login");

  const { section: sectionSlug, category: categorySlug } = await params;
  const query = await searchParams;
  const [sections, categories, preferences, feed] = await Promise.all([
    getLibrarySections(),
    getLibraryCategories(sectionSlug),
    getLibraryPreferences(),
    getLibraryFeed({ ...query, categorySlug }),
  ]);

  const category = categories?.find((item) => item.slug === categorySlug);
  if (!category) notFound();

  const locale = preferences?.uiLanguage ?? "ru";

  return (
    <div className="relative min-h-screen bg-bg-0">
      <Header user={user} />
      <main className="mx-auto max-w-5xl px-4 py-8 pb-24">
        <SectionStrip
          sections={sections ?? []}
          locale={locale}
          activeSlug={sectionSlug}
        />

        <h1 className="mb-1 font-display text-2xl font-bold text-text-0">
          {pickLocalized(locale, {
            ru: category.titleRu,
            en: category.titleEn,
          })}
        </h1>
        <p className="mb-6 text-sm text-text-2">
          {category.entriesCount} {t(locale, "category.entries")}
        </p>

        <EntryFilters locale={locale} categories={categories ?? []} />

        {feed && (
          <EntryList
            initialFeed={feed}
            locale={locale}
            query={{ ...query, categorySlug }}
          />
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Реализовать карточку ссылки**

Создать `apps/web/src/app/library/entry/[id]/page.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/api";
import { getLibraryEntry, getLibraryPreferences } from "@/lib/library-api";
import { Header } from "@/components/header";
import { entryTypeLabel, pickLocalized, t } from "@/components/library/i18n";

export default async function LibraryEntryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getProfile();
  if (!user) redirect("/login");

  const { id } = await params;
  const [entry, preferences] = await Promise.all([
    getLibraryEntry(id),
    getLibraryPreferences(),
  ]);
  const locale = preferences?.uiLanguage ?? "ru";

  if (!entry) {
    return (
      <div className="relative min-h-screen bg-bg-0">
        <Header user={user} />
        <main className="mx-auto max-w-3xl px-4 py-8">
          <p className="glass rounded-2xl border border-glass-brd p-6 text-sm text-text-1">
            {t(locale, "entry.notFound")}
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-bg-0">
      <Header user={user} />
      <main className="mx-auto max-w-3xl px-4 py-8 pb-24">
        <p className="mb-2 text-xs text-text-2">
          {entry.domain} · {entryTypeLabel(locale, entry.type)} ·{" "}
          {entry.contentLanguage.toUpperCase()}
        </p>
        <h1 className="mb-3 font-display text-2xl font-bold text-text-0">
          {pickLocalized(locale, { ru: entry.titleRu, en: entry.titleEn })}
        </h1>
        <p className="mb-6 text-text-1">
          {pickLocalized(locale, {
            ru: entry.descriptionRu,
            en: entry.descriptionEn,
          })}
        </p>

        <a
          href={entry.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-6 inline-block rounded-xl bg-glass-brd/40 px-4 py-2 text-sm text-text-0 hover:bg-glass-brd/60"
        >
          {t(locale, "entry.open")}
        </a>

        <section className="glass rounded-2xl border border-glass-brd p-4 text-sm text-text-1">
          <p className="mb-2">
            {t(locale, "entry.categories")}:{" "}
            {entry.categories.map((category, index) => (
              <span key={category.id}>
                {index > 0 && ", "}
                <Link
                  href={`/library/${category.sectionSlug}/${category.slug}`}
                  className="hover:text-text-0"
                >
                  {pickLocalized(locale, {
                    ru: category.titleRu,
                    en: category.titleEn,
                  })}
                </Link>
              </span>
            ))}
          </p>
          {entry.addedBy && (
            <p className="text-text-2">
              {t(locale, "entry.addedBy")}: {entry.addedBy.name}
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
```

- [ ] **Step 5: Проверить сборку**

Run: `pnpm --filter @vedamatch/web build`
Expected: сборка проходит, маршруты `/library`, `/library/[section]`, `/library/[section]/[category]`, `/library/entry/[id]` в выводе.

- [ ] **Step 6: Коммит**

```bash
git add apps/web/src/app/library
git commit -m "feat(library): страницы каталога, раздела, категории и ссылки"
```

---

## Task 15: Формы добавления ссылки и создания категории

**Files:**
- Create: `apps/web/src/components/library/add-entry-form.tsx`
- Create: `apps/web/src/components/library/category-create-form.tsx`
- Create: `apps/web/src/app/library/add/page.tsx`
- Test: `apps/web/src/components/library/add-entry-form.spec.tsx`

**Interfaces:**
- Consumes: `t`, `entryTypeLabel`, `pickLocalized` (Task 11); типы `CreateLibraryEntryRequest`, `LibraryDuplicateEntryConflict`, `CreateLibraryCategoryConflict` (Task 4); API `POST library/entries` (Task 8) и `POST library/categories` (Task 6).
- Produces: `<AddEntryForm locale categories />` и `<CategoryCreateForm locale sections />`, страница `/library/add`.

- [ ] **Step 1: Написать падающий тест на обработку дубликата**

Создать `apps/web/src/components/library/add-entry-form.spec.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryCategoryDto } from "@vedamatch/shared";
import { AddEntryForm } from "./add-entry-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const categories: LibraryCategoryDto[] = [
  {
    id: "category-1",
    sectionId: "section-1",
    sectionSlug: "philosophy",
    slug: "gita",
    titleRu: "Гита",
    titleEn: null,
    descriptionRu: null,
    descriptionEn: null,
    entriesCount: 2,
    createdAt: "2026-07-29T10:00:00.000Z",
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AddEntryForm", () => {
  it("shows a friendly duplicate notice with a link to the existing entry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: () =>
          Promise.resolve({
            code: "entry_already_exists",
            entry: { id: "existing-1" },
          }),
      }),
    );

    render(<AddEntryForm locale="ru" categories={categories} />);

    await userEvent.type(
      screen.getByLabelText("Адрес ссылки"),
      "https://example.com/a",
    );
    await userEvent.type(screen.getByLabelText("Заголовок по-русски"), "Статья");
    await userEvent.click(screen.getByLabelText("Гита"));
    await userEvent.click(screen.getByRole("button", { name: "Добавить" }));

    await waitFor(() => {
      expect(screen.getByText("Такая ссылка уже есть в библиотеке")).toBeDefined();
    });
    expect(
      screen
        .getByRole("link", { name: "Открыть существующую запись" })
        .getAttribute("href"),
    ).toBe("/library/entry/existing-1");
  });

  it("blocks submit until a title and a category are filled", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<AddEntryForm locale="ru" categories={categories} />);

    await userEvent.type(
      screen.getByLabelText("Адрес ссылки"),
      "https://example.com/a",
    );
    await userEvent.click(screen.getByRole("button", { name: "Добавить" }));

    expect(
      screen.getByText("Заполните заголовок хотя бы на одном языке"),
    ).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `pnpm --filter @vedamatch/web test -- add-entry-form`
Expected: FAIL — импорт `./add-entry-form` не разрешается.

- [ ] **Step 3: Реализовать форму добавления**

Создать `apps/web/src/components/library/add-entry-form.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  CreateLibraryEntryRequest,
  LibraryCategoryDto,
  LibraryDuplicateEntryConflict,
  LibraryEntryType,
  LibraryLocale,
} from "@vedamatch/shared";
import { entryTypeLabel, pickLocalized, t } from "./i18n";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const TYPES: LibraryEntryType[] = [
  "website",
  "article",
  "video",
  "audio",
  "book",
  "course",
  "app",
  "telegram_channel",
  "community",
  "other",
];

export function AddEntryForm({
  locale,
  categories,
}: {
  locale: LibraryLocale;
  categories: LibraryCategoryDto[];
}) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [type, setType] = useState<LibraryEntryType>("article");
  const [contentLanguage, setContentLanguage] = useState("ru");
  const [titleRu, setTitleRu] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [descriptionRu, setDescriptionRu] = useState("");
  const [descriptionEn, setDescriptionEn] = useState("");
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateId, setDuplicateId] = useState<string | null>(null);

  function toggleCategory(id: string) {
    setCategoryIds((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setDuplicateId(null);

    if (!titleRu.trim() && !titleEn.trim()) {
      setError(t(locale, "add.titleRequired"));
      return;
    }
    if (categoryIds.length === 0) {
      setError(t(locale, "add.categoryRequired"));
      return;
    }

    const body: CreateLibraryEntryRequest = {
      url: url.trim(),
      type,
      contentLanguage,
      titleRu: titleRu.trim() || null,
      titleEn: titleEn.trim() || null,
      descriptionRu: descriptionRu.trim() || null,
      descriptionEn: descriptionEn.trim() || null,
      categoryIds,
    };

    setPending(true);
    try {
      const res = await fetch(`${API_URL}/library/entries`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.status === 409) {
        const payload = (await res.json()) as LibraryDuplicateEntryConflict;
        setDuplicateId(payload.entry?.id ?? null);
        setError(t(locale, "add.duplicate"));
        return;
      }
      if (res.status === 400) {
        setError(t(locale, "add.unsupportedUrl"));
        return;
      }
      if (!res.ok) {
        setError(t(locale, "add.failed"));
        return;
      }

      const created = (await res.json()) as { id: string };
      router.push(`/library/entry/${created.id}`);
    } catch {
      setError(t(locale, "add.failed"));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <label className="text-sm text-text-1">
        {t(locale, "add.url")}
        <input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-text-0"
          placeholder="https://"
          required
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm text-text-1">
          {t(locale, "add.type")}
          <select
            value={type}
            onChange={(event) =>
              setType(event.target.value as LibraryEntryType)
            }
            className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-text-0"
          >
            {TYPES.map((value) => (
              <option key={value} value={value}>
                {entryTypeLabel(locale, value)}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm text-text-1">
          {t(locale, "add.language")}
          <select
            value={contentLanguage}
            onChange={(event) => setContentLanguage(event.target.value)}
            className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-text-0"
          >
            <option value="ru">RU</option>
            <option value="en">EN</option>
          </select>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm text-text-1">
          {t(locale, "add.titleRu")}
          <input
            value={titleRu}
            onChange={(event) => setTitleRu(event.target.value)}
            className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-text-0"
          />
        </label>
        <label className="text-sm text-text-1">
          {t(locale, "add.titleEn")}
          <input
            value={titleEn}
            onChange={(event) => setTitleEn(event.target.value)}
            className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-text-0"
          />
        </label>
        <label className="text-sm text-text-1">
          {t(locale, "add.descriptionRu")}
          <textarea
            value={descriptionRu}
            onChange={(event) => setDescriptionRu(event.target.value)}
            rows={3}
            className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-text-0"
          />
        </label>
        <label className="text-sm text-text-1">
          {t(locale, "add.descriptionEn")}
          <textarea
            value={descriptionEn}
            onChange={(event) => setDescriptionEn(event.target.value)}
            rows={3}
            className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-text-0"
          />
        </label>
      </div>

      <fieldset className="text-sm text-text-1">
        <legend className="mb-2">{t(locale, "add.categories")}</legend>
        <div className="flex flex-wrap gap-3">
          {categories.map((category) => {
            const label = pickLocalized(locale, {
              ru: category.titleRu,
              en: category.titleEn,
            });
            return (
              <label key={category.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  aria-label={label}
                  checked={categoryIds.includes(category.id)}
                  onChange={() => toggleCategory(category.id)}
                />
                {label}
              </label>
            );
          })}
        </div>
      </fieldset>

      {error && (
        <p className="glass rounded-xl border border-glass-brd p-3 text-sm text-text-0">
          {error}
          {duplicateId && (
            <Link
              href={`/library/entry/${duplicateId}`}
              className="ml-2 underline"
            >
              {t(locale, "add.duplicateOpen")}
            </Link>
          )}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-glass-brd/40 px-4 py-2 text-sm text-text-0 hover:bg-glass-brd/60 disabled:opacity-50"
      >
        {t(locale, "add.submit")}
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Запустить тест формы**

Run: `pnpm --filter @vedamatch/web test -- add-entry-form`
Expected: PASS, 2 теста.

- [ ] **Step 5: Реализовать форму создания категории с обработкой 422**

Создать `apps/web/src/components/library/category-create-form.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  CreateLibraryCategoryConflict,
  LibraryCategorySuggestion,
  LibraryLocale,
  LibrarySectionDto,
} from "@vedamatch/shared";
import { pickLocalized, t } from "./i18n";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function CategoryCreateForm({
  locale,
  sections,
}: {
  locale: LibraryLocale;
  sections: LibrarySectionDto[];
}) {
  const router = useRouter();
  const [sectionId, setSectionId] = useState(sections[0]?.id ?? "");
  const [titleRu, setTitleRu] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [suggestions, setSuggestions] = useState<LibraryCategorySuggestion[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const query = (titleRu.trim() || titleEn.trim()).slice(0, 120);
    if (query.length < 3) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      const response = await fetch(
        `${API_URL}/library/categories/suggest?q=${encodeURIComponent(query)}`,
        { credentials: "include", signal: controller.signal },
      ).catch(() => null);
      if (!response?.ok) return;
      setSuggestions(
        (await response.json()) as LibraryCategorySuggestion[],
      );
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [titleRu, titleEn]);

  async function submit(force: boolean) {
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`${API_URL}/library/categories`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sectionId,
          titleRu: titleRu.trim() || null,
          titleEn: titleEn.trim() || null,
          force,
        }),
      });

      if (res.status === 422) {
        const payload = (await res.json()) as {
          message?: CreateLibraryCategoryConflict;
        } & Partial<CreateLibraryCategoryConflict>;
        const conflict = payload.message ?? payload;
        setSuggestions(conflict.suggestions ?? []);
        setError(t(locale, "category.similar"));
        return;
      }
      if (!res.ok) {
        setError(t(locale, "add.failed"));
        return;
      }

      const created = (await res.json()) as {
        sectionSlug: string;
        slug: string;
      };
      router.push(`/library/${created.sectionSlug}/${created.slug}`);
    } catch {
      setError(t(locale, "add.failed"));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit(false);
      }}
      className="grid gap-4"
    >
      <label className="text-sm text-text-1">
        {t(locale, "filters.section")}
        <select
          value={sectionId}
          onChange={(event) => setSectionId(event.target.value)}
          className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-text-0"
        >
          {sections.map((section) => (
            <option key={section.id} value={section.id}>
              {pickLocalized(locale, {
                ru: section.titleRu,
                en: section.titleEn,
              })}
            </option>
          ))}
        </select>
      </label>

      <label className="text-sm text-text-1">
        {t(locale, "category.titleRu")}
        <input
          value={titleRu}
          onChange={(event) => setTitleRu(event.target.value)}
          className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-text-0"
        />
      </label>

      <label className="text-sm text-text-1">
        {t(locale, "category.titleEn")}
        <input
          value={titleEn}
          onChange={(event) => setTitleEn(event.target.value)}
          className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-text-0"
        />
      </label>

      {(error || suggestions.length > 0) && (
        <div className="glass rounded-xl border border-glass-brd p-3 text-sm text-text-0">
          <p>{error ?? t(locale, "category.similarHint")}</p>
          {suggestions.length > 0 && (
            <>
              <ul className="mt-2 space-y-1">
                {suggestions.map((suggestion) => (
                  <li key={suggestion.id}>
                    <a
                      href={`/library/${suggestion.sectionSlug}/${suggestion.slug}`}
                      className="underline"
                    >
                      {pickLocalized(locale, {
                        ru: suggestion.titleRu,
                        en: suggestion.titleEn,
                      })}
                    </a>
                    <span className="ml-2 text-text-2">
                      {suggestion.entriesCount}
                    </span>
                  </li>
                ))}
              </ul>
              {error === t(locale, "category.similar") && (
                <button
                  type="button"
                  onClick={() => void submit(true)}
                  disabled={pending}
                  className="mt-3 rounded-xl bg-glass-brd/40 px-3 py-1.5 text-sm hover:bg-glass-brd/60 disabled:opacity-50"
                >
                  {t(locale, "category.forceCreate")}
                </button>
              )}
            </>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-glass-brd/40 px-4 py-2 text-sm text-text-0 hover:bg-glass-brd/60 disabled:opacity-50"
      >
        {t(locale, "category.create")}
      </button>
    </form>
  );
}
```

- [ ] **Step 6: Реализовать страницу добавления**

Создать `apps/web/src/app/library/add/page.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/api";
import {
  getLibraryCategories,
  getLibraryPreferences,
  getLibrarySections,
} from "@/lib/library-api";
import { Header } from "@/components/header";
import { AddEntryForm } from "@/components/library/add-entry-form";
import { CategoryCreateForm } from "@/components/library/category-create-form";
import { t } from "@/components/library/i18n";

export default async function LibraryAddPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const user = await getProfile();
  if (!user) redirect("/login");

  const { section } = await searchParams;
  const [sections, preferences] = await Promise.all([
    getLibrarySections(),
    getLibraryPreferences(),
  ]);
  const locale = preferences?.uiLanguage ?? "ru";
  const activeSection = section ?? sections?.[0]?.slug;
  const categories = activeSection
    ? await getLibraryCategories(activeSection)
    : [];

  return (
    <div className="relative min-h-screen bg-bg-0">
      <Header user={user} />
      <main className="mx-auto max-w-3xl px-4 py-8 pb-24">
        <h1 className="mb-6 font-display text-2xl font-bold text-text-0">
          {t(locale, "add.title")}
        </h1>

        <nav className="mb-4 flex flex-wrap gap-2" aria-label={t(locale, "filters.section")}>
          {(sections ?? []).map((item) => (
            <Link
              key={item.id}
              href={`/library/add?section=${encodeURIComponent(item.slug)}`}
              className={`rounded-xl border px-3 py-2 text-sm ${
                item.slug === activeSection
                  ? "border-glass-brd text-text-0"
                  : "border-transparent text-text-2 hover:text-text-0"
              }`}
            >
              {item.titleRu}
            </Link>
          ))}
        </nav>

        <section className="glass mb-8 rounded-2xl border border-glass-brd p-4">
          <AddEntryForm locale={locale} categories={categories ?? []} />
        </section>

        <h2 className="mb-4 font-display text-lg font-semibold text-text-0">
          {t(locale, "category.create")}
        </h2>
        <section className="glass rounded-2xl border border-glass-brd p-4">
          <CategoryCreateForm locale={locale} sections={sections ?? []} />
        </section>
      </main>
    </div>
  );
}
```

- [ ] **Step 7: Проверить всё вместе**

Run: `pnpm --filter @vedamatch/web test`
Expected: PASS, все спеки web включая существующие.

Run: `pnpm --filter @vedamatch/web lint`
Expected: без ошибок.

Run: `pnpm --filter @vedamatch/web build`
Expected: сборка проходит.

- [ ] **Step 8: Коммит**

```bash
git add apps/web/src/components/library apps/web/src/app/library
git commit -m "feat(library): формы добавления ссылки и создания категории"
```

---

## Task 16: Финальная проверка фазы и активация сервиса

**Files:**
- Modify: `apps/api/prisma/seed.cjs` и `apps/api/prisma/seed.ts` (статус сервиса)
- Modify: `docs/superpowers/specs/2026-07-29-library-links-service-design.md` (отметка о завершении фазы A)

**Interfaces:**
- Consumes: результат всех предыдущих задач.
- Produces: сервис виден на главной портала со статусом `coming_soon` (перевод в `active` — задача фазы B, так как без превью и голосов сервис ещё не полон).

- [ ] **Step 1: Прогнать полный набор проверок монорепо**

Run: `pnpm --filter @vedamatch/api exec prisma validate`
Expected: схема валидна.

Run: `pnpm --filter @vedamatch/api test`
Expected: PASS, все спеки API.

Run: `pnpm --filter @vedamatch/api lint`
Expected: без ошибок.

Run: `pnpm --filter @vedamatch/api build`
Expected: сборка проходит.

Run: `pnpm --filter @vedamatch/web test`
Expected: PASS.

Run: `pnpm --filter @vedamatch/web lint`
Expected: без ошибок.

Run: `pnpm --filter @vedamatch/web build`
Expected: сборка проходит.

- [ ] **Step 2: Ручной сценарий на локальном стенде**

Запустить `pnpm dev` из корня, затем проверить последовательно:

1. `/library` открывается, видна полоса из 8 разделов, лента пуста с текстом «Пока ничего не добавлено».
2. `/library/add` → создать категорию «Лекции по Гите» в разделе «Философия и писания» → редирект в категорию.
3. Повторно создать категорию «лекции по гите» → появляется блок «Похожие категории уже есть» со ссылкой на созданную и кнопкой «Всё равно создать новую».
4. `/library/add` → добавить `https://www.youtube.com/watch?v=abc123&utm_source=tg` типа «Видео» в категорию → редирект на карточку ссылки.
5. Повторно добавить `https://youtu.be/abc123` → появляется «Такая ссылка уже есть в библиотеке» со ссылкой «Открыть существующую запись».
6. `/library?type=video` → в ленте только видео; `?language=en` → лента пуста.
7. `/library?q=гите` → ссылка находится по словоформе (проверка русского tsvector).
8. Переключить `RU → EN` через `LocaleSwitch` на `/library` → интерфейс становится английским, русский заголовок ссылки остаётся виден благодаря фоллбэку.

- [ ] **Step 3: Отметить фазу в спеке**

В `docs/superpowers/specs/2026-07-29-library-links-service-design.md` в разделе «13. Фазы реализации» дописать в конец описания фазы A:

```markdown
Статус: реализовано 2026-07-29, сервис в каталоге со статусом `coming_soon` до завершения фазы B.
```

- [ ] **Step 4: Коммит**

```bash
git add docs/superpowers/specs/2026-07-29-library-links-service-design.md
git commit -m "docs(library): отметка о завершении фазы A"
```

---

## Покрытие спеки фазой A

| Требование спеки | Задача |
|---|---|
| Модели `LibrarySection`, `LibraryCategory`, `LibraryEntry`, `LibraryEntryCategory`, `LibraryPreference` | 1 |
| `pg_trgm`, `unaccent`, generated `searchVector` + GIN | 1 |
| Нормализация URL (трекеры, YouTube, слеши, сортировка параметров) | 2 |
| Slug из `titleEn` или транслита `titleRu`, суффикс при коллизии | 3, 6 |
| Shared-типы сервиса | 4 |
| Границы модуля, одна строка в `app.module.ts` | 5 |
| Разделы только для чтения пользователем | 5, 10 |
| Подсказка похожих категорий и порог 0.75 с `force` | 6 |
| Ссылка уникальна по URL, 409 с существующей записью | 8 |
| Many-to-many ссылка ↔ категории, счётчик `entriesCount` | 8 |
| Фильтры: раздел, категория, тип, язык; сортировка «Новое» | 7, 8, 13 |
| Полнотекстовый поиск ru+en | 8 |
| Курсорная пагинация backend + кнопка «Показать ещё» | 7, 8, 13 |
| Rate limits: ссылка 20/час, категория 5/час | 6, 8 |
| Язык интерфейса в `LibraryPreference`, не в `User` | 9 |
| Словарь ru/en, фоллбэк контента и переключатель RU/EN | 11, 13, 14 |
| Seed сервиса и 8 разделов | 10 |
| Маршруты `/library`, `/library/[section]`, `/library/[section]/[category]`, `/library/entry/[id]`, `/library/add` | 14, 15 |
| Дизайн-токены и `lucide-react` | 13, 14, 15 |

Вне фазы A по спеке: OG-парсер и превью в S3, голоса, переходы, `rankScore`, закладки, подписки, подборки, жалобы и админка.

