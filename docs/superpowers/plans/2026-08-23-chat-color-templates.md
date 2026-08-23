# Конструктор цвета чата Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Пользователь заводит именованные шаблоны цвета переписки (пузырь свой/чужой, акцент, фон) и применяет любой из них к любой своей беседе — приватно, не меняя вид беседы у остальных участников.

**Architecture:** Две новые Prisma-модели в модуле `chat` (`ChatColorTemplate` — шаблоны пользователя, `ChatConversationTheme` — какой шаблон применён к какой беседе у какого пользователя). Бэкенд отдаёт применённый шаблон беседы; фронтенд превращает его в CSS-переменные на корневом контейнере беседы, а компоненты сообщений читают эти переменные с фолбэком на нынешние токены темы, так что беседа без шаблона выглядит как прежде. Контраст текста внутри пузыря считается автоматически по яркости фона.

**Tech Stack:** NestJS + Prisma (Postgres) на `apps/api`, Next.js App Router + Tailwind v4 на `apps/web`, Jest на бэкенде, Vitest + Testing Library на фронтенде.

## Global Constraints

- Сервис = только `apps/api/src/modules/chat/` и зеркало во фронтенде (`apps/web/src/{app,components,lib}/chat*`); модуль `chat` другие фичевые модули не импортирует.
- Цвет — один hex на элемент, без градиентов (`^#[0-9a-fA-F]{6}$`).
- Настройка приватна: не меняет вид беседы у других участников.
- Модели именуются с префиксом `Chat`, добавляются в конец `schema.prisma`, FK на `User` разрешён.
- `pnpm prisma migrate dev` в этом репозитории **нельзя** — база разойдётся с `prisma/migrations` и Prisma предложит `reset`. Миграция пишется вручную (см. Task 1).
- Имя пользователя наружу — не относится к этой фиче (шаблоны не содержат имён других людей).
- Тесты: чистая логика (валидация hex, автоконтраст) — в отдельном модуле, покрыта тестом, даже если обёртка вокруг неё не тестируется.

---

### Task 1: Prisma-модели и миграция

**Files:**
- Modify: `apps/api/prisma/schema.prisma:339-345` (добавить два back-relation поля на `User`)
- Modify: `apps/api/prisma/schema.prisma` (конец файла, после `ChatReport`, строка 3695) — добавить `ChatColorTemplate` и `ChatConversationTheme`
- Create: `apps/api/prisma/migrations/<YYYYMMDDHHMMSS>_chat_color_templates/migration.sql`

**Interfaces:**
- Produces: Prisma-клиент с моделями `prisma.chatColorTemplate` и `prisma.chatConversationTheme`, полями `id, userId, name, bubbleMine, bubbleTheirs, accent, background, createdAt, updatedAt` (`ChatColorTemplate`) и `userId, conversationId, templateId, updatedAt` (`ChatConversationTheme`, составной `@@id([userId, conversationId])`).

- [ ] **Step 1: Добавить back-relation поля на `User`**

В `apps/api/prisma/schema.prisma` заменить блок (строки 339-345):

```prisma
  chatConversationsCreated           ChatConversation[]           @relation("ChatConversationsCreated")
  chatMemberships                    ChatMember[]                 @relation("ChatMemberships")
  chatMessagesSent                   ChatMessage[]                @relation("ChatMessagesSent")
  chatReactionsMade                  ChatMessageReaction[]        @relation("ChatReactionsMade")
  chatReportsMade                    ChatReport[]                 @relation("ChatReportsMade")
  chatReportsDecided                 ChatReport[]                 @relation("ChatReportsDecided")
  chatMessageViews                   ChatMessageView[]            @relation("ChatMessageViews")
```

на:

```prisma
  chatConversationsCreated           ChatConversation[]           @relation("ChatConversationsCreated")
  chatMemberships                    ChatMember[]                 @relation("ChatMemberships")
  chatMessagesSent                   ChatMessage[]                @relation("ChatMessagesSent")
  chatReactionsMade                  ChatMessageReaction[]        @relation("ChatReactionsMade")
  chatReportsMade                    ChatReport[]                 @relation("ChatReportsMade")
  chatReportsDecided                 ChatReport[]                 @relation("ChatReportsDecided")
  chatMessageViews                   ChatMessageView[]            @relation("ChatMessageViews")
  chatColorTemplates                 ChatColorTemplate[]          @relation("ChatColorTemplates")
  chatConversationThemes             ChatConversationTheme[]      @relation("ChatConversationThemes")
```

- [ ] **Step 2: Добавить модели в конец `schema.prisma`**

После последней строки файла (закрывающая `}` модели `ChatReport`, строка 3695) дописать:

```prisma

/**
 * Именованный шаблон цвета переписки. Один пользователь заводит несколько,
 * каждый можно применить к любой своей беседе — см. ChatConversationTheme.
 * Цвет — сплошной hex на элемент, без градиентов.
 */
model ChatColorTemplate {
  id     String @id @default(cuid())
  userId String
  user   User   @relation("ChatColorTemplates", fields: [userId], references: [id], onDelete: Cascade)

  name         String
  bubbleMine   String
  bubbleTheirs String
  accent       String
  background   String

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  themes ChatConversationTheme[]

  @@index([userId])
}

/**
 * Какой шаблон применён к какой беседе у какого пользователя — приватная
 * настройка просмотра, не видна другим участникам беседы.
 *
 * `templateId: null` при существующей строке — это явный сброс на
 * оформление по умолчанию, отличается от отсутствия строки («никогда не
 * настраивал»), хотя рендерится одинаково.
 */
model ChatConversationTheme {
  userId         String
  user           User               @relation("ChatConversationThemes", fields: [userId], references: [id], onDelete: Cascade)
  conversationId String
  templateId     String?
  template       ChatColorTemplate? @relation(fields: [templateId], references: [id], onDelete: SetNull)

  updatedAt DateTime @updatedAt

  @@id([userId, conversationId])
}
```

- [ ] **Step 3: Сгенерировать SQL-заготовку и вручную выделить из неё свои изменения**

Из `apps/api`:

```bash
cd apps/api
npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script > /tmp/chat-color-diff.sql
```

Открыть `/tmp/chat-color-diff.sql` и скопировать в новый файл **только** блоки `CREATE TABLE "ChatColorTemplate"`, `CREATE TABLE "ChatConversationTheme"` и относящиеся к ним `CREATE INDEX` / `ALTER TABLE ... ADD CONSTRAINT` (внешние ключи на `User` и на `ChatColorTemplate`). Не копировать ничего, что говорит `DROP` — по памяти проекта `prisma-migrations-by-hand`, diff покажет и чужой дрейф (trgm-индексы, дефолты), который трогать нельзя.

Создать файл (имя папки — текущее время по маске `YYYYMMDDHHMMSS`, например `20260823120000_chat_color_templates`):

`apps/api/prisma/migrations/20260823120000_chat_color_templates/migration.sql`

```sql
CREATE TABLE "ChatColorTemplate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bubbleMine" TEXT NOT NULL,
    "bubbleTheirs" TEXT NOT NULL,
    "accent" TEXT NOT NULL,
    "background" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatColorTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChatColorTemplate_userId_idx" ON "ChatColorTemplate"("userId");

CREATE TABLE "ChatConversationTheme" (
    "userId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "templateId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatConversationTheme_pkey" PRIMARY KEY ("userId","conversationId")
);

ALTER TABLE "ChatColorTemplate" ADD CONSTRAINT "ChatColorTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChatConversationTheme" ADD CONSTRAINT "ChatConversationTheme_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChatConversationTheme" ADD CONSTRAINT "ChatConversationTheme_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ChatColorTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 4: Накатить SQL руками и отметить миграцию применённой**

Из `apps/api`:

```bash
npx prisma db execute --file prisma/migrations/20260823120000_chat_color_templates/migration.sql --schema prisma/schema.prisma
npx prisma migrate resolve --applied 20260823120000_chat_color_templates
npx prisma migrate status
```

Expected: последняя команда печатает «Database schema is up to date!» без расхождений.

- [ ] **Step 5: Перегенерировать Prisma-клиент**

```bash
npx prisma generate
```

Expected: `Generated Prisma Client` без ошибок. Если упадёт с `EPERM` на `query_engine-windows.dll.node` — остановить локальный dev-сервер API и повторить.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(chat): модели ChatColorTemplate и ChatConversationTheme"
```

---

### Task 2: Общие типы (`@vedamatch/shared`)

**Files:**
- Modify: `packages/shared/src/chat.ts` (добавить в конец файла)

**Interfaces:**
- Produces: `ChatColorTemplateDto`, `ChatColorTemplatesState`, `SaveChatColorTemplateRequest`, `ChatConversationThemeState`, `SetChatConversationThemeRequest`, `CHAT_COLOR_HEX_PATTERN`, `CHAT_COLOR_TEMPLATE_MAX_NAME_LENGTH` — используются в Task 3-9.

- [ ] **Step 1: Дописать типы в конец `packages/shared/src/chat.ts`**

```typescript
/**
 * Конструктор цвета чата: именованные шаблоны оформления переписки.
 * Приватная настройка просмотра — см. docs/superpowers/specs/2026-08-23-chat-color-templates-design.md.
 */
export const CHAT_COLOR_HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;
export const CHAT_COLOR_TEMPLATE_MAX_NAME_LENGTH = 40;

export interface ChatColorTemplateDto {
  id: string;
  name: string;
  bubbleMine: string;
  bubbleTheirs: string;
  accent: string;
  background: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatColorTemplatesState {
  templates: ChatColorTemplateDto[];
}

export interface SaveChatColorTemplateRequest {
  name: string;
  bubbleMine: string;
  bubbleTheirs: string;
  accent: string;
  background: string;
}

/** `templateId: null` — оформление по умолчанию. */
export interface ChatConversationThemeState {
  templateId: string | null;
}

export interface SetChatConversationThemeRequest {
  templateId: string | null;
}
```

- [ ] **Step 2: Собрать пакет**

```bash
pnpm --filter @vedamatch/shared build
```

Expected: команда завершается без ошибок, `packages/shared/dist/chat.js` и `.d.ts` обновлены.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/chat.ts packages/shared/dist
git commit -m "feat(shared): типы шаблонов цвета чата"
```

---

### Task 3: Backend — `ChatColorTemplatesService` (CRUD шаблонов)

**Files:**
- Create: `apps/api/src/modules/chat/chat-color-templates.service.ts`
- Test: `apps/api/src/modules/chat/chat-color-templates.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService` (`prisma.chatColorTemplate.{findMany,create,update,delete,findFirst}`), типы из Task 2.
- Produces: класс `ChatColorTemplatesService` с методами `list(userId): Promise<ChatColorTemplatesState>`, `create(userId, dto: SaveChatColorTemplateRequest): Promise<ChatColorTemplateDto>`, `update(userId, id, dto): Promise<ChatColorTemplateDto>`, `remove(userId, id): Promise<{ ok: true }>` — используются в Task 5 (контроллер).

- [ ] **Step 1: Написать падающий тест**

`apps/api/src/modules/chat/chat-color-templates.service.spec.ts`:

```typescript
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ChatColorTemplatesService } from './chat-color-templates.service';

const createdAt = new Date('2026-08-23T10:00:00.000Z');

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'tpl-1',
    userId: 'user-1',
    name: 'Синий',
    bubbleMine: '#23F0C7',
    bubbleTheirs: '#1A1A2E',
    accent: '#5CCCCC',
    background: '#0A0614',
    createdAt,
    updatedAt: createdAt,
    ...over,
  };
}

function fn(impl?: (...args: never[]) => unknown): jest.Mock {
  return jest.fn(impl as never);
}

describe('ChatColorTemplatesService', () => {
  const prisma = {
    chatColorTemplate: {
      findMany: fn(() => Promise.resolve([row()])),
      findFirst: fn(() => Promise.resolve(row())),
      create: fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve(row(args.data)),
      ),
      update: fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve(row(args.data)),
      ),
      delete: fn(() => Promise.resolve(row())),
    },
  };

  const validDto = {
    name: 'Синий',
    bubbleMine: '#23F0C7',
    bubbleTheirs: '#1A1A2E',
    accent: '#5CCCCC',
    background: '#0A0614',
  };

  function service() {
    return new ChatColorTemplatesService(prisma as never);
  }

  beforeEach(() => jest.clearAllMocks());

  it('отдаёт шаблоны только текущего пользователя', async () => {
    await service().list('user-1');
    expect(prisma.chatColorTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } }),
    );
  });

  it('создаёт шаблон с валидными цветами', async () => {
    const created = await service().create('user-1', validDto);
    expect(created.name).toBe('Синий');
    expect(prisma.chatColorTemplate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'user-1', ...validDto }),
      }),
    );
  });

  it('отклоняет невалидный hex', async () => {
    await expect(
      service().create('user-1', { ...validDto, bubbleMine: 'cyan' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('отклоняет пустое имя', async () => {
    await expect(
      service().create('user-1', { ...validDto, name: '  ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('не даёт редактировать чужой шаблон', async () => {
    prisma.chatColorTemplate.findFirst.mockResolvedValueOnce(null as never);
    await expect(
      service().update('user-2', 'tpl-1', validDto),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('не даёт удалить чужой шаблон', async () => {
    prisma.chatColorTemplate.findFirst.mockResolvedValueOnce(null as never);
    await expect(service().remove('user-2', 'tpl-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('удаляет свой шаблон', async () => {
    await expect(service().remove('user-1', 'tpl-1')).resolves.toEqual({
      ok: true,
    });
    expect(prisma.chatColorTemplate.delete).toHaveBeenCalledWith({
      where: { id: 'tpl-1' },
    });
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

```bash
pnpm --filter @vedamatch/api test -- chat-color-templates.service
```

Expected: FAIL — `Cannot find module './chat-color-templates.service'`.

- [ ] **Step 3: Реализовать сервис**

`apps/api/src/modules/chat/chat-color-templates.service.ts`:

```typescript
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  ChatColorTemplateDto,
  ChatColorTemplatesState,
  SaveChatColorTemplateRequest,
} from '@vedamatch/shared';
import {
  CHAT_COLOR_HEX_PATTERN,
  CHAT_COLOR_TEMPLATE_MAX_NAME_LENGTH,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';

type TemplateRow = {
  id: string;
  name: string;
  bubbleMine: string;
  bubbleTheirs: string;
  accent: string;
  background: string;
  createdAt: Date;
  updatedAt: Date;
};

function toDto(row: TemplateRow): ChatColorTemplateDto {
  return {
    id: row.id,
    name: row.name,
    bubbleMine: row.bubbleMine,
    bubbleTheirs: row.bubbleTheirs,
    accent: row.accent,
    background: row.background,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * CRUD шаблонов цвета переписки. Шаблон существует независимо от бесед —
 * применение к конкретной беседе живёт в ChatConversationThemeService.
 */
@Injectable()
export class ChatColorTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<ChatColorTemplatesState> {
    const rows = await this.prisma.chatColorTemplate.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    return { templates: rows.map(toDto) };
  }

  async create(
    userId: string,
    dto: SaveChatColorTemplateRequest,
  ): Promise<ChatColorTemplateDto> {
    const clean = this.validate(dto);
    const created = await this.prisma.chatColorTemplate.create({
      data: { userId, ...clean },
    });
    return toDto(created);
  }

  async update(
    userId: string,
    id: string,
    dto: SaveChatColorTemplateRequest,
  ): Promise<ChatColorTemplateDto> {
    await this.requireOwn(userId, id);
    const clean = this.validate(dto);
    const updated = await this.prisma.chatColorTemplate.update({
      where: { id },
      data: clean,
    });
    return toDto(updated);
  }

  async remove(userId: string, id: string): Promise<{ ok: true }> {
    await this.requireOwn(userId, id);
    await this.prisma.chatColorTemplate.delete({ where: { id } });
    return { ok: true };
  }

  private async requireOwn(userId: string, id: string): Promise<void> {
    const row = await this.prisma.chatColorTemplate.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!row) throw new NotFoundException('Шаблон не найден');
  }

  private validate(
    dto: SaveChatColorTemplateRequest,
  ): SaveChatColorTemplateRequest {
    const name = dto?.name?.trim();
    if (!name) throw new BadRequestException('Не указано имя шаблона');
    if (name.length > CHAT_COLOR_TEMPLATE_MAX_NAME_LENGTH)
      throw new BadRequestException('Имя шаблона слишком длинное');

    const colors = {
      bubbleMine: dto?.bubbleMine,
      bubbleTheirs: dto?.bubbleTheirs,
      accent: dto?.accent,
      background: dto?.background,
    };
    for (const [key, value] of Object.entries(colors)) {
      if (!value || !CHAT_COLOR_HEX_PATTERN.test(value))
        throw new BadRequestException(`Некорректный цвет: ${key}`);
    }

    return { name, ...colors } as SaveChatColorTemplateRequest;
  }
}
```

- [ ] **Step 4: Запустить тест и убедиться, что он проходит**

```bash
pnpm --filter @vedamatch/api test -- chat-color-templates.service
```

Expected: PASS, 7 тестов зелёные.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/chat/chat-color-templates.service.ts apps/api/src/modules/chat/chat-color-templates.service.spec.ts
git commit -m "feat(chat): сервис CRUD шаблонов цвета"
```

---

### Task 4: Backend — `ChatConversationThemeService` (применение к беседе)

**Files:**
- Create: `apps/api/src/modules/chat/chat-conversation-theme.service.ts`
- Test: `apps/api/src/modules/chat/chat-conversation-theme.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService` (`prisma.chatConversationTheme.{findUnique,upsert}`, `prisma.chatMember.findFirst`, `prisma.chatColorTemplate.findFirst`).
- Produces: класс `ChatConversationThemeService` с методами `get(userId, conversationId): Promise<ChatConversationThemeState>`, `set(userId, conversationId, templateId: string | null): Promise<ChatConversationThemeState>` — используются в Task 5.

- [ ] **Step 1: Написать падающий тест**

`apps/api/src/modules/chat/chat-conversation-theme.service.spec.ts`:

```typescript
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ChatConversationThemeService } from './chat-conversation-theme.service';

function fn(impl?: (...args: never[]) => unknown): jest.Mock {
  return jest.fn(impl as never);
}

describe('ChatConversationThemeService', () => {
  const prisma = {
    chatConversationTheme: {
      findUnique: fn(() => Promise.resolve(null)),
      upsert: fn(() =>
        Promise.resolve({
          userId: 'user-1',
          conversationId: 'conv-1',
          templateId: 'tpl-1',
          updatedAt: new Date(),
        }),
      ),
    },
    chatMember: {
      findFirst: fn(() => Promise.resolve({ id: 'member-1' })),
    },
    chatColorTemplate: {
      findFirst: fn(() => Promise.resolve({ id: 'tpl-1' })),
    },
  };

  function service() {
    return new ChatConversationThemeService(prisma as never);
  }

  beforeEach(() => jest.clearAllMocks());

  it('без настройки отдаёт templateId: null', async () => {
    await expect(service().get('user-1', 'conv-1')).resolves.toEqual({
      templateId: null,
    });
  });

  it('отдаёт применённый шаблон', async () => {
    prisma.chatConversationTheme.findUnique.mockResolvedValueOnce({
      userId: 'user-1',
      conversationId: 'conv-1',
      templateId: 'tpl-1',
      updatedAt: new Date(),
    } as never);
    await expect(service().get('user-1', 'conv-1')).resolves.toEqual({
      templateId: 'tpl-1',
    });
  });

  it('не пускает настраивать чужую беседу', async () => {
    prisma.chatMember.findFirst.mockResolvedValueOnce(null as never);
    await expect(
      service().set('user-1', 'conv-1', 'tpl-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('не даёт применить чужой шаблон', async () => {
    prisma.chatColorTemplate.findFirst.mockResolvedValueOnce(null as never);
    await expect(
      service().set('user-1', 'conv-1', 'tpl-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('сбрасывает на дефолт через null', async () => {
    await service().set('user-1', 'conv-1', null);
    expect(prisma.chatColorTemplate.findFirst).not.toHaveBeenCalled();
    expect(prisma.chatConversationTheme.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_conversationId: { userId: 'user-1', conversationId: 'conv-1' },
        },
        create: expect.objectContaining({ templateId: null }),
        update: { templateId: null },
      }),
    );
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

```bash
pnpm --filter @vedamatch/api test -- chat-conversation-theme.service
```

Expected: FAIL — `Cannot find module './chat-conversation-theme.service'`.

- [ ] **Step 3: Реализовать сервис**

`apps/api/src/modules/chat/chat-conversation-theme.service.ts`:

```typescript
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { ChatConversationThemeState } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Какой шаблон цвета применён к беседе у конкретного пользователя.
 * Приватно: строка привязана к userId, соседи по беседе её не видят.
 */
@Injectable()
export class ChatConversationThemeService {
  constructor(private readonly prisma: PrismaService) {}

  async get(
    userId: string,
    conversationId: string,
  ): Promise<ChatConversationThemeState> {
    const row = await this.prisma.chatConversationTheme.findUnique({
      where: { userId_conversationId: { userId, conversationId } },
      select: { templateId: true },
    });
    return { templateId: row?.templateId ?? null };
  }

  async set(
    userId: string,
    conversationId: string,
    templateId: string | null,
  ): Promise<ChatConversationThemeState> {
    await this.assertMember(userId, conversationId);
    if (templateId) await this.assertOwnTemplate(userId, templateId);

    await this.prisma.chatConversationTheme.upsert({
      where: { userId_conversationId: { userId, conversationId } },
      create: { userId, conversationId, templateId },
      update: { templateId },
    });
    return { templateId };
  }

  private async assertMember(
    userId: string,
    conversationId: string,
  ): Promise<void> {
    const member = await this.prisma.chatMember.findFirst({
      where: { conversationId, userId },
      select: { id: true },
    });
    if (!member) throw new NotFoundException('Беседа не найдена');
  }

  private async assertOwnTemplate(
    userId: string,
    templateId: string,
  ): Promise<void> {
    const template = await this.prisma.chatColorTemplate.findFirst({
      where: { id: templateId, userId },
      select: { id: true },
    });
    if (!template) throw new BadRequestException('Шаблон не найден');
  }
}
```

- [ ] **Step 4: Запустить тест и убедиться, что он проходит**

```bash
pnpm --filter @vedamatch/api test -- chat-conversation-theme.service
```

Expected: PASS, 5 тестов зелёные.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/chat/chat-conversation-theme.service.ts apps/api/src/modules/chat/chat-conversation-theme.service.spec.ts
git commit -m "feat(chat): сервис применения шаблона к беседе"
```

---

### Task 5: Backend — эндпоинты и регистрация в модуле

**Files:**
- Modify: `apps/api/src/modules/chat/chat.controller.ts`
- Modify: `apps/api/src/modules/chat/chat.module.ts`

**Interfaces:**
- Consumes: `ChatColorTemplatesService`, `ChatConversationThemeService` из Task 3-4.
- Produces: маршруты `GET/POST /chat/color-templates`, `PATCH/DELETE /chat/color-templates/:id`, `GET/PUT /chat/conversations/:id/theme`.

- [ ] **Step 1: Зарегистрировать сервисы в модуле**

В `apps/api/src/modules/chat/chat.module.ts` добавить импорты и провайдеры:

```typescript
import { ChatColorTemplatesService } from './chat-color-templates.service';
import { ChatConversationThemeService } from './chat-conversation-theme.service';
```

и в массив `providers`:

```typescript
  providers: [
    ChatConversationsService,
    ChatMessagesService,
    ChatReportsService,
    ChatEventsService,
    ChatUploadsService,
    ChatSignedUrlsInterceptor,
    ChatPurgeListener,
    ChatColorTemplatesService,
    ChatConversationThemeService,
    PeopleService,
    PeopleRequestsService,
    PeopleAdminService,
    PeopleAvatarService,
  ],
```

- [ ] **Step 2: Добавить эндпоинты в `chat.controller.ts`**

Добавить импорты рядом с существующими:

```typescript
import type {
  AccessTokenPayload,
  CreateChatConversationRequest,
  CreateChatReportRequest,
  EditChatMessageRequest,
  SaveChatColorTemplateRequest,
  SendChatMessageRequest,
  SetChatConversationThemeRequest,
  SetChatReactionRequest,
} from '@vedamatch/shared';
import { ChatColorTemplatesService } from './chat-color-templates.service';
import { ChatConversationThemeService } from './chat-conversation-theme.service';
```

В конструктор добавить:

```typescript
  constructor(
    private readonly conversations: ChatConversationsService,
    private readonly messages: ChatMessagesService,
    private readonly reports: ChatReportsService,
    private readonly uploads: ChatUploadsService,
    private readonly directory: PeopleService,
    private readonly colorTemplates: ChatColorTemplatesService,
    private readonly conversationTheme: ChatConversationThemeService,
  ) {}
```

Перед закрывающей скобкой класса (после метода `report`) добавить:

```typescript
  @Get('color-templates')
  listColorTemplates(@CurrentUser() user: AccessTokenPayload) {
    return this.colorTemplates.list(user.sub);
  }

  @Post('color-templates')
  createColorTemplate(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: SaveChatColorTemplateRequest,
  ) {
    return this.colorTemplates.create(user.sub, body);
  }

  @Post('color-templates/:id')
  updateColorTemplate(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: SaveChatColorTemplateRequest,
  ) {
    return this.colorTemplates.update(user.sub, id, body);
  }

  @Delete('color-templates/:id')
  removeColorTemplate(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    return this.colorTemplates.remove(user.sub, id);
  }

  @Get('conversations/:id/theme')
  getConversationTheme(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    return this.conversationTheme.get(user.sub, id);
  }

  @Post('conversations/:id/theme')
  setConversationTheme(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: SetChatConversationThemeRequest,
  ) {
    return this.conversationTheme.set(user.sub, id, body?.templateId ?? null);
  }
```

(Используется `@Post`, а не `@Patch`/`@Put`, — контроллер нигде в модуле их не импортирует и не использует; это следование заведённому в файле стилю, а не догме REST.)

- [ ] **Step 3: Собрать бэкенд**

```bash
pnpm --filter @vedamatch/api build
```

Expected: без ошибок типов (в частности, все шесть новых методов резолвят импортированные типы из `@vedamatch/shared`).

- [ ] **Step 4: Прогнать весь набор тестов модуля chat**

```bash
pnpm --filter @vedamatch/api test -- modules/chat
```

Expected: PASS, включая тесты Task 3 и Task 4.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/chat/chat.controller.ts apps/api/src/modules/chat/chat.module.ts
git commit -m "feat(chat): эндпоинты шаблонов цвета и темы беседы"
```

---

### Task 6: Frontend — автоконтраст текста в пузыре

**Files:**
- Create: `apps/web/src/components/chat/chat-contrast-ink.ts`
- Test: `apps/web/src/components/chat/chat-contrast-ink.spec.ts`

**Interfaces:**
- Produces: `pickBubbleInk(hex: string): string` — возвращает `"#0A0614"` (тёмный) или `"#F6F1FF"` (светлый); используется в Task 11.

- [ ] **Step 1: Написать падающий тест**

`apps/web/src/components/chat/chat-contrast-ink.spec.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { pickBubbleInk } from "./chat-contrast-ink";

describe("pickBubbleInk", () => {
  it("на белом фоне выбирает тёмный текст", () => {
    expect(pickBubbleInk("#FFFFFF")).toBe("#0A0614");
  });

  it("на чёрном фоне выбирает светлый текст", () => {
    expect(pickBubbleInk("#000000")).toBe("#F6F1FF");
  });

  it("на среднем сером фоне выбирает светлый текст", () => {
    // Относительная яркость #808080 по WCAG ≈ 0.216 — ниже порога 0.4.
    expect(pickBubbleInk("#808080")).toBe("#F6F1FF");
  });

  it("на насыщенном цвете темы (циан) выбирает тёмный текст", () => {
    expect(pickBubbleInk("#23F0C7")).toBe("#0A0614");
  });

  it("некорректный hex не роняет расчёт", () => {
    expect(pickBubbleInk("не-цвет")).toBe("#0A0614");
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

```bash
pnpm --filter @vedamatch/web exec vitest run src/components/chat/chat-contrast-ink.spec.ts
```

Expected: FAIL — `Cannot find module './chat-contrast-ink'`.

- [ ] **Step 3: Реализовать функцию**

`apps/web/src/components/chat/chat-contrast-ink.ts`:

```typescript
/**
 * Автоконтраст текста внутри цветного пузыря. Свободный hex в конструкторе
 * может дать тёмный текст на тёмном фоне — здесь яркость фона считается и
 * текст переключается сам, без участия пользователя. Ink-цвета те же, что
 * использует подложка аватара в chat-author-color.ts — единый стиль.
 */
const DARK_INK = "#0A0614";
const LIGHT_INK = "#F6F1FF";
/** Ниже — фон считается тёмным, текст берётся светлый. */
const LUMINANCE_THRESHOLD = 0.4;

function srgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Относительная яркость по WCAG. Некорректный hex — считается тёмным фоном. */
function relativeLuminance(hex: string): number {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!match) return 0;
  const value = match[1];
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return (
    0.2126 * srgbToLinear(r) +
    0.7152 * srgbToLinear(g) +
    0.0722 * srgbToLinear(b)
  );
}

export function pickBubbleInk(hex: string): string {
  return relativeLuminance(hex) > LUMINANCE_THRESHOLD ? DARK_INK : LIGHT_INK;
}
```

- [ ] **Step 4: Запустить тест и убедиться, что он проходит**

```bash
pnpm --filter @vedamatch/web exec vitest run src/components/chat/chat-contrast-ink.spec.ts
```

Expected: PASS, 5 тестов зелёные.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/chat/chat-contrast-ink.ts apps/web/src/components/chat/chat-contrast-ink.spec.ts
git commit -m "feat(chat): автоконтраст текста в цветном пузыре"
```

---

### Task 7: Frontend — клиент API конструктора

**Files:**
- Create: `apps/web/src/lib/chat-appearance-api.ts`
- Test: `apps/web/src/lib/chat-appearance-api.spec.ts`
- Modify: `apps/web/src/lib/chat-api.ts` (серверный хелпер для страницы шаблонов)

**Interfaces:**
- Consumes: `apiRequest<T>` из `@/lib/http-client`, типы из Task 2.
- Produces: `listColorTemplates()`, `createColorTemplate(body)`, `updateColorTemplate(id, body)`, `deleteColorTemplate(id)`, `getConversationTheme(conversationId)`, `setConversationTheme(conversationId, templateId)` — используются в Task 9-11. Плюс серверный `getChatColorTemplates()` в `chat-api.ts` — используется в Task 9.

- [ ] **Step 1: Написать падающий тест**

`apps/web/src/lib/chat-appearance-api.spec.ts`:

```typescript
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatColorTemplateDto } from "@vedamatch/shared";
import {
  createColorTemplate,
  deleteColorTemplate,
  getConversationTheme,
  listColorTemplates,
  setConversationTheme,
  updateColorTemplate,
} from "./chat-appearance-api";

afterEach(() => vi.unstubAllGlobals());

const template: ChatColorTemplateDto = {
  id: "tpl-1",
  name: "Синий",
  bubbleMine: "#23F0C7",
  bubbleTheirs: "#1A1A2E",
  accent: "#5CCCCC",
  background: "#0A0614",
  createdAt: "2026-08-23T10:00:00.000Z",
  updatedAt: "2026-08-23T10:00:00.000Z",
};

describe("chat-appearance-api", () => {
  it("запрашивает список шаблонов", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ templates: [template] }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await listColorTemplates();

    expect(result.templates).toEqual([template]);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "http://localhost:4000/chat/color-templates",
    );
  });

  it("создаёт шаблон POST-ом с телом", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(template), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const body = {
      name: "Синий",
      bubbleMine: "#23F0C7",
      bubbleTheirs: "#1A1A2E",
      accent: "#5CCCCC",
      background: "#0A0614",
    };
    await createColorTemplate(body);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/chat/color-templates",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(body),
      }),
    );
  });

  it("редактирует шаблон по id", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(template), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await updateColorTemplate("tpl-1", {
      name: "Синий",
      bubbleMine: "#23F0C7",
      bubbleTheirs: "#1A1A2E",
      accent: "#5CCCCC",
      background: "#0A0614",
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "http://localhost:4000/chat/color-templates/tpl-1",
    );
  });

  it("удаляет шаблон", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await deleteColorTemplate("tpl-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/chat/color-templates/tpl-1",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("читает применённую тему беседы", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ templateId: "tpl-1" }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getConversationTheme("conv-1")).resolves.toEqual({
      templateId: "tpl-1",
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "http://localhost:4000/chat/conversations/conv-1/theme",
    );
  });

  it("применяет шаблон к беседе", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ templateId: "tpl-1" }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await setConversationTheme("conv-1", "tpl-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/chat/conversations/conv-1/theme",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ templateId: "tpl-1" }),
      }),
    );
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

```bash
pnpm --filter @vedamatch/web exec vitest run src/lib/chat-appearance-api.spec.ts
```

Expected: FAIL — `Cannot find module './chat-appearance-api'`.

- [ ] **Step 3: Реализовать клиент**

`apps/web/src/lib/chat-appearance-api.ts`:

```typescript
"use client";

import type {
  ChatColorTemplateDto,
  ChatColorTemplatesState,
  ChatConversationThemeState,
  SaveChatColorTemplateRequest,
} from "@vedamatch/shared";
import { apiRequest } from "@/lib/http-client";

/** Браузерный клиент конструктора цвета чата. См. lib/chat-appearance-api. */

export function listColorTemplates(): Promise<ChatColorTemplatesState> {
  return apiRequest<ChatColorTemplatesState>("/chat/color-templates");
}

export function createColorTemplate(
  body: SaveChatColorTemplateRequest,
): Promise<ChatColorTemplateDto> {
  return apiRequest<ChatColorTemplateDto>("/chat/color-templates", {
    method: "POST",
    json: body,
  });
}

export function updateColorTemplate(
  id: string,
  body: SaveChatColorTemplateRequest,
): Promise<ChatColorTemplateDto> {
  return apiRequest<ChatColorTemplateDto>(
    `/chat/color-templates/${encodeURIComponent(id)}`,
    { method: "POST", json: body },
  );
}

export function deleteColorTemplate(id: string): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>(
    `/chat/color-templates/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}

export function getConversationTheme(
  conversationId: string,
): Promise<ChatConversationThemeState> {
  return apiRequest<ChatConversationThemeState>(
    `/chat/conversations/${encodeURIComponent(conversationId)}/theme`,
  );
}

export function setConversationTheme(
  conversationId: string,
  templateId: string | null,
): Promise<ChatConversationThemeState> {
  return apiRequest<ChatConversationThemeState>(
    `/chat/conversations/${encodeURIComponent(conversationId)}/theme`,
    { method: "POST", json: { templateId } },
  );
}
```

- [ ] **Step 4: Запустить тест и убедиться, что он проходит**

```bash
pnpm --filter @vedamatch/web exec vitest run src/lib/chat-appearance-api.spec.ts
```

Expected: PASS, 6 тестов зелёные.

- [ ] **Step 5: Добавить серверный хелпер для страницы шаблонов**

В `apps/web/src/lib/chat-api.ts` добавить импорт типа в существующий блок `import type {...} from "@vedamatch/shared"`:

```typescript
  ChatColorTemplatesState,
```

и в конец файла:

```typescript
/** Шаблоны цвета — для серверного рендера страницы /chat/appearance. */
export function getChatColorTemplates(): Promise<ChatColorTemplatesState | null> {
  return chatGet<ChatColorTemplatesState>("/chat/color-templates");
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/chat-appearance-api.ts apps/web/src/lib/chat-appearance-api.spec.ts apps/web/src/lib/chat-api.ts
git commit -m "feat(chat): клиент API конструктора цвета"
```

---

### Task 8: Frontend — страница «Мои шаблоны оформления»

**Files:**
- Create: `apps/web/src/app/(portal)/chat/appearance/page.tsx`
- Create: `apps/web/src/components/chat/chat-appearance-view.tsx`
- Test: `apps/web/src/components/chat/chat-appearance-view.spec.tsx`

**Interfaces:**
- Consumes: `getChatColorTemplates` (серверный, Task 7), `listColorTemplates/createColorTemplate/updateColorTemplate/deleteColorTemplate` (клиентские, Task 7), `requireUser` (существующий `@/lib/require-user`).
- Produces: маршрут `/chat/appearance`, компонент `ChatAppearanceView` — переиспользуется как есть, дальше не потребляется другими задачами (конечный UI).

- [ ] **Step 1: Написать падающий тест на форму**

`apps/web/src/components/chat/chat-appearance-view.spec.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ChatColorTemplateDto } from "@vedamatch/shared";
import { ChatAppearanceView } from "./chat-appearance-view";

vi.mock("@/lib/chat-appearance-api", () => ({
  createColorTemplate: vi.fn(),
  updateColorTemplate: vi.fn(),
  deleteColorTemplate: vi.fn(),
}));

import {
  createColorTemplate,
  deleteColorTemplate,
} from "@/lib/chat-appearance-api";

const template: ChatColorTemplateDto = {
  id: "tpl-1",
  name: "Синий",
  bubbleMine: "#23F0C7",
  bubbleTheirs: "#1A1A2E",
  accent: "#5CCCCC",
  background: "#0A0614",
  createdAt: "2026-08-23T10:00:00.000Z",
  updatedAt: "2026-08-23T10:00:00.000Z",
};

describe("ChatAppearanceView", () => {
  it("показывает пустое состояние без шаблонов", () => {
    render(<ChatAppearanceView initialTemplates={[]} />);
    expect(screen.getByText(/пока нет шаблонов/i)).toBeInTheDocument();
  });

  it("показывает карточку существующего шаблона", () => {
    render(<ChatAppearanceView initialTemplates={[template]} />);
    expect(screen.getByText("Синий")).toBeInTheDocument();
  });

  it("создаёт шаблон по кнопке «Создать»", async () => {
    vi.mocked(createColorTemplate).mockResolvedValue({
      ...template,
      id: "tpl-2",
      name: "Новый шаблон",
    });
    const user = userEvent.setup();
    render(<ChatAppearanceView initialTemplates={[]} />);

    await user.click(screen.getByRole("button", { name: "Создать" }));
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() => expect(createColorTemplate).toHaveBeenCalled());
    expect(screen.getByText("Новый шаблон")).toBeInTheDocument();
  });

  it("удаляет шаблон по кнопке «Удалить»", async () => {
    vi.mocked(deleteColorTemplate).mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<ChatAppearanceView initialTemplates={[template]} />);

    await user.click(screen.getByRole("button", { name: "Удалить" }));

    await waitFor(() => expect(deleteColorTemplate).toHaveBeenCalledWith("tpl-1"));
    expect(screen.queryByText("Синий")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

```bash
pnpm --filter @vedamatch/web exec vitest run src/components/chat/chat-appearance-view.spec.tsx
```

Expected: FAIL — `Cannot find module './chat-appearance-view'`.

- [ ] **Step 3: Реализовать компонент**

`apps/web/src/components/chat/chat-appearance-view.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { ChatColorTemplateDto, SaveChatColorTemplateRequest } from "@vedamatch/shared";
import {
  createColorTemplate,
  deleteColorTemplate,
  updateColorTemplate,
} from "@/lib/chat-appearance-api";

const DEFAULT_DRAFT: SaveChatColorTemplateRequest = {
  name: "",
  bubbleMine: "#23F0C7",
  bubbleTheirs: "#1A1A2E",
  accent: "#5CCCCC",
  background: "#0A0614",
};

/**
 * «Мои шаблоны оформления»: список именованных шаблонов цвета переписки,
 * создание/редактирование/удаление. Применение к конкретной беседе живёт
 * в меню беседы (chat-room-menu.tsx), не здесь.
 */
export function ChatAppearanceView({
  initialTemplates,
}: {
  initialTemplates: ChatColorTemplateDto[];
}) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<SaveChatColorTemplateRequest>(DEFAULT_DRAFT);
  const [busy, setBusy] = useState(false);

  function startCreate() {
    setDraft(DEFAULT_DRAFT);
    setCreating(true);
    setEditingId(null);
  }

  function startEdit(template: ChatColorTemplateDto) {
    setDraft({
      name: template.name,
      bubbleMine: template.bubbleMine,
      bubbleTheirs: template.bubbleTheirs,
      accent: template.accent,
      background: template.background,
    });
    setEditingId(template.id);
    setCreating(false);
  }

  async function save() {
    setBusy(true);
    try {
      if (editingId) {
        const updated = await updateColorTemplate(editingId, draft);
        setTemplates((current) =>
          current.map((t) => (t.id === editingId ? updated : t)),
        );
      } else {
        const created = await createColorTemplate(draft);
        setTemplates((current) => [...current, created]);
      }
      setCreating(false);
      setEditingId(null);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await deleteColorTemplate(id);
      setTemplates((current) => current.filter((t) => t.id !== id));
    } finally {
      setBusy(false);
    }
  }

  const formOpen = creating || editingId !== null;

  return (
    <div className="flex flex-col gap-4">
      {templates.length === 0 && !formOpen && (
        <p className="text-sm text-text-2">
          Пока нет шаблонов оформления — создайте первый.
        </p>
      )}

      {!formOpen && (
        <button
          type="button"
          onClick={startCreate}
          className="self-start rounded-xl border border-cyan/34 px-4 py-2 text-sm font-semibold text-cyan"
        >
          Создать
        </button>
      )}

      {formOpen && (
        <div className="flex flex-col gap-3 rounded-2xl border border-glass-brd bg-glass p-4">
          <label className="flex flex-col gap-1 text-sm text-text-1">
            Название
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className="rounded-lg border border-glass-brd bg-bg-1 px-3 py-2 text-text-0"
            />
          </label>

          <ColorField
            label="Пузырь своих сообщений"
            value={draft.bubbleMine}
            onChange={(v) => setDraft({ ...draft, bubbleMine: v })}
          />
          <ColorField
            label="Пузырь чужих сообщений"
            value={draft.bubbleTheirs}
            onChange={(v) => setDraft({ ...draft, bubbleTheirs: v })}
          />
          <ColorField
            label="Акцентный цвет"
            value={draft.accent}
            onChange={(v) => setDraft({ ...draft, accent: v })}
          />
          <ColorField
            label="Фон переписки"
            value={draft.background}
            onChange={(v) => setDraft({ ...draft, background: v })}
          />

          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || !draft.name.trim()}
              onClick={() => void save()}
              className="rounded-xl bg-cyan px-4 py-2 text-sm font-semibold text-on-cyan disabled:opacity-60"
            >
              Сохранить
            </button>
            <button
              type="button"
              onClick={() => {
                setCreating(false);
                setEditingId(null);
              }}
              className="rounded-xl px-4 py-2 text-sm text-text-1"
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {templates.map((template) => (
          <li
            key={template.id}
            className="flex items-center gap-3 rounded-2xl border border-glass-brd bg-glass p-3"
          >
            <span className="flex gap-1">
              <Swatch color={template.bubbleMine} />
              <Swatch color={template.bubbleTheirs} />
              <Swatch color={template.accent} />
              <Swatch color={template.background} />
            </span>
            <span className="flex-1 text-sm font-semibold text-text-0">
              {template.name}
            </span>
            <button
              type="button"
              onClick={() => startEdit(template)}
              className="rounded-lg px-2 py-1 text-xs text-text-1 hover:text-text-0"
            >
              Изменить
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void remove(template.id)}
              className="rounded-lg px-2 py-1 text-xs text-magenta"
            >
              Удалить
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-3 text-sm text-text-1">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="size-9 shrink-0 rounded-lg border border-glass-brd bg-transparent"
      />
      <span className="flex-1">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-24 rounded-lg border border-glass-brd bg-bg-1 px-2 py-1 font-mono text-xs text-text-0"
      />
    </label>
  );
}

function Swatch({ color }: { color: string }) {
  return (
    <span
      className="size-6 rounded-full border border-glass-brd"
      style={{ backgroundColor: color }}
      aria-hidden
    />
  );
}
```

- [ ] **Step 4: Запустить тест и убедиться, что он проходит**

```bash
pnpm --filter @vedamatch/web exec vitest run src/components/chat/chat-appearance-view.spec.tsx
```

Expected: PASS, 4 теста зелёные.

- [ ] **Step 5: Создать страницу маршрута**

`apps/web/src/app/(portal)/chat/appearance/page.tsx`:

```tsx
import Link from "next/link";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";
import { ChatAppearanceView } from "@/components/chat/chat-appearance-view";
import { getChatColorTemplates } from "@/lib/chat-api";
import { requireUser } from "@/lib/require-user";

export default async function ChatAppearancePage() {
  await requireUser();
  const state = await getChatColorTemplates();

  return (
    <>
      <BackgroundOrbs />
      <NoiseOverlay />
      <main className="mx-auto max-w-2xl px-4 py-8 pb-28">
        <header className="mb-5 flex items-center gap-2">
          <Link
            href="/chat"
            aria-label="К списку бесед"
            className="flex size-11 items-center justify-center rounded-2xl text-text-1 hover:text-text-0"
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </Link>
          <h1 className="font-display text-xl font-semibold text-text-0">
            Мои шаблоны оформления
          </h1>
        </header>
        <ChatAppearanceView initialTemplates={state?.templates ?? []} />
      </main>
    </>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/\(portal\)/chat/appearance apps/web/src/components/chat/chat-appearance-view.tsx apps/web/src/components/chat/chat-appearance-view.spec.tsx
git commit -m "feat(chat): страница «Мои шаблоны оформления»"
```

---

### Task 9: Frontend — пункт «Оформление» в меню беседы

**Files:**
- Modify: `apps/web/src/components/chat/chat-room-menu.tsx`
- Test: `apps/web/src/components/chat/chat-room-menu.spec.tsx` (новый файл)

**Interfaces:**
- Consumes: `listColorTemplates`, `setConversationTheme` (Task 7).
- Produces: пункт меню «Оформление», вызывающий `onThemeChange(templateId: string | null)` — проп добавляется в `ChatRoomMenu`, используется в Task 10 (`chat-room.tsx` передаёт колбэк и хранит текущий `templateId` в состоянии).

- [ ] **Step 1: Написать падающий тест**

`apps/web/src/components/chat/chat-room-menu.spec.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ChatConversationDetail } from "@vedamatch/shared";
import { ChatRoomMenu } from "./chat-room-menu";

vi.mock("@/lib/chat-client", () => ({
  deleteChatConversation: vi.fn(),
  leaveChatConversation: vi.fn(),
  reportChat: vi.fn(),
  setChatMuted: vi.fn(),
  setChatPinned: vi.fn(),
  subscribeToChannel: vi.fn(),
}));

vi.mock("@/lib/chat-appearance-api", () => ({
  listColorTemplates: vi.fn().mockResolvedValue({
    templates: [
      {
        id: "tpl-1",
        name: "Синий",
        bubbleMine: "#23F0C7",
        bubbleTheirs: "#1A1A2E",
        accent: "#5CCCCC",
        background: "#0A0614",
        createdAt: "2026-08-23T10:00:00.000Z",
        updatedAt: "2026-08-23T10:00:00.000Z",
      },
    ],
  }),
  setConversationTheme: vi.fn().mockResolvedValue({ templateId: "tpl-1" }),
}));

import { setConversationTheme } from "@/lib/chat-appearance-api";

const conversation = {
  id: "conv-1",
  kind: "direct",
  myRole: "member",
  membersCount: 2,
  muted: false,
  pinned: false,
} as unknown as ChatConversationDetail;

describe("ChatRoomMenu — оформление", () => {
  it("показывает шаблоны и применяет выбранный", async () => {
    const onThemeChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ChatRoomMenu
        conversation={conversation}
        onChange={() => undefined}
        onThemeChange={onThemeChange}
      />,
    );

    await user.click(screen.getByLabelText("Меню беседы"));
    await user.click(screen.getByText("Оформление"));
    await user.click(await screen.findByText("Синий"));

    await waitFor(() =>
      expect(setConversationTheme).toHaveBeenCalledWith("conv-1", "tpl-1"),
    );
    expect(onThemeChange).toHaveBeenCalledWith("tpl-1");
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

```bash
pnpm --filter @vedamatch/web exec vitest run src/components/chat/chat-room-menu.spec.tsx
```

Expected: FAIL — пункта «Оформление» и пропа `onThemeChange` ещё нет.

- [ ] **Step 3: Добавить пункт меню и попап шаблонов**

В `apps/web/src/components/chat/chat-room-menu.tsx` добавить импорты:

```typescript
import { useState } from "react";
```
заменить на:
```typescript
import { useEffect, useState } from "react";
```

добавить рядом с остальными импортами:

```typescript
import Link from "next/link";
import type { ChatColorTemplateDto } from "@vedamatch/shared";
import { listColorTemplates, setConversationTheme } from "@/lib/chat-appearance-api";
```

(`Link` уже импортирован в файле — не дублировать импорт, только добавить `ChatColorTemplateDto` и функции.)

Расширить сигнатуру пропов:

```typescript
export function ChatRoomMenu({
  conversation,
  onChange,
  onThemeChange,
}: {
  conversation: ChatConversationDetail;
  onChange: (patch: Partial<ChatConversationDetail>) => void;
  onThemeChange: (templateId: string | null) => void;
}) {
```

Внутри компонента, рядом с существующими `useState`, добавить:

```typescript
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [templates, setTemplates] = useState<ChatColorTemplateDto[] | null>(null);

  useEffect(() => {
    if (!appearanceOpen || templates) return;
    void listColorTemplates().then((state) => setTemplates(state.templates));
  }, [appearanceOpen, templates]);

  async function applyTheme(templateId: string | null) {
    await setConversationTheme(conversation.id, templateId);
    onThemeChange(templateId);
    setAppearanceOpen(false);
    setOpen(false);
  }
```

Добавить пункт «Оформление» в список меню (перед пунктом «Пожаловаться»):

```tsx
          <MenuItem
            busy={busy}
            label="Оформление"
            onClick={() => setAppearanceOpen(true)}
          />
```

После закрывающего `</div>` блока `{open && (...)}` (перед `</div>` компонента) добавить попап:

```tsx
      {appearanceOpen && (
        <div className="absolute right-0 top-12 z-10 flex w-64 flex-col gap-1 rounded-2xl border border-glass-brd bg-bg-1 p-1.5 shadow-xl shadow-black/40">
          <button
            type="button"
            onClick={() => void applyTheme(null)}
            className="flex min-h-11 items-center rounded-xl px-3 text-left text-sm text-text-1 transition-colors hover:bg-white/6 hover:text-text-0"
          >
            Без шаблона (по умолчанию)
          </button>
          {templates?.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => void applyTheme(template.id)}
              className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-left text-sm text-text-1 transition-colors hover:bg-white/6 hover:text-text-0"
            >
              <span
                className="size-4 shrink-0 rounded-full border border-glass-brd"
                style={{ backgroundColor: template.bubbleMine }}
                aria-hidden
              />
              {template.name}
            </button>
          ))}
          <Link
            href="/chat/appearance"
            className="flex min-h-11 items-center rounded-xl px-3 text-sm text-cyan transition-colors hover:bg-white/6"
          >
            Создать новый шаблон
          </Link>
        </div>
      )}
```

- [ ] **Step 4: Запустить тест и убедиться, что он проходит**

```bash
pnpm --filter @vedamatch/web exec vitest run src/components/chat/chat-room-menu.spec.tsx
```

Expected: PASS.

- [ ] **Step 5: Прогнать полный набор тестов веба, чтобы не сломать существующее использование `ChatRoomMenu`**

```bash
pnpm --filter @vedamatch/web test
```

Expected: PASS. (Task 10 обновит единственного потребителя — `chat-room.tsx` — новым обязательным пропом `onThemeChange`; до Task 10 сборка типов может ругаться на отсутствующий проп в вызове из `chat-room.tsx` — это ожидаемо и чинится следующей задачей.)

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/chat/chat-room-menu.tsx apps/web/src/components/chat/chat-room-menu.spec.tsx
git commit -m "feat(chat): пункт «Оформление» в меню беседы"
```

---

### Task 10: Frontend — рендеринг шаблона в беседе (CSS-переменные)

**Files:**
- Modify: `apps/web/src/app/(portal)/chat/[id]/page.tsx`
- Modify: `apps/web/src/components/chat/chat-room.tsx`

**Interfaces:**
- Consumes: `getChatColorTemplates` (Task 7, для резолва шаблона по id на сервере — переиспользуем список и находим нужный), `getConversationTheme`/`setConversationTheme` не нужны здесь напрямую: серверная страница получает `templateId` через новый серверный хелпер, `ChatRoomMenu.onThemeChange` (Task 9) обновляет состояние на клиенте.
- Produces: `ChatRoom` принимает проп `initialTheme: ChatColorTemplateDto | null`, вычисляет CSS-переменные и передаёт их потребителям в Task 11 через `style` на корневом элементе с `data-chat-theme` атрибутом (используется как якорь для `chat-message.tsx`, который читает переменные через `var(...)`, а не проп — компонент `ChatMessage` не меняет сигнатуру).

- [ ] **Step 1: Добавить серверный хелпер получения темы + резолва шаблона**

В `apps/web/src/lib/chat-api.ts`, рядом с `getChatColorTemplates`, добавить:

```typescript
import type { ChatConversationThemeState } from "@vedamatch/shared";
```
(добавить в существующий блок `import type {...}`, не создавать новый).

```typescript
export function getChatConversationTheme(
  conversationId: string,
): Promise<ChatConversationThemeState | null> {
  return chatGet<ChatConversationThemeState>(
    `/chat/conversations/${encodeURIComponent(conversationId)}/theme`,
  );
}
```

- [ ] **Step 2: Получить и резолвить шаблон на странице беседы**

В `apps/web/src/app/(portal)/chat/[id]/page.tsx` заменить содержимое на:

```tsx
import { notFound } from "next/navigation";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";
import { ChatRoom } from "@/components/chat/chat-room";
import {
  getChatColorTemplates,
  getChatConversation,
  getChatConversationTheme,
} from "@/lib/chat-api";
import { requireUser } from "@/lib/require-user";

export default async function ChatConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [user, conversation, theme, templatesState] = await Promise.all([
    requireUser(),
    getChatConversation(id),
    getChatConversationTheme(id),
    getChatColorTemplates(),
  ]);
  if (!conversation) notFound();

  const initialTheme =
    theme?.templateId
      ? (templatesState?.templates.find((t) => t.id === theme.templateId) ??
        null)
      : null;

  return (
    <>
      <BackgroundOrbs />
      <NoiseOverlay />
      <main className="mx-auto max-w-3xl px-4 py-4">
        <ChatRoom
          initial={conversation}
          viewerId={user.id}
          initialTheme={initialTheme}
        />
      </main>
    </>
  );
}
```

- [ ] **Step 3: Принять тему в `ChatRoom` и вычислить CSS-переменные**

В `apps/web/src/components/chat/chat-room.tsx` добавить импорты:

```typescript
import type { CSSProperties } from "react";
import type { ChatColorTemplateDto } from "@vedamatch/shared";
import { pickBubbleInk } from "./chat-contrast-ink";
```

Расширить сигнатуру пропов:

```typescript
export function ChatRoom({
  initial,
  viewerId,
  initialTheme,
}: {
  initial: ChatConversationDetail;
  viewerId: string;
  initialTheme: ChatColorTemplateDto | null;
}) {
```

Добавить состояние темы рядом с существующими `useState`:

```typescript
  const [theme, setTheme] = useState(initialTheme);
```

Вычислить CSS-переменные перед `return`:

```typescript
  const themeStyle = theme
    ? ({
        "--chat-bubble-mine": theme.bubbleMine,
        "--chat-bubble-mine-ink": pickBubbleInk(theme.bubbleMine),
        "--chat-bubble-theirs": theme.bubbleTheirs,
        "--chat-bubble-theirs-ink": pickBubbleInk(theme.bubbleTheirs),
        "--chat-accent": theme.accent,
        "--chat-bg": theme.background,
      } as CSSProperties)
    : undefined;
```

Передать колбэк в `ChatRoomMenu` и стиль — на корневой `<div>`:

```tsx
    <div
      className="flex h-[calc(100dvh-9rem)] flex-col"
      style={{ ...themeStyle, background: "var(--chat-bg, transparent)" }}
    >
```

и заменить вызов `ChatRoomMenu`:

```tsx
        <ChatRoomMenu
          conversation={conversation}
          onChange={(patch) =>
            setConversation((current) => ({ ...current, ...patch }))
          }
          onThemeChange={(templateId) => {
            setTheme(
              templateId
                ? (templates?.find((t) => t.id === templateId) ?? theme)
                : null,
            );
          }}
        />
```

Так как список шаблонов на клиенте у `ChatRoom` не хранится (он есть только в открытом попапе `ChatRoomMenu`), заменить последний блок на упрощённый вариант — `onThemeChange` получает от `ChatRoomMenu` не только id, но и сам объект шаблона (это меняет и Task 9): в `apps/web/src/components/chat/chat-room-menu.tsx` изменить сигнатуру пропа и вызовы `applyTheme`:

```typescript
  onThemeChange: (template: ChatColorTemplateDto | null) => void;
```

```typescript
  async function applyTheme(template: ChatColorTemplateDto | null) {
    await setConversationTheme(conversation.id, template?.id ?? null);
    onThemeChange(template);
    setAppearanceOpen(false);
    setOpen(false);
  }
```

и вызовы `applyTheme(null)` / `applyTheme(template.id)` → `applyTheme(null)` / `applyTheme(template)`.

Обновить тест Task 9 (`chat-room-menu.spec.tsx`): `expect(onThemeChange).toHaveBeenCalledWith("tpl-1")` →
```typescript
    expect(onThemeChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: "tpl-1" }),
    );
```

Тогда в `chat-room.tsx` колбэк упрощается до:

```tsx
          onThemeChange={setTheme}
```

- [ ] **Step 4: Прогнать тесты веба**

```bash
pnpm --filter @vedamatch/web test
```

Expected: PASS, включая обновлённый `chat-room-menu.spec.tsx`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/\(portal\)/chat/\[id\]/page.tsx apps/web/src/components/chat/chat-room.tsx apps/web/src/components/chat/chat-room-menu.tsx apps/web/src/components/chat/chat-room-menu.spec.tsx apps/web/src/lib/chat-api.ts
git commit -m "feat(chat): применение шаблона к беседе через CSS-переменные"
```

---

### Task 11: Frontend — потребление CSS-переменных в сообщениях

**Files:**
- Modify: `apps/web/src/components/chat/chat-message.tsx`

**Interfaces:**
- Consumes: CSS-переменные `--chat-bubble-mine`, `--chat-bubble-mine-ink`, `--chat-bubble-theirs`, `--chat-bubble-theirs-ink`, `--chat-accent` (Task 10, наследуются от родителя через каскад — проп не нужен).
- Produces: визуальное потребление шаблона; следующих задач нет — это последний шаг фичи.

- [ ] **Step 1: Заменить фон пузыря на CSS-переменную с фолбэком**

В `apps/web/src/components/chat/chat-message.tsx` добавить `CSSProperties` в существующий импорт из `"react"`:

```typescript
import { useState, type CSSProperties, type ReactNode } from "react";
```

Заменить:

```typescript
  const bubble = mine
    ? "rounded-[20px] rounded-br-md border border-cyan/30 bg-gradient-to-br from-cyan/24 to-mint/10"
    : "rounded-[20px] rounded-bl-md border border-glass-brd bg-glass";
```

на:

```typescript
  const bubble = mine
    ? "rounded-[20px] rounded-br-md border border-cyan/30"
    : "rounded-[20px] rounded-bl-md border border-glass-brd";
  const bubbleStyle: CSSProperties = mine
    ? {
        background:
          "var(--chat-bubble-mine, linear-gradient(to bottom right, color-mix(in srgb, var(--vm-cyan) 24%, transparent), color-mix(in srgb, var(--vm-mint-from) 10%, transparent)))",
        color: "var(--chat-bubble-mine-ink, var(--vm-text-0))",
      }
    : {
        background: "var(--chat-bubble-theirs, var(--vm-glass))",
        color: "var(--chat-bubble-theirs-ink, var(--vm-text-0))",
      };
```

Применить `bubbleStyle` на обёртке-пузыре (бывший `<button>`, ставший `<div role="button">` в предыдущем фиксе вложенности):

```tsx
        <div
          role="button"
          tabIndex={0}
          onClick={() => setOpen((current) => !current)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setOpen((current) => !current);
            }
          }}
          aria-expanded={open}
          aria-label={open ? "Скрыть действия" : "Действия с сообщением"}
          style={bubbleStyle}
          className={`max-w-[85%] cursor-default px-3.5 py-2.5 text-left ${bubble} shadow-lg shadow-black/20`}
        >
```

Убрать `text-text-0` с обёртки текста сообщения (цвет теперь наследуется от `bubbleStyle.color`):

```tsx
              {message.body && (
                <span className="block whitespace-pre-wrap break-words text-[15px] leading-[21px]">
                  {message.body}
                </span>
              )}
```

- [ ] **Step 2: Перевести акцентные элементы на `--chat-accent`**

Заменить в цитате ответа:

```tsx
                  <span className="w-[3px] shrink-0 rounded-sm bg-cyan" />
```

на:

```tsx
                  <span
                    className="w-[3px] shrink-0 rounded-sm"
                    style={{ background: "var(--chat-accent, var(--vm-cyan))" }}
                  />
```

и:

```tsx
                    <span className="text-[11px] font-bold text-cyan">
```

на:

```tsx
                    <span
                      className="text-[11px] font-bold"
                      style={{ color: "var(--chat-accent, var(--vm-cyan))" }}
                    >
```

Заменить ссылку «Обсудить» / «Комментарии»:

```tsx
          <Link
            href={threadHref}
            className="px-1.5 text-[13px] font-semibold text-cyan hover:underline"
          >
```

на:

```tsx
          <Link
            href={threadHref}
            style={{ color: "var(--chat-accent, var(--vm-cyan))" }}
            className="px-1.5 text-[13px] font-semibold hover:underline"
          >
```

Заменить `className="text-cyan"` в `ReadMark` (иконка «прочитано»):

```tsx
      className="text-cyan"
```

на:

```tsx
      style={{ color: "var(--chat-accent, var(--vm-cyan))" }}
```

(в обеих ветках `<svg>` компонента `ReadMark` — прочитано и доставлено оставляем как есть: серую «доставлено»-иконку акцент не трогает, спека ограничивает акцент только галочкой «прочитано»).

- [ ] **Step 2: Прогнать тесты компонента сообщений и всего веба**

```bash
pnpm --filter @vedamatch/web exec vitest run src/components/chat
pnpm --filter @vedamatch/web test
```

Expected: PASS — существующие тесты `chat-message` (если есть) и остальных компонентов не читают инлайн-цвета явно, поэтому не ломаются;`pnpm --filter @vedamatch/web test` прогоняет все 85+ файлов.

- [ ] **Step 3: Ручная проверка в браузере**

Открыть беседу с активным dev-сервером (`pnpm dev`), в меню беседы выбрать «Оформление» → «Создать новый шаблон», задать контрастные цвета, сохранить, вернуться в беседу и применить шаблон. Убедиться, что:
- фон переписки, пузыри и акценты (ссылка «Обсудить», галочка «прочитано», рамка цитаты) поменялись;
- текст внутри пузырей читается на любом выбранном фоне (автоконтраст сработал);
- у собеседника (второй пользователь / инкогнито-вкладка) беседа выглядит как раньше — приватность соблюдена.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/chat/chat-message.tsx
git commit -m "feat(chat): пузыри и акцент читают шаблон цвета через CSS-переменные"
```

---

## Итоговая проверка

```bash
pnpm --filter @vedamatch/api test
pnpm --filter @vedamatch/web test
pnpm --filter @vedamatch/api build
pnpm --filter @vedamatch/web build
```

Expected: все четыре команды завершаются без ошибок.
