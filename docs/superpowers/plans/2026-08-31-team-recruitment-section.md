# Раздел «Команда» на лендинге — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Публичная страница `/team` с формой заявки кандидата (роль, контакт, сообщение, портфолио), уведомление активных админов по существующему пайплайну `NotificationsListener`, админский раздел `/admin/team-applications` для триажа заявок.

**Architecture:** Лёгкое расширение портальной инфраструктуры по образцу `SupportModule` — новый модуль `apps/api/src/modules/team-applications/` (не каталожный сервис, без `service-admin`-роли), одна модель `TeamApplication` в Prisma, одно новое событие `team.application.received` в существующей шине уведомлений. На вебе — публичная страница + форма (клон паттерна `/support`) и раздел админки (клон паттерна `/admin/tickets`).

**Tech Stack:** NestJS 11 + Prisma/Postgres (apps/api), Next.js 16 App Router + Tailwind v4 (apps/web), jest (apps/api), vitest + @testing-library/react (apps/web).

## Global Constraints

- **Спека:** `docs/superpowers/specs/2026-08-31-team-recruitment-section-design.md` — источник истины по архитектурному решению; этот план его детализирует.
- **Контракт сервисного модуля** (`docs/service-module-contract.md`): новый модуль импортирует только `AuthModule`; общие хелперы валидации (`requireText`/`optionalText`/`normalizeEmail`/`normalizeTelegram`) дублируются внутри модуля, а не импортируются из `support`.
- **Prisma-миграции пишутся руками.** `pnpm prisma migrate dev` в этом репозитории НЕЛЬЗЯ запускать — в dev-базе есть записи миграций вне `prisma/migrations`, и команда предложит `reset` (потеря данных). Порядок: `npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script` → вручную выбрать из вывода только свои `CREATE`/`ALTER` → положить в `prisma/migrations/<YYYYMMDDHHMMSS>_<name>/migration.sql` → `pnpm --filter @vedamatch/api exec prisma migrate deploy` → `npx prisma migrate status` для проверки. `prisma generate` падает с `EPERM`, если запущен dev-сервер API — сначала остановить его.
- **Push кандидату недоступен технически** — анонимная форма, `PushSubscription` требует `userId` залогиненного `User`. Push получает только администратор; кандидат видит экранное подтверждение.
- **Роль `TeamApplicationStatus`не использует значение `new`** (в отличие от черновика в спеке) — используется `submitted`, чтобы не подходить вплотную к зарезервированному слову и следовать соглашению `SupportTicketStatus.open` (осмысленное имя начального статуса, а не техническое «new»). Это единственное отклонение от спеки — остальная структура данных совпадает буквально.
- **Тексты — на русском, без указания рода** (`User.gender` необязателен), по примеру `notification-copy.ts`.
- Тесты: `pnpm --filter @vedamatch/api test -- team-applications` (jest), `pnpm --filter @vedamatch/web exec vitest run src/components/team/team-application-form.spec.tsx` (vitest).

---

### Task 1: Модель `TeamApplication` в Prisma и миграция

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (добавить блок в конец файла, после `// ===== Music service =====`)
- Create: `apps/api/prisma/migrations/20260831120000_team_applications/migration.sql`

**Interfaces:**
- Produces: Prisma-модель `TeamApplication` с полями `id, role, roleOther, contactName, contactEmail, contactTelegram, message, portfolioUrl, userId, status, adminNote, createdAt, updatedAt`; enum `TeamApplicationRole` (`security | backend | frontend | devops | qa | design | community | mobile | other`); enum `TeamApplicationStatus` (`submitted | reviewing | accepted | rejected | closed`, дефолт `submitted`).

- [ ] **Step 1: Добавить блок моделей в конец `schema.prisma`**

Открыть `apps/api/prisma/schema.prisma`, перейти в самый конец файла (после последней модели `MusicSettings` блока `// ===== Music service =====`) и добавить:

```prisma

// ===== Team applications =====

enum TeamApplicationRole {
  security
  backend
  frontend
  devops
  qa
  design
  community
  mobile
  other
}

enum TeamApplicationStatus {
  submitted
  reviewing
  accepted
  rejected
  closed
}

model TeamApplication {
  id              String                @id @default(uuid())
  role            TeamApplicationRole
  /// Обязательно при role = other — формулировка кандидата, которой нет в списке.
  roleOther       String?
  contactName     String?
  contactEmail    String?
  contactTelegram String?
  message         String
  portfolioUrl    String?
  userId          String?
  user            User?                 @relation(fields: [userId], references: [id], onDelete: SetNull)
  status          TeamApplicationStatus @default(submitted)
  adminNote       String?
  createdAt       DateTime              @default(now())
  updatedAt       DateTime              @updatedAt

  @@index([status, createdAt])
}
```

- [ ] **Step 2: Проверить схему**

Run: `pnpm --filter @vedamatch/api exec prisma validate`
Expected: `The schema at prisma\schema.prisma is valid 🚀`

- [ ] **Step 3: Сгенерировать diff и вручную составить миграцию**

Run: `cd apps/api && npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script`

Ожидается вывод, содержащий ровно два `CREATE TYPE` и один `CREATE TABLE "TeamApplication"` (плюс индекс и внешний ключ) — модель новая, посторонних объектов в diff быть не должно. Если diff предлагает удалить что-то ещё (индексы `trgm`, чужие колонки) — брать в миграцию **только** относящееся к `TeamApplication`.

Создать файл `apps/api/prisma/migrations/20260831120000_team_applications/migration.sql`:

```sql
-- Заявки кандидатов на открытые роли в команде проекта: форма на лендинге
-- /team без регистрации, админ триагирует в /admin/team-applications.

-- CreateEnum
CREATE TYPE "TeamApplicationRole" AS ENUM ('security', 'backend', 'frontend', 'devops', 'qa', 'design', 'community', 'mobile', 'other');

-- CreateEnum
CREATE TYPE "TeamApplicationStatus" AS ENUM ('submitted', 'reviewing', 'accepted', 'rejected', 'closed');

-- CreateTable
CREATE TABLE "TeamApplication" (
    "id" TEXT NOT NULL,
    "role" "TeamApplicationRole" NOT NULL,
    "roleOther" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactTelegram" TEXT,
    "message" TEXT NOT NULL,
    "portfolioUrl" TEXT,
    "userId" TEXT,
    "status" "TeamApplicationStatus" NOT NULL DEFAULT 'submitted',
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeamApplication_status_createdAt_idx" ON "TeamApplication"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "TeamApplication" ADD CONSTRAINT "TeamApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 4: Накатить миграцию**

Если запущен dev-сервер API (preview) — остановить его перед следующим шагом (`prisma generate` держит `query_engine-windows.dll.node` и падает с `EPERM`, если процесс жив).

Run: `pnpm --filter @vedamatch/api exec prisma migrate deploy`
Expected: `1 migration found ... Applying migration \`20260831120000_team_applications\` ... All migrations have been successfully applied.`

- [ ] **Step 5: Проверить статус и перегенерировать клиент**

Run: `pnpm --filter @vedamatch/api exec prisma migrate status`
Expected: `Database schema is up to date!` (среди прочих ранее известных «лишних» записей — это норма, см. `[[prisma-migrations-by-hand]]`)

Run: `pnpm --filter @vedamatch/api exec prisma generate`
Expected: успешная генерация без `EPERM`

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260831120000_team_applications
git commit -m "feat(api): add TeamApplication model and migration"
```

---

### Task 2: Общие типы в `@vedamatch/shared`

**Files:**
- Create: `packages/shared/src/team-applications.ts`
- Modify: `packages/shared/src/index.ts:9` (добавить `export * from './team-applications';` рядом с `export * from './support';`)

**Interfaces:**
- Consumes: ничего (чистые типы)
- Produces: `TeamApplicationRole`, `TeamApplicationStatus`, `CreateTeamApplicationRequest`, `CreateTeamApplicationResponse`, `TeamApplicationDto`, `AdminTeamApplicationListResponse`, `AdminUpdateTeamApplicationRequest` — используются в Task 4 (сервис API), Task 6–10 (веб).

- [ ] **Step 1: Написать файл типов**

Create `packages/shared/src/team-applications.ts`:

```ts
// Типы заявок в команду: форма на лендинге /team, админка /admin/team-applications.

export type TeamApplicationRole =
  | 'security'
  | 'backend'
  | 'frontend'
  | 'devops'
  | 'qa'
  | 'design'
  | 'community'
  | 'mobile'
  | 'other';

export type TeamApplicationStatus =
  | 'submitted'
  | 'reviewing'
  | 'accepted'
  | 'rejected'
  | 'closed';

export interface CreateTeamApplicationRequest {
  role: TeamApplicationRole;
  /** Обязательно, если role === 'other'. */
  roleOther?: string | null;
  contactName?: string | null;
  /** Нужен хотя бы один контакт: email или telegram. */
  contactEmail?: string | null;
  contactTelegram?: string | null;
  message: string;
  portfolioUrl?: string | null;
}

export interface CreateTeamApplicationResponse {
  id: string;
  status: TeamApplicationStatus;
  createdAt: string;
}

export interface TeamApplicationDto {
  id: string;
  role: TeamApplicationRole;
  roleOther: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactTelegram: string | null;
  message: string;
  portfolioUrl: string | null;
  status: TeamApplicationStatus;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminTeamApplicationListResponse {
  items: TeamApplicationDto[];
  newCount: number;
}

export interface AdminUpdateTeamApplicationRequest {
  status?: TeamApplicationStatus;
  adminNote?: string | null;
}
```

- [ ] **Step 2: Экспортировать модуль**

В `packages/shared/src/index.ts` рядом со строкой `export * from './support';` (строка 9) добавить:

```ts
export * from './team-applications';
```

- [ ] **Step 3: Проверить сборку типов**

Run: `pnpm --filter @vedamatch/shared exec tsc --noEmit`
Expected: без ошибок

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/team-applications.ts packages/shared/src/index.ts
git commit -m "feat(shared): add TeamApplication types"
```

---

### Task 3: Событие уведомления `team.application.received`

**Files:**
- Modify: `packages/shared/src/notifications.ts` (добавить вариант в `NotificationEvent`)
- Modify: `apps/api/src/modules/notifications/notification-copy.ts` (добавить имя события и текст)

**Interfaces:**
- Consumes: `TeamApplicationDto` не нужен — событие несёт только факты (`recipientId`, `applicationId`, `roleLabel`)
- Produces: тип `NotificationEvent` с новым вариантом `'team.application.received'`; `notificationEventNames.teamApplicationReceived`; ветка `buildNotification` — используется в Task 4 (`TeamApplicationsService.notifyAdmins`).

- [ ] **Step 1: Добавить вариант события**

В `packages/shared/src/notifications.ts` перед закрывающим `;` объединения `NotificationEvent` (после варианта `'library.section-request.decided'`, перед `| { name: 'chat.message-sent'; ...`) добавить:

```ts
  | {
      /** Кандидат подал заявку в команду проекта. Уходит активным админам:
       *  без сигнала заявка лежит в очереди до случайного захода в раздел. */
      name: 'team.application.received';
      recipientId: string;
      applicationId: string;
      /** Название роли для текста уведомления — без похода в БД получателем. */
      roleLabel: string;
    }
```

- [ ] **Step 2: Зарегистрировать имя события**

В `apps/api/src/modules/notifications/notification-copy.ts`, в объекте `notificationEventNames` (после строки `librarySectionRequestDecided: 'library.section-request.decided',`) добавить:

```ts
  teamApplicationReceived: 'team.application.received',
```

- [ ] **Step 3: Добавить текст уведомления**

В том же файле, в `switch (event.name)` внутри `buildNotification`, после ветки `case 'library.section-request.decided':` (перед `case 'music.track.published':`) добавить:

```ts
    case 'team.application.received':
      return {
        title: 'Новая заявка в команду',
        body: `Кандидат откликнулся: ${event.roleLabel}`,
        url: `/admin/team-applications/${event.applicationId}`,
        tag: `team-application:${event.applicationId}`,
        category: 'support',
      };
```

- [ ] **Step 4: Проверить типы**

Run: `pnpm --filter @vedamatch/api exec tsc --noEmit`
Expected: без ошибок (значит `switch` остаётся исчерпывающим и новый вариант учтён)

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/notifications.ts apps/api/src/modules/notifications/notification-copy.ts
git commit -m "feat(notifications): add team.application.received event"
```

---

### Task 4: `TeamApplicationsService` — валидация, создание, админ-операции (TDD)

**Files:**
- Test: `apps/api/src/modules/team-applications/team-applications.service.spec.ts`
- Create: `apps/api/src/modules/team-applications/team-applications.service.ts`

**Interfaces:**
- Consumes: `PrismaService` (из `../../prisma/prisma.service`), `EventEmitter2` (из `@nestjs/event-emitter`), типы из Task 2 и 3.
- Produces: класс `TeamApplicationsService` с методами `create(body, author?)`, `adminList(role, status?)`, `adminGet(role, id)`, `adminUpdate(role, id, body)` — используется в Task 5 (контроллер).

- [ ] **Step 1: Написать падающие тесты**

Create `apps/api/src/modules/team-applications/team-applications.service.spec.ts`:

```ts
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { TeamApplicationsService } from './team-applications.service';
import type { PrismaService } from '../../prisma/prisma.service';

function createService() {
  const created: Array<Record<string, unknown>> = [];
  const prisma = {
    teamApplication: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return Promise.resolve({
          id: 'application-1',
          status: 'submitted',
          createdAt: new Date('2026-08-31T10:00:00.000Z'),
        });
      }),
    },
    user: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  } as unknown as PrismaService;

  const events = { emit: jest.fn() };

  return {
    service: new TeamApplicationsService(prisma, events as never),
    created,
    prisma,
    events,
  };
}

describe('TeamApplicationsService.create', () => {
  it('требует контакт у кандидата', async () => {
    const { service } = createService();
    await expect(
      service.create({ role: 'backend', message: 'Хочу помочь с бэкендом' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('принимает заявку с telegram и нормализует его', async () => {
    const { service, created } = createService();
    const result = await service.create({
      role: 'security',
      message: 'Занимаюсь пентестами пять лет',
      contactTelegram: 'https://t.me/sec_expert',
    });

    expect(result.status).toBe('submitted');
    expect(created[0]).toMatchObject({
      role: 'security',
      contactTelegram: '@sec_expert',
      roleOther: null,
    });
  });

  it('требует roleOther при role = other', async () => {
    const { service } = createService();
    await expect(
      service.create({
        role: 'other',
        message: 'Текст',
        contactEmail: 'a@example.com',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('принимает role = other с заполненным roleOther', async () => {
    const { service, created } = createService();
    await service.create({
      role: 'other',
      roleOther: 'Продюсер контента',
      message: 'Текст',
      contactEmail: 'a@example.com',
    });
    expect(created[0]).toMatchObject({
      role: 'other',
      roleOther: 'Продюсер контента',
    });
  });

  it('отклоняет некорректную ссылку на портфолио', async () => {
    const { service } = createService();
    await expect(
      service.create({
        role: 'design',
        message: 'Текст',
        contactEmail: 'a@example.com',
        portfolioUrl: 'not-a-url',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('уведомляет активных админов о новой заявке', async () => {
    const { service, events, prisma } = createService();
    (prisma.user.findMany as jest.Mock).mockResolvedValue([
      { id: 'admin-1' },
      { id: 'admin-2' },
    ]);

    await service.create({
      role: 'security',
      message: 'Текст',
      contactEmail: 'a@example.com',
    });
    // notifyAdmins не awaited в create(): даём микрозадачам отработать.
    await new Promise((resolve) => setImmediate(resolve));

    expect(events.emit).toHaveBeenCalledWith('team.application.received', {
      name: 'team.application.received',
      recipientId: 'admin-1',
      applicationId: 'application-1',
      roleLabel: 'Специалист по безопасности',
    });
    expect(events.emit).toHaveBeenCalledWith('team.application.received', {
      name: 'team.application.received',
      recipientId: 'admin-2',
      applicationId: 'application-1',
      roleLabel: 'Специалист по безопасности',
    });
  });

  it('пустое сообщение — ошибка валидации', async () => {
    const { service } = createService();
    await expect(
      service.create({
        role: 'backend',
        message: '   ',
        contactEmail: 'a@example.com',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('TeamApplicationsService admin guards', () => {
  it('не пускает обычного пользователя в список заявок', async () => {
    const { service } = createService();
    await expect(service.adminList('user')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
```

- [ ] **Step 2: Запустить тесты — убедиться, что падают**

Run: `pnpm --filter @vedamatch/api test -- team-applications`
Expected: FAIL — `Cannot find module './team-applications.service'`

- [ ] **Step 3: Написать сервис**

Create `apps/api/src/modules/team-applications/team-applications.service.ts`:

```ts
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { NotificationEvent } from '@vedamatch/shared';
import type {
  AdminTeamApplicationListResponse,
  AdminUpdateTeamApplicationRequest,
  CreateTeamApplicationRequest,
  CreateTeamApplicationResponse,
  Role,
  TeamApplicationDto,
  TeamApplicationRole,
  TeamApplicationStatus,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';

const ROLES: TeamApplicationRole[] = [
  'security',
  'backend',
  'frontend',
  'devops',
  'qa',
  'design',
  'community',
  'mobile',
  'other',
];
const STATUSES: TeamApplicationStatus[] = [
  'submitted',
  'reviewing',
  'accepted',
  'rejected',
  'closed',
];
const ROLE_LABELS: Record<TeamApplicationRole, string> = {
  security: 'Специалист по безопасности',
  backend: 'Backend-разработчик',
  frontend: 'Frontend-разработчик',
  devops: 'DevOps/SRE',
  qa: 'QA / test automation',
  design: 'UI/UX-дизайнер',
  community: 'Community/контент-менеджер',
  mobile: 'Mobile/PWA-оптимизация',
  other: 'Другое',
};

const MAX_MESSAGE_LENGTH = 4000;
const MAX_CONTACT_LENGTH = 160;
const MAX_ROLE_OTHER_LENGTH = 160;
const MAX_URL_LENGTH = 300;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TELEGRAM_PATTERN = /^@?[A-Za-z0-9_]{4,32}$/;

@Injectable()
export class TeamApplicationsService {
  private readonly logger = new Logger(TeamApplicationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Создание заявки. Кандидат всегда гость: контакт (email или telegram)
   * обязателен независимо от того, залогинен ли он случайно — решение по
   * заявке сообщается вне портала.
   */
  async create(
    body: CreateTeamApplicationRequest,
    author?: { sub: string },
  ): Promise<CreateTeamApplicationResponse> {
    const role = ROLES.includes(body?.role as TeamApplicationRole)
      ? (body.role as TeamApplicationRole)
      : null;
    if (!role) {
      throw new BadRequestException('Выберите роль из списка');
    }
    const roleOther =
      role === 'other'
        ? requireText(body?.roleOther, MAX_ROLE_OTHER_LENGTH, 'название роли')
        : null;
    const message = requireText(
      body?.message,
      MAX_MESSAGE_LENGTH,
      'сопроводительное сообщение',
    );
    const contactEmail = normalizeEmail(body?.contactEmail);
    const contactTelegram = normalizeTelegram(body?.contactTelegram);
    const contactName = optionalText(body?.contactName, MAX_CONTACT_LENGTH);
    const portfolioUrl = normalizeUrl(body?.portfolioUrl);

    if (!contactEmail && !contactTelegram) {
      throw new BadRequestException(
        'Оставьте email или Telegram — иначе мы не сможем ответить',
      );
    }

    const application = await this.prisma.teamApplication.create({
      data: {
        role,
        roleOther,
        contactName,
        contactEmail,
        contactTelegram,
        message,
        portfolioUrl,
        userId: author?.sub ?? null,
      },
      select: { id: true, status: true, createdAt: true },
    });
    void this.notifyAdmins(application.id, role);

    return {
      id: application.id,
      status: application.status,
      createdAt: application.createdAt.toISOString(),
    };
  }

  async adminList(
    role: Role,
    status?: string,
  ): Promise<AdminTeamApplicationListResponse> {
    ensureAdmin(role);
    const filter = STATUSES.includes(status as TeamApplicationStatus)
      ? (status as TeamApplicationStatus)
      : undefined;

    const [items, newCount] = await Promise.all([
      this.prisma.teamApplication.findMany({
        where: filter ? { status: filter } : undefined,
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        take: 200,
      }),
      this.prisma.teamApplication.count({ where: { status: 'submitted' } }),
    ]);

    return {
      items: items.map(toDto),
      newCount,
    };
  }

  async adminGet(role: Role, id: string): Promise<TeamApplicationDto> {
    ensureAdmin(role);
    const application = await this.prisma.teamApplication.findUnique({
      where: { id },
    });
    if (!application) throw new NotFoundException('Заявка не найдена');
    return toDto(application);
  }

  async adminUpdate(
    role: Role,
    id: string,
    body: AdminUpdateTeamApplicationRequest,
  ): Promise<TeamApplicationDto> {
    ensureAdmin(role);
    const application = await this.prisma.teamApplication.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!application) throw new NotFoundException('Заявка не найдена');

    const data: {
      status?: TeamApplicationStatus;
      adminNote?: string | null;
    } = {};
    if (body?.status !== undefined) {
      if (!STATUSES.includes(body.status)) {
        throw new BadRequestException('Недопустимый статус заявки');
      }
      data.status = body.status;
    }
    if (body && 'adminNote' in body) {
      data.adminNote = optionalText(body.adminNote, MAX_MESSAGE_LENGTH);
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('Нечего обновлять');
    }

    await this.prisma.teamApplication.update({ where: { id }, data });
    return this.adminGet(role, id);
  }

  /**
   * Сообщить администраторам о новой заявке. Получателей читаем из `User` —
   * портальная модель, открытая сервисам на чтение. Ошибка не должна ронять
   * создание заявки — то же решение, что в SupportService.notifyAdmins.
   */
  private async notifyAdmins(
    applicationId: string,
    role: TeamApplicationRole,
  ): Promise<void> {
    try {
      const admins = await this.prisma.user.findMany({
        where: {
          role: { in: ['admin', 'service_admin'] },
          accountStatus: 'active',
        },
        select: { id: true },
      });
      for (const admin of admins) {
        const event = {
          name: 'team.application.received',
          recipientId: admin.id,
          applicationId,
          roleLabel: ROLE_LABELS[role],
        } satisfies NotificationEvent;
        this.events.emit(event.name, event);
      }
    } catch (error) {
      this.logger.error(
        `Не удалось уведомить админов о заявке ${applicationId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}

interface ApplicationRow {
  id: string;
  role: TeamApplicationRole;
  roleOther: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactTelegram: string | null;
  message: string;
  portfolioUrl: string | null;
  status: TeamApplicationStatus;
  adminNote: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDto(application: ApplicationRow): TeamApplicationDto {
  return {
    id: application.id,
    role: application.role,
    roleOther: application.roleOther,
    contactName: application.contactName,
    contactEmail: application.contactEmail,
    contactTelegram: application.contactTelegram,
    message: application.message,
    portfolioUrl: application.portfolioUrl,
    status: application.status,
    adminNote: application.adminNote,
    createdAt: application.createdAt.toISOString(),
    updatedAt: application.updatedAt.toISOString(),
  };
}

function ensureAdmin(role: Role): void {
  if (role !== 'admin') {
    throw new ForbiddenException('Доступ только для администратора');
  }
}

function requireText(
  value: unknown,
  maxLength: number,
  label: string,
): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new BadRequestException(`Заполните ${label}`);
  if (text.length > maxLength) {
    throw new BadRequestException(
      `Слишком длинный текст: максимум ${maxLength} символов`,
    );
  }
  return text;
}

function optionalText(value: unknown, maxLength: number): string | null {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return null;
  if (text.length > maxLength) {
    throw new BadRequestException(
      `Слишком длинный текст: максимум ${maxLength} символов`,
    );
  }
  return text;
}

function normalizeEmail(value: unknown): string | null {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!email) return null;
  if (email.length > MAX_CONTACT_LENGTH || !EMAIL_PATTERN.test(email)) {
    throw new BadRequestException('Некорректный email');
  }
  return email;
}

function normalizeTelegram(value: unknown): string | null {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return null;
  const handle = raw.replace(/^https?:\/\/t\.me\//i, '').replace(/^@/, '');
  if (!TELEGRAM_PATTERN.test(handle)) {
    throw new BadRequestException(
      'Telegram указывается как @username (4–32 символа)',
    );
  }
  return `@${handle}`;
}

function normalizeUrl(value: unknown): string | null {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return null;
  if (raw.length > MAX_URL_LENGTH) {
    throw new BadRequestException(
      `Слишком длинная ссылка: максимум ${MAX_URL_LENGTH} символов`,
    );
  }
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('unsupported protocol');
    }
  } catch {
    throw new BadRequestException('Некорректная ссылка на портфолио');
  }
  return raw;
}
```

- [ ] **Step 4: Запустить тесты — убедиться, что проходят**

Run: `pnpm --filter @vedamatch/api test -- team-applications`
Expected: PASS, 8 тестов

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/team-applications/team-applications.service.ts apps/api/src/modules/team-applications/team-applications.service.spec.ts
git commit -m "feat(api): add TeamApplicationsService with validation and admin guards"
```

---

### Task 5: Контроллер, модуль и регистрация в `app.module.ts`

**Files:**
- Create: `apps/api/src/modules/team-applications/team-applications.controller.ts`
- Create: `apps/api/src/modules/team-applications/team-applications.module.ts`
- Modify: `apps/api/src/app.module.ts:17` (импорт), `:57` (регистрация в массиве `imports`)

**Interfaces:**
- Consumes: `TeamApplicationsService` (Task 4), `AuthGuard`/`CurrentUser`/`OptionalAuthGuard`/`OptionalUser` из `../auth/auth.guard`, типы `CreateTeamApplicationRequest`/`AdminUpdateTeamApplicationRequest` из `@vedamatch/shared`.
- Produces: маршруты `POST /team/applications`, `GET /admin/team/applications`, `GET /admin/team/applications/:id`, `PATCH /admin/team/applications/:id` — используются в Task 7 (`apps/web/src/lib/api.ts`) и Task 10 (форма на лендинге).

- [ ] **Step 1: Написать контроллер**

Create `apps/api/src/modules/team-applications/team-applications.controller.ts`:

```ts
import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type {
  AccessTokenPayload,
  AdminUpdateTeamApplicationRequest,
  CreateTeamApplicationRequest,
} from '@vedamatch/shared';
import {
  AuthGuard,
  CurrentUser,
  OptionalAuthGuard,
  OptionalUser,
} from '../auth/auth.guard';
import { TeamApplicationsService } from './team-applications.service';

/** Публичная часть: заявку можно отправить без авторизации. */
@Controller('team/applications')
export class TeamApplicationsController {
  constructor(private readonly team: TeamApplicationsService) {}

  // Форма открыта всему интернету: держим жёсткий лимит на создание.
  @Post()
  @UseGuards(OptionalAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60 * 60_000 } })
  create(
    @OptionalUser() user: AccessTokenPayload | undefined,
    @Body() body: CreateTeamApplicationRequest,
  ) {
    return this.team.create(body, user ? { sub: user.sub } : undefined);
  }
}

@Controller('admin/team/applications')
@UseGuards(AuthGuard)
export class AdminTeamApplicationsController {
  constructor(private readonly team: TeamApplicationsService) {}

  @Get()
  list(
    @CurrentUser() admin: AccessTokenPayload,
    @Query('status') status?: string,
  ) {
    return this.team.adminList(admin.role, status);
  }

  @Get(':id')
  get(@CurrentUser() admin: AccessTokenPayload, @Param('id') id: string) {
    return this.team.adminGet(admin.role, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() admin: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: AdminUpdateTeamApplicationRequest,
  ) {
    return this.team.adminUpdate(admin.role, id, body);
  }
}
```

- [ ] **Step 2: Написать модуль**

Create `apps/api/src/modules/team-applications/team-applications.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import {
  AdminTeamApplicationsController,
  TeamApplicationsController,
} from './team-applications.controller';
import { TeamApplicationsService } from './team-applications.service';

@Module({
  imports: [AuthModule],
  controllers: [TeamApplicationsController, AdminTeamApplicationsController],
  providers: [TeamApplicationsService],
})
export class TeamApplicationsModule {}
```

- [ ] **Step 3: Зарегистрировать модуль в `app.module.ts`**

В `apps/api/src/app.module.ts` после строки 17 (`import { SupportModule } from './modules/support/support.module';`) добавить:

```ts
import { TeamApplicationsModule } from './modules/team-applications/team-applications.module';
```

В массиве `imports`, после строки `SupportModule,` (строка 57) добавить:

```ts
    TeamApplicationsModule,
```

- [ ] **Step 4: Собрать API и убедиться, что сервер стартует**

Run: `pnpm --filter @vedamatch/api exec tsc --noEmit`
Expected: без ошибок

Run: `pnpm --filter @vedamatch/api test -- team-applications`
Expected: PASS (тесты из Task 4 не должны были сломаться регистрацией модуля)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/team-applications/team-applications.controller.ts apps/api/src/modules/team-applications/team-applications.module.ts apps/api/src/app.module.ts
git commit -m "feat(api): wire TeamApplications module into the app"
```

---

### Task 6: Метки и форматирование на вебе (`team-labels.ts`)

**Files:**
- Create: `apps/web/src/lib/team-labels.ts`

**Interfaces:**
- Consumes: `TeamApplicationRole`, `TeamApplicationStatus` из `@vedamatch/shared`
- Produces: `teamRoles`, `teamRoleLabels`, `teamRoleDescriptions`, `teamStatusLabels`, `teamStatuses`, `formatDateTime` — используется в Task 8, 9, 10.

- [ ] **Step 1: Написать файл меток**

Create `apps/web/src/lib/team-labels.ts`:

```ts
import type {
  TeamApplicationRole,
  TeamApplicationStatus,
} from "@vedamatch/shared";

export const teamRoles: TeamApplicationRole[] = [
  "security",
  "backend",
  "frontend",
  "devops",
  "qa",
  "design",
  "community",
  "mobile",
  "other",
];

export const teamRoleLabels: Record<TeamApplicationRole, string> = {
  security: "Специалист по безопасности",
  backend: "Backend-разработчик (NestJS/Prisma)",
  frontend: "Frontend-разработчик (Next.js/React)",
  devops: "DevOps/SRE",
  qa: "QA / test automation",
  design: "UI/UX-дизайнер",
  community: "Community/контент-менеджер",
  mobile: "Mobile/PWA-оптимизация под Android",
  other: "Другое",
};

export const teamRoleDescriptions: Record<TeamApplicationRole, string> = {
  security:
    "Аудит auth (RS256/JWKS), OWASP-риски веб-модулей, защита self-hosted инфраструктуры, работа с секретами и бэкапами БД.",
  backend: "Развитие сервисных модулей по контракту, миграции, фоновые воркеры.",
  frontend: "UI сервисов, PWA, доступность.",
  devops: "Dokploy, VPS, мониторинг, бэкапы, CI/CD.",
  qa: "Автотесты, регресс по сервисам портала.",
  design: "Дизайн-система на токенах, тёмная и светлая тема.",
  community: "Модерация, наполнение Vedabase/Astro/Union.",
  mobile: "Производительность интерфейса на Android.",
  other: "Своя специализация — опишите в заявке.",
};

export const teamStatusLabels: Record<TeamApplicationStatus, string> = {
  submitted: "Новая",
  reviewing: "На рассмотрении",
  accepted: "Принята",
  rejected: "Отклонена",
  closed: "Закрыта",
};

export const teamStatuses: TeamApplicationStatus[] = [
  "submitted",
  "reviewing",
  "accepted",
  "rejected",
  "closed",
];

export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
```

- [ ] **Step 2: Проверить типы**

Run: `pnpm --filter @vedamatch/web exec tsc --noEmit`
Expected: без ошибок

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/team-labels.ts
git commit -m "feat(web): add team application labels"
```

---

### Task 7: Клиент API и пункт админ-навигации

**Files:**
- Modify: `apps/web/src/lib/api.ts` (добавить импорт типов и две функции)
- Modify: `apps/web/src/lib/admin-nav.ts:52-57` (добавить пункт в группу «Люди»)

**Interfaces:**
- Consumes: `AdminTeamApplicationListResponse`, `TeamApplicationDto` из `@vedamatch/shared`; внутренние `apiGet` из `lib/api.ts`.
- Produces: `getAdminTeamApplications(status?)`, `getAdminTeamApplication(id)` — используются в Task 8 и 9.

- [ ] **Step 1: Добавить функции в `lib/api.ts`**

В `apps/web/src/lib/api.ts` добавить в блок импорта типов (рядом с `AdminSupportTicketListResponse`) типы `AdminTeamApplicationListResponse` и `TeamApplicationDto` из `@vedamatch/shared`.

После функции `getAdminSupportTicket` (после строки 159) добавить:

```ts
export const getAdminTeamApplications = (status?: string) => {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiGet<AdminTeamApplicationListResponse>(
    `/admin/team/applications${query}`,
  );
};
export const getAdminTeamApplication = (id: string) =>
  apiGet<TeamApplicationDto>(`/admin/team/applications/${id}`);
```

- [ ] **Step 2: Добавить пункт навигации**

В `apps/web/src/lib/admin-nav.ts`, в группе «Люди», после блока `{ href: "/admin/tickets", ... }` (строки 52-57) добавить:

```ts
      {
        href: "/admin/team-applications",
        label: "Заявки в команду",
        hint: "Отклики кандидатов на открытые роли",
        scope: "portal",
      },
```

- [ ] **Step 3: Проверить типы**

Run: `pnpm --filter @vedamatch/web exec tsc --noEmit`
Expected: без ошибок

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/api.ts apps/web/src/lib/admin-nav.ts
git commit -m "feat(web): add team applications API client and nav entry"
```

---

### Task 8: Список заявок в админке

**Files:**
- Create: `apps/web/src/app/admin/team-applications/page.tsx`

**Interfaces:**
- Consumes: `getAdminTeamApplications`, `getProfile` (Task 7 / существующий `lib/api.ts`), `formatDateTime`/`teamRoleLabels`/`teamStatusLabels`/`teamStatuses` (Task 6).
- Produces: страница `/admin/team-applications`, ссылки на `/admin/team-applications/:id` (используется в Task 9).

- [ ] **Step 1: Написать страницу списка**

Create `apps/web/src/app/admin/team-applications/page.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { redirectToLogin } from "@/lib/require-user";
import type { TeamApplicationStatus } from "@vedamatch/shared";
import { getAdminTeamApplications, getProfile } from "@/lib/api";
import {
  formatDateTime,
  teamRoleLabels,
  teamStatusLabels,
  teamStatuses,
} from "@/lib/team-labels";

const filters: Array<TeamApplicationStatus | "all"> = [...teamStatuses, "all"];

const filterLabels: Record<TeamApplicationStatus | "all", string> = {
  ...teamStatusLabels,
  all: "Все",
};

export default async function AdminTeamApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const requested = Array.isArray(params.status)
    ? params.status[0]
    : params.status;
  const status = filters.includes(requested as TeamApplicationStatus | "all")
    ? (requested as TeamApplicationStatus | "all")
    : "submitted";

  const user = await getProfile();
  if (!user) redirectToLogin("/admin/team-applications");
  if (user.role !== "admin") redirect("/");

  const applications = await getAdminTeamApplications(
    status === "all" ? undefined : status,
  );
  if (!applications) throw new Error("Не удалось загрузить заявки");

  return (
    <>
      <h1 className="mb-1 font-display text-2xl font-bold text-text-0">
        Заявки в команду
      </h1>
      <p className="mb-6 text-sm text-text-1">
        Новых: {applications.newCount}
      </p>

      <nav className="mb-6 flex flex-wrap gap-2">
        {filters.map((value) => (
          <Link
            key={value}
            href={`/admin/team-applications?status=${value}`}
            aria-current={value === status ? "page" : undefined}
            className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${
              value === status
                ? "border-magenta/40 bg-magenta/10 text-text-0"
                : "glass border-glass-brd text-text-1 hover:text-text-0"
            }`}
          >
            {filterLabels[value]}
          </Link>
        ))}
      </nav>

      {applications.items.length === 0 ? (
        <p className="glass rounded-2xl border border-glass-brd p-8 text-center text-sm text-text-1">
          Заявок в этой категории нет.
        </p>
      ) : (
        <ul className="space-y-3">
          {applications.items.map((application) => (
            <li key={application.id}>
              <Link
                href={`/admin/team-applications/${application.id}`}
                className="glass block rounded-2xl border border-glass-brd p-5 transition hover:border-magenta/30"
              >
                <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
                  <span className="font-semibold text-text-0">
                    {teamRoleLabels[application.role]}
                    {application.role === "other" && application.roleOther
                      ? ` · ${application.roleOther}`
                      : ""}
                  </span>
                  <span className="rounded-full border border-glass-brd px-2.5 py-1 text-xs font-semibold text-text-1">
                    {teamStatusLabels[application.status]}
                  </span>
                </div>
                <p className="text-sm text-text-2">
                  создано {formatDateTime(application.createdAt)}
                </p>
                <p className="mt-1 text-sm text-text-2">
                  {[
                    application.contactName,
                    application.contactEmail,
                    application.contactTelegram,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "контакты не указаны"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
```

- [ ] **Step 2: Проверить типы**

Run: `pnpm --filter @vedamatch/web exec tsc --noEmit`
Expected: без ошибок

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/admin/team-applications/page.tsx
git commit -m "feat(web): add admin team applications list page"
```

---

### Task 9: Детальная страница заявки в админке

**Files:**
- Create: `apps/web/src/app/admin/team-applications/[id]/page.tsx`
- Create: `apps/web/src/components/team/team-application-detail.tsx`

**Interfaces:**
- Consumes: `getAdminTeamApplication`, `getProfile` (Task 7), `apiFetch` (`apps/web/src/lib/http-client.ts`), метки из Task 6.
- Produces: страница `/admin/team-applications/:id` со сменой статуса и служебной пометкой через `PATCH /admin/team/applications/:id` (Task 5).

- [ ] **Step 1: Написать клиентский компонент детали**

Create `apps/web/src/components/team/team-application-detail.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TeamApplicationDto } from "@vedamatch/shared";
import {
  formatDateTime,
  teamRoleLabels,
  teamStatusLabels,
  teamStatuses,
} from "@/lib/team-labels";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Разбор заявки: смена статуса и служебная пометка. */
export function TeamApplicationDetail({
  application,
}: {
  application: TeamApplicationDto;
}) {
  const router = useRouter();
  const [note, setNote] = useState(application.adminNote ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(body: unknown) {
    setPending(true);
    setError(null);
    try {
      const res = await apiFetch(
        `${API_URL}/admin/team/applications/${application.id}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as
          | { message?: string }
          | null;
        throw new Error(payload?.message ?? "Не удалось сохранить изменения");
      }
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Не удалось сохранить изменения",
      );
    } finally {
      setPending(false);
    }
  }

  const contact = [
    application.contactName,
    application.contactEmail,
    application.contactTelegram,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-6">
      <header className="glass rounded-2xl border border-glass-brd p-6">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-text-2">
              {teamRoleLabels[application.role]}
              {application.role === "other" && application.roleOther
                ? ` · ${application.roleOther}`
                : ""}
            </p>
            <h1 className="font-display text-xl font-bold text-text-0">
              {contact || "Контакты не указаны"}
            </h1>
          </div>
          <span className="rounded-full border border-glass-brd px-3 py-1 text-xs font-semibold text-text-1">
            {teamStatusLabels[application.status]}
          </span>
        </div>

        <p className="mb-2 text-sm text-text-2">
          Создано {formatDateTime(application.createdAt)}
        </p>
        {application.portfolioUrl && (
          <p className="mb-2 text-sm text-text-1">
            Портфолио:{" "}
            <a
              href={application.portfolioUrl}
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-text-0"
            >
              {application.portfolioUrl}
            </a>
          </p>
        )}
        <p className="whitespace-pre-wrap text-sm text-text-1">
          {application.message}
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {teamStatuses
            .filter((value) => value !== application.status)
            .map((value) => (
              <button
                key={value}
                type="button"
                disabled={pending}
                onClick={() => void call({ status: value })}
                className="rounded-xl glass border border-glass-brd px-3 py-1.5 text-xs font-medium text-text-1 hover:text-text-0 disabled:opacity-50"
              >
                {teamStatusLabels[value]}
              </button>
            ))}
        </div>
      </header>

      <div className="glass space-y-3 rounded-2xl border border-glass-brd p-4">
        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-wide text-text-2">
            Служебная пометка
          </span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            maxLength={4000}
            className="w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
          />
        </label>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          type="button"
          disabled={pending}
          onClick={() => void call({ adminNote: note })}
          className="rounded-xl glass border border-glass-brd px-4 py-2 text-sm font-medium text-text-1 hover:text-text-0 disabled:opacity-50"
        >
          Сохранить пометку
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Написать серверную страницу**

Create `apps/web/src/app/admin/team-applications/[id]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { redirectToLogin } from "@/lib/require-user";
import { getAdminTeamApplication, getProfile } from "@/lib/api";
import { TeamApplicationDetail } from "@/components/team/team-application-detail";

export default async function AdminTeamApplicationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getProfile();
  if (!user) redirectToLogin(`/admin/team-applications/${id}`);
  if (user.role !== "admin") redirect("/");

  const application = await getAdminTeamApplication(id);
  if (!application) notFound();

  return (
    <>
      <Link
        href="/admin/team-applications"
        className="mb-4 inline-block text-sm text-text-2 hover:text-text-0"
      >
        ← Все заявки
      </Link>
      <TeamApplicationDetail application={application} />
    </>
  );
}
```

- [ ] **Step 3: Проверить типы**

Run: `pnpm --filter @vedamatch/web exec tsc --noEmit`
Expected: без ошибок

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/admin/team-applications/[id]/page.tsx apps/web/src/components/team/team-application-detail.tsx
git commit -m "feat(web): add admin team application detail page"
```

---

### Task 10: Публичная страница `/team`, форма заявки и ссылка в футере (TDD на форме)

**Files:**
- Test: `apps/web/src/components/team/team-application-form.spec.tsx`
- Create: `apps/web/src/components/team/team-application-form.tsx`
- Create: `apps/web/src/app/team/page.tsx`
- Modify: `apps/web/src/components/landing/Footer.tsx:33` (добавить ссылку `/team`)
- Modify: `apps/web/messages/ru.json:146-152`, `apps/web/messages/en.json:146-152` (добавить ключ `team` в `Landing.footer`)

**Interfaces:**
- Consumes: `CreateTeamApplicationResponse`, `TeamApplicationRole` (`@vedamatch/shared`), `teamRoles`/`teamRoleLabels` (Task 6), `apiFetch` (`lib/http-client.ts`).
- Produces: страницу `/team`, компонент `TeamApplicationForm`, отправляющий `POST /team/applications` (Task 5).

- [ ] **Step 1: Написать падающие тесты формы**

Create `apps/web/src/components/team/team-application-form.spec.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TeamApplicationForm } from "./team-application-form";

describe("TeamApplicationForm", () => {
  it("отклоняет отправку без email и telegram", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<TeamApplicationForm />);

    await user.type(
      screen.getByRole("textbox", { name: "Расскажите о себе" }),
      "Пять лет пентестов",
    );
    await user.click(screen.getByRole("button", { name: "Отправить заявку" }));

    expect(
      screen.getByText(
        "Оставьте email или Telegram — иначе мы не сможем ответить",
      ),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("отправляет заявку и показывает подтверждение", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        id: "app-1",
        status: "submitted",
        createdAt: "2026-08-31T10:00:00.000Z",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<TeamApplicationForm />);

    await user.type(
      screen.getByRole("textbox", { name: "Расскажите о себе" }),
      "Пять лет пентестов",
    );
    await user.type(
      screen.getByRole("textbox", { name: "Email для ответа" }),
      "sec@example.com",
    );
    await user.click(screen.getByRole("button", { name: "Отправить заявку" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/team/applications");
    expect(JSON.parse(String(init.body))).toMatchObject({
      role: "security",
      contactEmail: "sec@example.com",
      message: "Пять лет пентестов",
    });
    expect(await screen.findByText("Заявка отправлена")).toBeInTheDocument();
  });

  it("требует описание роли при выборе «Другое»", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<TeamApplicationForm />);

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Роль" }),
      "other",
    );
    await user.type(
      screen.getByRole("textbox", { name: "Расскажите о себе" }),
      "Текст",
    );
    await user.type(
      screen.getByRole("textbox", { name: "Email для ответа" }),
      "a@example.com",
    );
    await user.click(screen.getByRole("button", { name: "Отправить заявку" }));

    expect(
      screen.getByText("Опишите роль, если её нет в списке"),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Запустить тесты — убедиться, что падают**

Run: `pnpm --filter @vedamatch/web exec vitest run src/components/team/team-application-form.spec.tsx`
Expected: FAIL — `Cannot find module './team-application-form'`

- [ ] **Step 3: Написать компонент формы**

Create `apps/web/src/components/team/team-application-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import type {
  CreateTeamApplicationResponse,
  TeamApplicationRole,
} from "@vedamatch/shared";
import { teamRoleLabels, teamRoles } from "@/lib/team-labels";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Форма заявки: кандидат всегда гость, контакт (email или Telegram) обязателен. */
export function TeamApplicationForm() {
  const [role, setRole] = useState<TeamApplicationRole>("security");
  const [roleOther, setRoleOther] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactTelegram, setContactTelegram] = useState("");
  const [message, setMessage] = useState("");
  const [portfolioUrl, setPortfolioUrl] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreateTeamApplicationResponse | null>(
    null,
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!contactEmail.trim() && !contactTelegram.trim()) {
      setError("Оставьте email или Telegram — иначе мы не сможем ответить");
      return;
    }
    if (role === "other" && !roleOther.trim()) {
      setError("Опишите роль, если её нет в списке");
      return;
    }

    setPending(true);
    try {
      const res = await apiFetch(`${API_URL}/team/applications`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role,
          roleOther: role === "other" ? roleOther.trim() : null,
          contactName: contactName.trim() || null,
          contactEmail: contactEmail.trim() || null,
          contactTelegram: contactTelegram.trim() || null,
          message,
          portfolioUrl: portfolioUrl.trim() || null,
        }),
      });
      const payload = (await res.json().catch(() => null)) as
        | (CreateTeamApplicationResponse & { message?: string })
        | null;
      if (!res.ok) {
        throw new Error(payload?.message ?? "Не удалось отправить заявку");
      }
      setCreated(payload as CreateTeamApplicationResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось отправить заявку");
    } finally {
      setPending(false);
    }
  }

  if (created) {
    return (
      <div className="glass rounded-2xl border border-glass-brd p-6">
        <h2 className="mb-2 font-display text-xl font-bold text-text-0">
          Заявка отправлена
        </h2>
        <p className="text-sm text-text-1">
          Спасибо! Мы свяжемся с вами по указанному контакту.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="glass space-y-4 rounded-2xl border border-glass-brd p-6"
    >
      <label className="block">
        <span className="mb-1 block text-xs uppercase tracking-wide text-text-2">
          Роль
        </span>
        <select
          value={role}
          onChange={(event) =>
            setRole(event.target.value as TeamApplicationRole)
          }
          className="w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
        >
          {teamRoles.map((value) => (
            <option key={value} value={value}>
              {teamRoleLabels[value]}
            </option>
          ))}
        </select>
      </label>

      {role === "other" && (
        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-wide text-text-2">
            Какая роль
          </span>
          <input
            value={roleOther}
            onChange={(event) => setRoleOther(event.target.value)}
            maxLength={160}
            placeholder="Например, продюсер контента"
            className="w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
          />
        </label>
      )}

      <label className="block">
        <span className="mb-1 block text-xs uppercase tracking-wide text-text-2">
          Расскажите о себе
        </span>
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          required
          rows={6}
          maxLength={4000}
          placeholder="Опыт, чем можете помочь, сколько времени готовы уделять"
          className="w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-xs uppercase tracking-wide text-text-2">
          Портфолио или профиль (необязательно)
        </span>
        <input
          type="url"
          value={portfolioUrl}
          onChange={(event) => setPortfolioUrl(event.target.value)}
          maxLength={300}
          placeholder="https://github.com/you"
          className="w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs uppercase tracking-wide text-text-2">
            Как к вам обращаться
          </span>
          <input
            value={contactName}
            onChange={(event) => setContactName(event.target.value)}
            maxLength={160}
            className="w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-wide text-text-2">
            Email для ответа
          </span>
          <input
            type="email"
            value={contactEmail}
            onChange={(event) => setContactEmail(event.target.value)}
            maxLength={160}
            placeholder="you@example.com"
            className="w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-wide text-text-2">
            или Telegram
          </span>
          <input
            value={contactTelegram}
            onChange={(event) => setContactTelegram(event.target.value)}
            maxLength={160}
            placeholder="@username"
            className="w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0"
          />
        </label>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-gradient-to-r from-magenta to-[#B23EFF] px-4 py-3 text-sm font-semibold text-white transition hover:shadow-[0_0_24px_rgba(255,62,158,0.45)] disabled:opacity-50"
      >
        {pending ? "Отправляем…" : "Отправить заявку"}
      </button>

      <p className="text-xs text-text-2">
        Отправляя заявку, вы соглашаетесь с{" "}
        <a href="/legal/privacy" className="underline hover:text-text-1">
          Политикой конфиденциальности
        </a>
        .
      </p>
    </form>
  );
}
```

- [ ] **Step 4: Запустить тесты формы — убедиться, что проходят**

Run: `pnpm --filter @vedamatch/web exec vitest run src/components/team/team-application-form.spec.tsx`
Expected: PASS, 3 теста

- [ ] **Step 5: Написать публичную страницу**

Create `apps/web/src/app/team/page.tsx`:

```tsx
import type { Metadata } from "next";
import { getProfile } from "@/lib/api";
import { Header } from "@/components/header";
import { Navbar } from "@/components/landing/Navbar";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";
import { TeamApplicationForm } from "@/components/team/team-application-form";
import {
  teamRoleDescriptions,
  teamRoleLabels,
  teamRoles,
} from "@/lib/team-labels";

export const metadata: Metadata = {
  title: "Команда",
  description:
    "VedaMatch ищет людей: разработчиков, DevOps, дизайнера и в первую очередь — специалиста по безопасности. Оставьте заявку без регистрации.",
};

export default async function TeamPage() {
  const user = await getProfile();

  return (
    <div className="relative min-h-dvh bg-bg-0">
      <BackgroundOrbs />
      <NoiseOverlay />
      {user ? <Header user={user} /> : <Navbar />}

      <main
        className={`mx-auto max-w-3xl px-4 pb-24 ${user ? "py-8" : "pt-28 pb-24"}`}
      >
        <h1 className="mb-2 font-display text-2xl font-bold text-text-0">
          Команда
        </h1>
        <p className="mb-6 text-text-1">
          Проекту нужны люди. Заявку можно отправить без регистрации —
          оставьте email или Telegram, и мы свяжемся.
        </p>

        <div className="glass mb-8 rounded-2xl border border-glass-brd p-5 text-sm text-text-1">
          <p className="mb-1 font-semibold text-text-0">
            Как это устроено сейчас
          </p>
          <p>
            Проект пока держится на энтузиазме и вере в идею — постоянных
            окладов сейчас нет. Но это не «поработайте бесплатно и прощайте»:
            по мере роста аудитории и монетизации сервисов появляются
            оплачиваемые позиции, и в первую очередь их предлагаем тем, кто
            присоединился на раннем этапе и внёс реальный вклад.
          </p>
        </div>

        <section className="mb-10 space-y-3">
          {teamRoles
            .filter((role) => role !== "other")
            .map((role) => (
              <div
                key={role}
                className="glass rounded-2xl border border-glass-brd p-5"
              >
                <div className="mb-1 flex items-center gap-2">
                  <h2 className="font-display text-base font-semibold text-text-0">
                    {teamRoleLabels[role]}
                  </h2>
                  {role === "security" && (
                    <span className="rounded-full bg-magenta/15 px-2.5 py-1 text-xs font-semibold text-magenta">
                      Приоритет
                    </span>
                  )}
                </div>
                <p className="text-sm text-text-2">
                  {teamRoleDescriptions[role]}
                </p>
                <p className="mt-2 text-xs text-text-2">
                  Сейчас — на энтузиазме, дальше — по мере роста возможна
                  оплачиваемая позиция.
                </p>
              </div>
            ))}
        </section>

        <section>
          <h2 className="mb-3 font-display text-lg font-semibold text-text-0">
            Заявка
          </h2>
          <TeamApplicationForm />
        </section>
      </main>
    </div>
  );
}
```

- [ ] **Step 6: Добавить ключ перевода**

В `apps/web/messages/ru.json`, в блоке `"footer"` (строки 146-152), после `"support": "Поддержка",` добавить:

```json
      "team": "Команда",
```

В `apps/web/messages/en.json`, в том же блоке, после `"support": "Support",` добавить:

```json
      "team": "Team",
```

- [ ] **Step 7: Добавить ссылку в футер**

В `apps/web/src/components/landing/Footer.tsx`, после блока со ссылкой `/support` (строки 33-35) добавить:

```tsx
            <Link href="/team" className="hover:text-text-0 transition-colors">
              {t("team")}
            </Link>
```

- [ ] **Step 8: Проверить типы и всю сборку веба**

Run: `pnpm --filter @vedamatch/web exec tsc --noEmit`
Expected: без ошибок

Run: `pnpm --filter @vedamatch/web test`
Expected: PASS, все существующие тесты + новые 3 из этой задачи

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/components/team/team-application-form.tsx apps/web/src/components/team/team-application-form.spec.tsx apps/web/src/app/team/page.tsx apps/web/src/components/landing/Footer.tsx apps/web/messages/ru.json apps/web/messages/en.json
git commit -m "feat(web): add /team page with application form and footer link"
```

---

### Task 11: Ручная проверка в браузере

**Files:** нет изменений — только проверка уже написанного.

- [ ] **Step 1: Поднять dev-серверы**

Использовать `preview_start` с конфигурацией `pnpm dev` (порт 3000 для web, 4000 для API) — dev-серверы поднимаются через preview-инструмент, не через фоновый Bash (в этом проекте фоновый `pnpm dev` не переживает завершение хода агента).

- [ ] **Step 2: Проверить публичную форму**

Открыть `http://localhost:3000/team`:
- видно 8 карточек ролей, у «Специалист по безопасности» — бейдж «Приоритет»;
- виден блок «Как это устроено сейчас» с текстом про отсутствие зарплаты на старте;
- заполнить форму (роль «Другое» → должно появиться поле «Какая роль»; email; сообщение) и отправить — должно появиться «Заявка отправлена»;
- отправить без email/telegram — должна появиться ошибка валидации на клиенте, запрос не должен уйти.

- [ ] **Step 3: Проверить админку**

Залогиниться под аккаунтом с ролью `admin`, открыть `/admin` — в группе «Люди» должен появиться пункт «Заявки в команду». Открыть `/admin/team-applications` — созданная на Step 2 заявка должна быть в списке со статусом «Новая». Открыть её — сменить статус на «На рассмотрении», сохранить служебную пометку — оба действия должны сохраняться (`router.refresh()` обновляет статус на странице).

- [ ] **Step 4: Проверить уведомление админа**

В колокольчике администратора (или через `GET /notifications/inbox`, если UI недоступен в этой сессии) должно появиться уведомление «Новая заявка в команду» со ссылкой на `/admin/team-applications/:id`.

- [ ] **Step 5: Остановить dev-серверы**

Остановить через `preview_stop`, если поднимались отдельно от уже работающей сессии разработчика.

---

## Self-Review

**Spec coverage:**
- Роли/приоритет security — Task 10 (страница `/team`), Task 6 (`teamRoleLabels`) ✓
- Данные + бэкенд-модуль (Prisma, эндпоинты, валидация, уведомление админов) — Task 1, 2, 3, 4, 5 ✓
- Push кандидату невозможен / push админу — Task 3 (событие + копирайт), Task 4 (`notifyAdmins`) ✓
- Админка (список, деталь, admin-nav) — Task 7, 8, 9 ✓
- Лендинг (страница, форма, футер) — Task 10 ✓
- Текст про оплату — Task 10, Step 5 (блок «Как это устроено сейчас» + короткая строка под каждой карточкой) ✓
- Тесты API и веб — Task 4 (jest), Task 10 (vitest) ✓
- Отклонение от спеки (статус `submitted` вместо `new`) явно зафиксировано в Global Constraints ✓

**Placeholder scan:** пройден — весь код в шагах полный, без TODO/TBD; шаги без кода (миграция, ручная проверка) описывают точные команды и ожидаемый вывод.

**Type consistency:** `TeamApplicationDto`/`CreateTeamApplicationRequest`/`AdminUpdateTeamApplicationRequest` (Task 2) используются одинаково в Task 4 (сервис), Task 5 (контроллер), Task 7 (клиент), Task 9–10 (компоненты) — поля не расходятся. Маршруты API (`/team/applications`, `/admin/team/applications`) совпадают в контроллере (Task 5) и клиенте (Task 7, Task 10).
