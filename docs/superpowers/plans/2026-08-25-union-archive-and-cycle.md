# Знакомства: архив и круг просмотра — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Развести «убрал на этот круг» и «убрал совсем»: крестик перестаёт выжигать пул навсегда, появляется архив с возвратом, а исчерпанная колода предлагает начать круг заново.

**Architecture:** Архив — отдельная таблица `UnionArchive`, а не значение в `UnionSwipeDecision`. Причина решающая: у `UnionSwipe` стоит `@@unique([fromUserId, toUserId])`, поэтому архивирование того, кому уже поставлен лайк, перезаписало бы сам лайк вместе с отправленной заявкой. Отдельная таблица позволяет решению и архиву сосуществовать и делает структурно невозможной ошибку «новый круг стёр архив». Новый круг переиспользует существующий механизм мягкого отката `undoneAt`, но помечает только строки с `decision: 'pass'` — лайки и суперлайки не трогает, заявки не отменяет. Архивные пользователи исключаются из выдачи всегда, наравне с `hidden` от модерации, даже при `includeSwiped=true`. Вкладка «Заблокированные» бэкенда не требует: `GET /union/blocks` и клиент `getUnionBlocks()` уже есть.

**Tech Stack:** NestJS, Prisma + Postgres, Next.js 16 App Router, React 19, Tailwind v4, jest (api), vitest + @testing-library/react (web).

## Global Constraints

- Контракт сервисного модуля: код Знакомств живёт только в `apps/api/src/modules/union/`. Разрешены `AuthModule`, `ModerationModule`, `CommunitiesModule`, глобальный `PrismaService`, типы из `@vedamatch/shared`, `EventEmitter2`. Импорт чужих фичевых модулей запрещён.
- Модели сервиса именуются с префиксом `Union`, добавляются отдельным блоком в конец `schema.prisma`. FK на `User` разрешены.
- Миграции руками: `pnpm prisma migrate dev` предложит снести базу. Создавать SQL-файл миграции вручную.
- Любой DTO наружу заполняет `name` результатом `resolveDisplayName()` из `@vedamatch/shared`, а Prisma-`select` рядом обязан тянуть `spiritualName`.
- Только токены дизайн-системы (`text-text-0`, `bg-bg-1`, `text-magenta`…). Поверх фотографии допустимы `text-white` / `bg-black/NN`.
- Все подписи и `aria-label` — по-русски. Комментарии в коде — по-русски, объясняют «почему».
- Тесты рядом с кодом, `*.spec.ts(x)`.
- Команды: API `pnpm --filter @vedamatch/api test -- <регэксп>`; веб `pnpm --filter @vedamatch/web exec vitest run <путь>`; типы `cd apps/web && pnpm exec tsc --noEmit -p tsconfig.json`; сборка общих типов `cd packages/shared && pnpm run build`.
- Коммитить после каждой задачи. `git push` не делать.

---

### Task 1: Модель архива и миграция

**Files:**
- Modify: `apps/api/prisma/schema.prisma` — блок `User` (связи) и конец файла (модель)
- Create: `apps/api/prisma/migrations/20260825120000_union_archive/migration.sql`

**Interfaces:**
- Consumes: модель `User`.
- Produces: Prisma-модель `UnionArchive` с полями `id`, `ownerId`, `archivedUserId`, `createdAt` и уникальностью `(ownerId, archivedUserId)`; клиент доступен как `prisma.unionArchive`.

- [ ] **Step 1: Добавить связи в модель User**

В `apps/api/prisma/schema.prisma` найти строки со связями `UnionSwipesMade` / `UnionSwipesReceived` внутри `model User` и добавить сразу под ними:

```prisma
  unionArchivesMade                  UnionArchive[]               @relation("UnionArchivesMade")
  unionArchivesReceived              UnionArchive[]               @relation("UnionArchivesReceived")
```

- [ ] **Step 2: Добавить модель в конец блока Union**

В `apps/api/prisma/schema.prisma` сразу после модели `UnionSwipe` добавить:

```prisma
/// Анкеты, убранные из выдачи «совсем». В отличие от `UnionSwipe` живёт
/// отдельной таблицей: у свайпа стоит @@unique([fromUserId, toUserId]), и
/// архивирование того, кому уже отправлен лайк, перезаписало бы сам лайк
/// вместе с заявкой. Здесь решение и архив сосуществуют, а «новый круг»
/// структурно не может стереть архив — он чистит только UnionSwipe.
model UnionArchive {
  id             String   @id @default(uuid())
  ownerId        String
  owner          User     @relation("UnionArchivesMade", fields: [ownerId], references: [id], onDelete: Cascade)
  archivedUserId String
  archivedUser   User     @relation("UnionArchivesReceived", fields: [archivedUserId], references: [id], onDelete: Cascade)
  createdAt      DateTime @default(now())

  @@unique([ownerId, archivedUserId])
  @@index([ownerId, createdAt(sort: Desc)])
}
```

- [ ] **Step 3: Написать миграцию руками**

Создать `apps/api/prisma/migrations/20260825120000_union_archive/migration.sql`:

```sql
-- CreateTable
CREATE TABLE "UnionArchive" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "archivedUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnionArchive_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UnionArchive_ownerId_archivedUserId_key" ON "UnionArchive"("ownerId", "archivedUserId");

-- CreateIndex
CREATE INDEX "UnionArchive_ownerId_createdAt_idx" ON "UnionArchive"("ownerId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "UnionArchive" ADD CONSTRAINT "UnionArchive_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnionArchive" ADD CONSTRAINT "UnionArchive_archivedUserId_fkey" FOREIGN KEY ("archivedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 4: Применить миграцию и сгенерировать клиент**

Run: `cd apps/api && pnpm prisma migrate deploy && pnpm prisma generate`
Expected: `1 migration found`, `Applied migration(s)`, затем `Generated Prisma Client`

- [ ] **Step 5: Убедиться, что схема валидна**

Run: `cd apps/api && pnpm prisma validate`
Expected: `The schema at prisma\schema.prisma is valid 🚀`

- [ ] **Step 6: Коммит**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260825120000_union_archive
git commit -m "feat(union): таблица архива анкет"
```

---

### Task 2: Общие типы архива и нового круга

**Files:**
- Modify: `packages/shared/src/union.ts` — добавить в конец файла

**Interfaces:**
- Consumes: `UnionUserSummary` из того же файла.
- Produces:
  - `UnionArchiveEntry { user: UnionUserSummary; archivedAt: string }`
  - `UnionArchiveListResponse { items: UnionArchiveEntry[] }`
  - `UnionCycleResetResult { restoredCount: number }`

- [ ] **Step 1: Добавить типы**

В конец `packages/shared/src/union.ts` добавить:

```ts
/** Анкета, убранная в архив: в выдачу не возвращается, пока не вернут вручную. */
export interface UnionArchiveEntry {
  user: UnionUserSummary;
  /** Когда убрали, ISO. */
  archivedAt: string;
}

export interface UnionArchiveListResponse {
  items: UnionArchiveEntry[];
}

/**
 * Итог нового круга. `restoredCount` — сколько пропусков снято; лайки,
 * суперлайки и архив не входят, они переживают начало круга.
 */
export interface UnionCycleResetResult {
  restoredCount: number;
}
```

- [ ] **Step 2: Собрать пакет**

Run: `cd packages/shared && pnpm run build`
Expected: команда завершается без вывода ошибок

- [ ] **Step 3: Коммит**

```bash
git add packages/shared/src/union.ts
git commit -m "feat(union): типы архива и нового круга"
```

---

### Task 3: Сервис архива

**Files:**
- Create: `apps/api/src/modules/union/union-archive.service.ts`
- Create: `apps/api/src/modules/union/union-archive.service.spec.ts`
- Modify: `apps/api/src/modules/union/union.module.ts` — зарегистрировать провайдер

**Interfaces:**
- Consumes: `PrismaService`.
- Produces: класс `UnionArchiveService` с методами
  - `archive(ownerId: string, targetUserId: string): Promise<void>`
  - `restore(ownerId: string, targetUserId: string): Promise<void>`
  - `archivedUserIds(ownerId: string): Promise<Set<string>>`
  - `list(ownerId: string): Promise<UnionArchiveListResponse>`

- [ ] **Step 1: Написать падающий тест**

Создать `apps/api/src/modules/union/union-archive.service.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { UnionArchiveService } from './union-archive.service';

function prismaStub() {
  return {
    unionArchive: {
      upsert: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
}

function service(prisma: ReturnType<typeof prismaStub>) {
  return new UnionArchiveService(prisma as never);
}

describe('UnionArchiveService', () => {
  it('archives idempotently: a second press must not blow up on the unique index', async () => {
    const prisma = prismaStub();

    await service(prisma).archive('me', 'them');

    expect(prisma.unionArchive.upsert).toHaveBeenCalledWith({
      where: { ownerId_archivedUserId: { ownerId: 'me', archivedUserId: 'them' } },
      create: { ownerId: 'me', archivedUserId: 'them' },
      update: {},
    });
  });

  // Иначе человек прячет сам себя и остаётся без собственной анкеты в выдаче.
  it('refuses to archive yourself', async () => {
    await expect(service(prismaStub()).archive('me', 'me')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('restores by pair, not by row id', async () => {
    const prisma = prismaStub();

    await service(prisma).restore('me', 'them');

    expect(prisma.unionArchive.deleteMany).toHaveBeenCalledWith({
      where: { ownerId: 'me', archivedUserId: 'them' },
    });
  });

  it('returns archived ids as a set for exclusion', async () => {
    const prisma = prismaStub();
    prisma.unionArchive.findMany.mockResolvedValue([
      { archivedUserId: 'a' },
      { archivedUserId: 'b' },
    ]);

    const ids = await service(prisma).archivedUserIds('me');

    expect([...ids].sort()).toEqual(['a', 'b']);
  });

  // Наружу уходит духовное имя, если оно есть: правило портала про
  // resolveDisplayName действует и здесь.
  it('shows the spiritual name when the person has one', async () => {
    const prisma = prismaStub();
    prisma.unionArchive.findMany.mockResolvedValue([
      {
        archivedUserId: 'a',
        createdAt: new Date('2026-08-20T10:00:00.000Z'),
        archivedUser: {
          id: 'a',
          name: 'Пётр',
          spiritualName: 'Кешава дас',
          avatarUrl: null,
          city: 'Москва',
          country: 'Россия',
        },
      },
    ]);

    const result = await service(prisma).list('me');

    expect(result.items[0].user.name).toBe('Кешава дас');
    expect(result.items[0].archivedAt).toBe('2026-08-20T10:00:00.000Z');
  });
});
```

- [ ] **Step 2: Запустить и убедиться, что тест падает**

Run: `pnpm --filter @vedamatch/api test -- union-archive.service`
Expected: FAIL — `Cannot find module './union-archive.service'`

- [ ] **Step 3: Написать сервис**

Создать `apps/api/src/modules/union/union-archive.service.ts`:

```ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { resolveDisplayName } from '@vedamatch/shared';
import type { UnionArchiveListResponse } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Архив анкет: «убрать совсем», в отличие от пропуска, который живёт до
 * конца круга. Архивные не возвращаются в колоду даже при
 * `includeSwiped=true` — вернуть их можно только вручную из «Скрытых».
 */
@Injectable()
export class UnionArchiveService {
  constructor(private readonly prisma: PrismaService) {}

  async archive(ownerId: string, targetUserId: string): Promise<void> {
    if (ownerId === targetUserId) {
      throw new BadRequestException('cannot_archive_yourself');
    }
    // upsert, а не create: повторное нажатие на уже убранной анкете —
    // обычное дело (две вкладки, дрожащая рука), и падать на уникальном
    // индексе оно не должно.
    await this.prisma.unionArchive.upsert({
      where: {
        ownerId_archivedUserId: { ownerId, archivedUserId: targetUserId },
      },
      create: { ownerId, archivedUserId: targetUserId },
      update: {},
    });
  }

  async restore(ownerId: string, targetUserId: string): Promise<void> {
    // deleteMany, а не delete: отсутствующая пара — не ошибка, кнопку могли
    // нажать дважды.
    await this.prisma.unionArchive.deleteMany({
      where: { ownerId, archivedUserId: targetUserId },
    });
  }

  /** Кого прячем из выдачи всегда, независимо от фильтров. */
  async archivedUserIds(ownerId: string): Promise<Set<string>> {
    const rows = await this.prisma.unionArchive.findMany({
      where: { ownerId },
      select: { archivedUserId: true },
    });
    return new Set(rows.map((row) => row.archivedUserId));
  }

  async list(ownerId: string): Promise<UnionArchiveListResponse> {
    const rows = await this.prisma.unionArchive.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
      select: {
        archivedUserId: true,
        createdAt: true,
        archivedUser: {
          select: {
            id: true,
            name: true,
            // Обязателен рядом с name: имя наружу собирает resolveDisplayName.
            spiritualName: true,
            avatarUrl: true,
            city: true,
            country: true,
          },
        },
      },
    });

    return {
      items: rows.map((row) => ({
        archivedAt: row.createdAt.toISOString(),
        user: {
          id: row.archivedUser.id,
          name: resolveDisplayName(row.archivedUser),
          avatarUrl: row.archivedUser.avatarUrl,
          // В списке архива хватает обложки: галерею здесь не показываем,
          // человек пришёл решать «вернуть или нет», а не разглядывать.
          photos: [],
          city: row.archivedUser.city,
          country: row.archivedUser.country,
          spiritualStage: null,
          age: null,
          activity: null,
          lastSeenAt: null,
          isVerifiedDevotee: false,
          isPhotoVerified: false,
          contacts: null,
        },
      })),
    };
  }
}
```

- [ ] **Step 4: Запустить тесты — должны пройти**

Run: `pnpm --filter @vedamatch/api test -- union-archive.service`
Expected: PASS, 5 тестов

- [ ] **Step 5: Зарегистрировать провайдер**

В `apps/api/src/modules/union/union.module.ts` добавить импорт:

```ts
import { UnionArchiveService } from './union-archive.service';
```

и включить `UnionArchiveService` в массив `providers`, а также в `exports`, если модуль что-то экспортирует.

- [ ] **Step 6: Коммит**

```bash
git add apps/api/src/modules/union/union-archive.service.ts apps/api/src/modules/union/union-archive.service.spec.ts apps/api/src/modules/union/union.module.ts
git commit -m "feat(union): сервис архива анкет"
```

---

### Task 4: Новый круг — снять только пропуски

**Files:**
- Modify: `apps/api/src/modules/union/union-swipe.service.ts` — добавить метод после `resetHistory`
- Modify: `apps/api/src/modules/union/union-swipe.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService`, существующее поле `undoneAt` в `UnionSwipe`.
- Produces: метод `UnionSwipeService.startNewCycle(fromUserId: string): Promise<UnionCycleResetResult>`

- [ ] **Step 1: Написать падающий тест**

Добавить в `apps/api/src/modules/union/union-swipe.service.spec.ts` новый блок. Стаб призмы и способ создания сервиса взять из соседних тестов этого файла.

```ts
describe('startNewCycle', () => {
  // Главное отличие от resetHistory: лайки и суперлайки переживают новый
  // круг, а заявки по ним не отменяются. Иначе начало круга рассылало бы
  // людям отмены, чего человек не просил.
  it('clears only passes and leaves likes untouched', async () => {
    const prisma = prismaStub();
    prisma.unionSwipe.updateMany = jest.fn().mockResolvedValue({ count: 3 });

    const result = await service(prisma).startNewCycle('me');

    expect(prisma.unionSwipe.updateMany).toHaveBeenCalledWith({
      where: { fromUserId: 'me', decision: 'pass', undoneAt: null },
      data: { undoneAt: expect.any(Date) },
    });
    expect(result.restoredCount).toBe(3);
  });

  it('does not touch connection requests', async () => {
    const prisma = prismaStub();
    prisma.unionSwipe.updateMany = jest.fn().mockResolvedValue({ count: 0 });

    await service(prisma).startNewCycle('me');

    expect(prisma.unionConnectionRequest.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Запустить и убедиться, что тест падает**

Run: `pnpm --filter @vedamatch/api test -- union-swipe.service`
Expected: FAIL — `service(prisma).startNewCycle is not a function`

- [ ] **Step 3: Написать метод**

В `apps/api/src/modules/union/union-swipe.service.ts` добавить сразу после метода `resetHistory` (он заканчивается на строке с `return { restoredCount };`):

```ts
  /**
   * Новый круг: снимаем только пропуски. Лайки, суперлайки и архив
   * переживают его — по лайку уже ушла заявка, и отменять её человек не
   * просил, а архив на то и архив. Этим начало круга отличается от
   * `resetHistory`, которое стирает вообще всё и отменяет заявки.
   *
   * Переиспользуем `undoneAt`: выдача и так считает откатанные свайпы
   * несуществующими, отдельного признака «круг» заводить не нужно.
   */
  async startNewCycle(fromUserId: string): Promise<UnionCycleResetResult> {
    const { count } = await this.prisma.unionSwipe.updateMany({
      where: { fromUserId, decision: 'pass', undoneAt: null },
      data: { undoneAt: new Date() },
    });
    return { restoredCount: count };
  }
```

Добавить `UnionCycleResetResult` в существующий `import type { ... } from '@vedamatch/shared';` в шапке файла.

- [ ] **Step 4: Запустить тесты — должны пройти**

Run: `pnpm --filter @vedamatch/api test -- union-swipe.service`
Expected: PASS

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/modules/union/union-swipe.service.ts apps/api/src/modules/union/union-swipe.service.spec.ts
git commit -m "feat(union): новый круг снимает только пропуски"
```

---

### Task 5: Архивные исчезают из выдачи

**Files:**
- Modify: `apps/api/src/modules/union/union-profile.service.ts:338-351` и `:386`

**Interfaces:**
- Consumes: `UnionArchiveService.archivedUserIds`.
- Produces: ничего наружу; меняется поведение `recommendations`.

- [ ] **Step 1: Внедрить сервис архива**

В `apps/api/src/modules/union/union-profile.service.ts` добавить в `constructor` параметр рядом с существующим `private readonly swipes: UnionSwipeService`:

```ts
    private readonly archive: UnionArchiveService,
```

и импорт в шапке:

```ts
import { UnionArchiveService } from './union-archive.service';
```

- [ ] **Step 2: Исключить архивных из кандидатов**

Заменить строки 338-351 (получение `hidden`/`swiped` и `excludedUserIds`) на:

```ts
    const hidden = await this.moderation.hiddenUserIds(userId, 'union');
    const swiped = await this.swipes.swipedUserIds(userId);
    // Архив прячется всегда, наравне с hidden от модерации: «показывать уже
    // отсмотренных» на него не распространяется — иначе галочка в фильтрах
    // молча отменяла бы осознанное «убрать совсем».
    const archived = await this.archive.archivedUserIds(userId);

    const others = await this.prisma.unionProfile.findMany({
      where: buildRecommendationCandidateWhere({
        userId,
        excludedUserIds: normalizedFilters.includeSwiped
          ? [...hidden, ...archived]
          : [...swiped, ...hidden, ...archived],
```

- [ ] **Step 3: Исключить архивных во втором фильтре**

Заменить строку 386 (`.filter((other) => !hidden.has(other.userId))`) на:

```ts
      .filter((other) => !hidden.has(other.userId) && !archived.has(other.userId))
```

- [ ] **Step 4: Прогнать тесты модуля**

Run: `pnpm --filter @vedamatch/api test -- union`
Expected: PASS. Если конструктор `UnionProfileService` собирается в тестах вручную, добавить туда заглушку архива: `{ archivedUserIds: async () => new Set<string>() }`.

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/modules/union/union-profile.service.ts apps/api/src/modules/union/*.spec.ts
git commit -m "feat(union): архивные анкеты не возвращаются в выдачу"
```

---

### Task 6: Эндпоинты архива и круга

Существующий `union-swipe.controller.ts` объявлен как `@Controller('union/swipes')`, поэтому архив в него не вписать — маршруты стали бы `/union/swipes/archive`. Для архива заводим свой контроллер, а новый круг добавляем в контроллер свайпов, где ему и место.

**Files:**
- Create: `apps/api/src/modules/union/union-archive.controller.ts`
- Modify: `apps/api/src/modules/union/union-swipe.controller.ts`
- Modify: `apps/api/src/modules/union/union.module.ts` — зарегистрировать контроллер

**Interfaces:**
- Consumes: `UnionArchiveService`, `UnionSwipeService.startNewCycle`.
- Produces: HTTP-маршруты
  - `GET /union/archive` → `UnionArchiveListResponse`
  - `POST /union/archive/:userId` → `204`
  - `DELETE /union/archive/:userId` → `204`
  - `POST /union/swipes/new-cycle` → `UnionCycleResetResult`

- [ ] **Step 1: Написать контроллер архива**

Создать `apps/api/src/modules/union/union-archive.controller.ts`, повторив стиль шапки `union-swipe.controller.ts` (те же импорты `AuthGuard`, `CurrentUser`, `AccessTokenPayload`):

```ts
import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AccessTokenPayload } from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { UnionArchiveService } from './union-archive.service';

@Controller('union/archive')
@UseGuards(AuthGuard)
export class UnionArchiveController {
  constructor(private readonly archive: UnionArchiveService) {}

  @Get()
  list(@CurrentUser() user: AccessTokenPayload) {
    return this.archive.list(user.sub);
  }

  @Post(':userId')
  @HttpCode(204)
  async add(
    @CurrentUser() user: AccessTokenPayload,
    @Param('userId') userId: string,
  ) {
    await this.archive.archive(user.sub, userId);
  }

  @Delete(':userId')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AccessTokenPayload,
    @Param('userId') userId: string,
  ) {
    await this.archive.restore(user.sub, userId);
  }
}
```

- [ ] **Step 2: Добавить новый круг в контроллер свайпов**

В `apps/api/src/modules/union/union-swipe.controller.ts` добавить рядом с методом, обслуживающим `resetHistory`:

```ts
  /** Новый круг: снимает пропуски, но не лайки и не архив. */
  @Post('new-cycle')
  startNewCycle(@CurrentUser() user: AccessTokenPayload) {
    return this.swipes.startNewCycle(user.sub);
  }
```

Убедиться, что `Post` есть в импорте из `@nestjs/common`.

- [ ] **Step 3: Зарегистрировать контроллер**

В `apps/api/src/modules/union/union.module.ts` добавить импорт `UnionArchiveController` и включить его в массив `controllers`.

- [ ] **Step 4: Проверить, что тесты модуля зелёные**

Run: `pnpm --filter @vedamatch/api test -- union`
Expected: PASS

- [ ] **Step 5: Коммит**

```bash
git add apps/api/src/modules/union
git commit -m "feat(union): маршруты архива и нового круга"
```

---

### Task 7: Серверное чтение архива

`union-api.ts` — серверный модуль: он берёт токен через `cookies()` и ходит на `API_INTERNAL_URL`. Из браузера его вызывать нельзя, поэтому здесь только чтение списка. Мутации (архивировать, вернуть, новый круг) живут в клиентских компонентах через `apiFetch` — ровно так, как это уже сделано в `swipe-deck.tsx`, где рядом объявлена своя константа `API_URL` из `NEXT_PUBLIC_API_URL`.

**Files:**
- Modify: `apps/web/src/lib/union-api.ts`

**Interfaces:**
- Consumes: `unionGet`, тип `UnionArchiveListResponse` из Task 2.
- Produces: `getUnionArchive(): Promise<UnionArchiveListResponse | null>`

- [ ] **Step 1: Добавить чтение архива**

В `apps/web/src/lib/union-api.ts` добавить `UnionArchiveListResponse` в существующий `import type { ... } from "@vedamatch/shared";` и рядом с `getUnionBlocks` (строка 52) добавить:

```ts
export const getUnionArchive = () =>
  unionGet<UnionArchiveListResponse>("/union/archive");
```

- [ ] **Step 2: Проверить типы**

Run: `cd apps/web && pnpm exec tsc --noEmit -p tsconfig.json`
Expected: без вывода

- [ ] **Step 3: Коммит**

```bash
git add apps/web/src/lib/union-api.ts
git commit -m "feat(union): серверное чтение архива"
```

---

### Task 8: Кнопка архива в колоде

**Files:**
- Create: `apps/web/src/components/union/archive-button.tsx`
- Modify: `apps/web/src/components/union/swipe-deck.tsx`
- Modify: `apps/web/src/components/union/swipe-deck.spec.tsx`

**Interfaces:**
- Consumes: `apiFetch` из `@/lib/http-client`, `NEXT_PUBLIC_API_URL`.
- Produces: компонент `ArchiveButton({ userId, onArchived }: { userId: string; onArchived: () => void })` с `aria-label="Убрать в архив"`.

- [ ] **Step 1: Написать падающий тест**

Добавить в `apps/web/src/components/union/swipe-deck.spec.tsx`:

```tsx
  it("offers archiving from the deck", () => {
    render(<SwipeDeck items={[recommendation()]} />);

    expect(
      screen.getByRole("button", { name: "Убрать в архив" }),
    ).toBeInTheDocument();
  });
```

- [ ] **Step 2: Запустить и убедиться, что тест падает**

Run: `pnpm --filter @vedamatch/web exec vitest run src/components/union/swipe-deck.spec.tsx`
Expected: FAIL — `Unable to find an accessible element with the role "button" and name "Убрать в архив"`

- [ ] **Step 3: Написать компонент**

Создать `apps/web/src/components/union/archive-button.tsx`:

```tsx
"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/http-client";

// Свой API_URL, как в swipe-deck.tsx: lib/union-api.ts — серверный модуль,
// из браузера он недоступен.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * «Убрать совсем» — в отличие от крестика, который прячет анкету только до
 * конца круга. Стоит сверху слева, отдельно от ряда решений: это не выбор
 * между людьми, а изъятие человека из выдачи, и путать их кнопками рядом
 * не стоит.
 */
export function ArchiveButton({
  userId,
  onArchived,
}: {
  userId: string;
  onArchived: () => void;
}) {
  const [pending, setPending] = useState(false);

  async function archive() {
    if (pending) return;
    setPending(true);
    try {
      const res = await apiFetch(
        `${API_URL}/union/archive/${encodeURIComponent(userId)}`,
        { method: "POST", credentials: "include" },
      );
      if (res.ok) onArchived();
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void archive()}
      disabled={pending}
      aria-label="Убрать в архив"
      title="Убрать в архив — вернуть можно в разделе «Скрытые»"
      className="absolute left-3 top-20 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur transition hover:bg-black/65 disabled:opacity-50"
    >
      <BoxIcon />
    </button>
  );
}

/** Коробка: своя фигура, а не эмодзи — 📦 менялся бы от устройства к устройству. */
function BoxIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 8.5 12 4l9 4.5v7L12 20l-9-4.5z" />
      <path d="M3 8.5 12 13l9-4.5" />
      <path d="M12 13v7" />
    </svg>
  );
}
```

- [ ] **Step 4: Подключить в колоду**

В `apps/web/src/components/union/swipe-deck.tsx` добавить импорт:

```tsx
import { ArchiveButton } from "./archive-button";
```

и вставить сразу перед `<UnionBoostButton />`:

```tsx
        {/* Архив ведёт себя как решение: анкета уходит, колода едет дальше. */}
        <ArchiveButton
          userId={current.user.id}
          onArchived={() => {
            router.refresh();
            advance("left");
          }}
        />
```

- [ ] **Step 5: Запустить тесты — должны пройти**

Run: `pnpm --filter @vedamatch/web exec vitest run src/components/union/swipe-deck.spec.tsx`
Expected: PASS

- [ ] **Step 6: Проверить типы и линт**

Run: `cd apps/web && pnpm exec tsc --noEmit -p tsconfig.json && pnpm exec eslint src/components/union/archive-button.tsx src/components/union/swipe-deck.tsx`
Expected: обе команды без вывода

- [ ] **Step 7: Коммит**

```bash
git add apps/web/src/components/union/archive-button.tsx apps/web/src/components/union/swipe-deck.tsx apps/web/src/components/union/swipe-deck.spec.tsx
git commit -m "feat(union): кнопка архива на карточке"
```

---

### Task 9: Конец круга — «Показать заново»

Экран «Колода закончилась» сейчас предлагает `setIndex(0)`, что показывает те же анкеты, но решения по ним уже записаны. Заменяем на честное начало круга.

**Files:**
- Modify: `apps/web/src/components/union/swipe-deck.tsx:168-187` (блок `if (!current)`)
- Modify: `apps/web/src/components/union/swipe-deck.spec.tsx`

**Interfaces:**
- Consumes: `apiFetch` (уже импортирован в `swipe-deck.tsx`), `EVERYTHING_URL` из `./recommendation-empty-state`.
- Produces: ничего наружу.

- [ ] **Step 1: Написать падающий тест**

Добавить в `apps/web/src/components/union/swipe-deck.spec.tsx`:

```tsx
  it("offers a new cycle and the escape hatch when the deck runs out", () => {
    render(<SwipeDeck items={[]} />);

    expect(
      screen.getByRole("button", { name: "Показать заново" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Показать вообще всех" }),
    ).toHaveAttribute("href", "/union/recommendations?includeSwiped=true");
  });
```

- [ ] **Step 2: Запустить и убедиться, что тест падает**

Run: `pnpm --filter @vedamatch/web exec vitest run src/components/union/swipe-deck.spec.tsx`
Expected: FAIL — найдена кнопка «Пройти заново», а не «Показать заново»

- [ ] **Step 3: Переписать блок конца колоды**

В `apps/web/src/components/union/swipe-deck.tsx` заменить содержимое `if (!current) { return ( ... ) }` на:

```tsx
  if (!current) {
    return (
      <div className="glass rounded-3xl border border-glass-brd p-10 text-center">
        <p className="mb-2 font-display text-lg font-bold text-text-0">
          Круг пройден
        </p>
        <p className="text-sm text-text-1">
          Вы посмотрели всех, кто подходит по текущим фильтрам. Можно начать
          круг заново — пропущенные вернутся, лайки и архив останутся как есть.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            disabled={recycling}
            onClick={() => void newCycle()}
            className="rounded-xl bg-gradient-to-r from-magenta to-[#B23EFF] px-5 py-2.5 text-sm font-semibold text-white transition hover:shadow-[0_0_20px_var(--vm-glow-magenta)] disabled:opacity-50"
          >
            {recycling ? "Начинаем…" : "Показать заново"}
          </button>
          {/* Второй выход — когда дело не в круге, а в фильтрах. */}
          <a
            href={EVERYTHING_URL}
            className="text-sm font-medium text-text-2 underline-offset-4 transition hover:text-text-0 hover:underline"
          >
            Показать вообще всех
          </a>
        </div>
      </div>
    );
  }
```

- [ ] **Step 4: Добавить состояние и обработчик**

В `apps/web/src/components/union/swipe-deck.tsx` рядом с остальными `useState` добавить:

```tsx
  const [recycling, setRecycling] = useState(false);
```

и рядом с `undo()` — обработчик:

```tsx
  /** Начало нового круга: сервер снимает пропуски, выдача перечитывается. */
  async function newCycle() {
    if (recycling) return;
    setRecycling(true);
    try {
      const res = await apiFetch(`${API_URL}/union/swipes/new-cycle`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      setIndex(0);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось начать круг заново");
    } finally {
      setRecycling(false);
    }
  }
```

`apiFetch` и `API_URL` в этом файле уже есть. Добавить один импорт:

```tsx
import { EVERYTHING_URL } from "./recommendation-empty-state";
```

- [ ] **Step 5: Запустить тесты — должны пройти**

Run: `pnpm --filter @vedamatch/web exec vitest run src/components/union/swipe-deck.spec.tsx`
Expected: PASS

- [ ] **Step 6: Коммит**

```bash
git add apps/web/src/components/union/swipe-deck.tsx apps/web/src/components/union/swipe-deck.spec.tsx
git commit -m "feat(union): конец круга предлагает начать заново"
```

---

### Task 10: Раздел «Скрытые» с двумя вкладками

**Files:**
- Create: `apps/web/src/app/(portal)/union/hidden/page.tsx`
- Create: `apps/web/src/components/union/hidden-people.tsx`
- Create: `apps/web/src/components/union/hidden-people.spec.tsx`
- Modify: `apps/web/src/components/union/union-nav.tsx` — добавить ссылку

**Interfaces:**
- Consumes: `getUnionArchive`, `getUnionBlocks`, `restoreUnionUser` из Task 7 и существующего клиента.
- Produces: компонент `HiddenPeople({ archive, blocked })`.

- [ ] **Step 1: Написать падающий тест**

Создать `apps/web/src/components/union/hidden-people.spec.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HiddenPeople } from "./hidden-people";

vi.mock("@/lib/union-api", () => ({
  restoreUnionUser: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const archive = [
  {
    archivedAt: "2026-08-20T10:00:00.000Z",
    user: {
      id: "u1",
      name: "Кешава дас",
      avatarUrl: null,
      photos: [],
      city: "Москва",
      country: "Россия",
      spiritualStage: null,
      age: null,
      activity: null,
      lastSeenAt: null,
      isVerifiedDevotee: false,
      isPhotoVerified: false,
      contacts: null,
    },
  },
];

describe("HiddenPeople", () => {
  it("opens on the archive tab and lists archived people", () => {
    render(<HiddenPeople archive={archive} blocked={[]} />);

    expect(screen.getByText("Кешава дас")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Вернуть в выдачу" }),
    ).toBeInTheDocument();
  });

  it("switches to the blocked tab", async () => {
    const user = userEvent.setup();
    render(
      <HiddenPeople
        archive={archive}
        blocked={[
          { userId: "b1", name: "Пётр", createdAt: "2026-08-01T00:00:00.000Z" },
        ]}
      />,
    );

    await user.click(screen.getByRole("tab", { name: /Заблокированные/ }));

    expect(screen.getByText("Пётр")).toBeInTheDocument();
    expect(screen.queryByText("Кешава дас")).not.toBeInTheDocument();
  });

  // Пустая вкладка должна объяснять, чем она наполняется: иначе человек
  // решит, что раздел сломан.
  it("explains an empty archive instead of showing a blank box", () => {
    render(<HiddenPeople archive={[]} blocked={[]} />);

    expect(screen.getByText(/Архив пуст/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Запустить и убедиться, что тест падает**

Run: `pnpm --filter @vedamatch/web exec vitest run src/components/union/hidden-people.spec.tsx`
Expected: FAIL — `Failed to load .../hidden-people`

- [ ] **Step 3: Написать компонент**

Создать `apps/web/src/components/union/hidden-people.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { UnionArchiveEntry } from "@vedamatch/shared";
import { restoreUnionUser } from "@/lib/union-api";

type Tab = "archive" | "blocked";

/** Совпадает с UserBlockDto из @vedamatch/shared: аватара там нет. */
interface BlockedPerson {
  userId: string;
  name: string;
  createdAt: string;
}

/**
 * Архив и блокировки — одна сущность «спрятанные мной», разные причины,
 * поэтому один раздел с двумя вкладками, а не два пункта меню. Пять
 * отдельных списков людей в сервисе никто бы не удержал в голове.
 */
export function HiddenPeople({
  archive,
  blocked,
}: {
  archive: UnionArchiveEntry[];
  blocked: BlockedPerson[];
}) {
  const [tab, setTab] = useState<Tab>("archive");

  return (
    <div>
      <div role="tablist" className="mb-4 flex gap-2">
        <TabButton active={tab === "archive"} onClick={() => setTab("archive")}>
          Архив · {archive.length}
        </TabButton>
        <TabButton active={tab === "blocked"} onClick={() => setTab("blocked")}>
          Заблокированные · {blocked.length}
        </TabButton>
      </div>

      {tab === "archive" ? (
        archive.length === 0 ? (
          <EmptyNote>
            Архив пуст. Сюда попадают анкеты, убранные кнопкой «В архив» — в
            выдаче они больше не появятся, пока вы их не вернёте.
          </EmptyNote>
        ) : (
          <ul className="space-y-2">
            {archive.map((entry) => (
              <ArchiveRow key={entry.user.id} entry={entry} />
            ))}
          </ul>
        )
      ) : blocked.length === 0 ? (
        <EmptyNote>
          Заблокированных нет. Блокировка действует на всём портале, а не
          только в Знакомствах.
        </EmptyNote>
      ) : (
        <ul className="space-y-2">
          {blocked.map((person) => (
            <li
              key={person.userId}
              className="glass flex items-center gap-3 rounded-2xl border border-glass-brd p-3"
            >
              <Avatar name={person.name} url={null} />
              <span className="min-w-0 flex-1 truncate text-sm text-text-0">
                {person.name}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ArchiveRow({ entry }: { entry: UnionArchiveEntry }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function restore() {
    if (pending) return;
    setPending(true);
    try {
      const res = await restoreUnionUser(entry.user.id);
      if (res.ok) router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <li className="glass flex items-center gap-3 rounded-2xl border border-glass-brd p-3">
      <Avatar name={entry.user.name} url={entry.user.avatarUrl} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-text-0">{entry.user.name}</p>
        {entry.user.city && (
          <p className="truncate text-xs text-text-2">{entry.user.city}</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => void restore()}
        disabled={pending}
        aria-label="Вернуть в выдачу"
        className="rounded-xl border border-glass-brd px-3 py-1.5 text-xs font-medium text-text-1 transition hover:text-text-0 disabled:opacity-50"
      >
        {pending ? "Возвращаем…" : "Вернуть"}
      </button>
    </li>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
        active
          ? "bg-glass-brd/60 text-text-0"
          : "text-text-2 hover:text-text-0"
      }`}
    >
      {children}
    </button>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="glass rounded-3xl border border-glass-brd p-8 text-center text-sm text-text-1">
      {children}
    </div>
  );
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element -- аватар из внешнего хранилища
    return (
      <img
        src={url}
        alt=""
        className="h-10 w-10 shrink-0 rounded-full object-cover"
        referrerPolicy="no-referrer"
      />
    );
  }
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-glass text-sm font-semibold text-text-0">
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
```

- [ ] **Step 4: Запустить тесты — должны пройти**

Run: `pnpm --filter @vedamatch/web exec vitest run src/components/union/hidden-people.spec.tsx`
Expected: PASS, 3 теста

- [ ] **Step 5: Написать страницу**

Создать `apps/web/src/app/(portal)/union/hidden/page.tsx`. Взять за образец шапку соседней страницы `apps/web/src/app/(portal)/union/recommendations/page.tsx` (`requireUser`, `UnionTopBar`, `UnionNav`, `UnionTabBar`, `BackgroundOrbs`, `NoiseOverlay`) и подставить содержимое:

```tsx
        <UnionNav incomingPending={counts?.incomingPending ?? 0} />

        <h1 className="mb-1 mt-6 font-display text-2xl font-bold text-text-0">
          Скрытые
        </h1>
        <p className="mb-6 text-sm text-text-1">
          Кого вы убрали из выдачи сами. Архив можно вернуть в любой момент.
        </p>

        <HiddenPeople
          archive={archive?.items ?? []}
          blocked={blocks?.blocked ?? []}
        />
```

с загрузкой данных в начале компонента:

```tsx
  const [archive, blocks, counts] = await Promise.all([
    getUnionArchive().catch(() => null),
    getUnionBlocks().catch(() => null),
    getUnionConnectionCounts().catch(() => null),
  ]);
```

- [ ] **Step 6: Добавить ссылку в навигацию**

В `apps/web/src/components/union/union-nav.tsx` добавить пункт `{ href: "/union/hidden", label: "Скрытые" }` в конец списка ссылок, повторив структуру соседних элементов.

- [ ] **Step 7: Проверить типы и линт**

Run: `cd apps/web && pnpm exec tsc --noEmit -p tsconfig.json && pnpm exec eslint src/components/union "src/app/(portal)/union"`
Expected: обе команды без вывода

- [ ] **Step 8: Коммит**

```bash
git add "apps/web/src/app/(portal)/union/hidden" apps/web/src/components/union/hidden-people.tsx apps/web/src/components/union/hidden-people.spec.tsx apps/web/src/components/union/union-nav.tsx
git commit -m "feat(union): раздел «Скрытые» с архивом и блокировками"
```

---

### Task 11: Проверка в браузере

**Files:** нет (ручная проверка)

- [ ] **Step 1: Поднять окружение**

Через preview-инструменты запустить `api`, дождаться ответа `curl -sf http://localhost:4000/auth/dev-accounts`, затем `web`. Не запускать `pnpm dev` фоном из Bash.

- [ ] **Step 2: Пройти проверочный список**

Войти демо-аккаунтом (пароль `vedamatch`), открыть `/union/recommendations`, режим «Свайпами»:

1. Сверху слева появилась кнопка «Убрать в архив».
2. Нажать её — анкета ушла, счётчик уменьшился.
3. Открыть `/union/hidden` — человек в списке архива, вкладка «Заблокированные» переключается.
4. Нажать «Вернуть» — строка исчезла из архива.
5. Вернуться в выдачу — человек снова в колоде.
6. Заархивировать снова и открыть выдачу с `?includeSwiped=true` — архивного там **нет** (в отличие от пропущенных).
7. Пройти колоду крестиками до конца — появился экран «Круг пройден» с «Показать заново» и «Показать вообще всех».
8. Нажать «Показать заново» — пропущенные вернулись, архивный не вернулся.
9. Проверить, что ранее отправленный лайк после нового круга не отменился: `/union/likes` показывает ту же заявку.

- [ ] **Step 3: Коммит, если правки понадобились**

```bash
git add -A apps/web/src apps/api/src
git commit -m "fix(union): правки после проверки архива и круга"
```
