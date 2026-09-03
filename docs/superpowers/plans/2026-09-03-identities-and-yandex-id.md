# Идентичности и Яндекс ID — план реализации

> **Для агентов:** ОБЯЗАТЕЛЬНЫЙ СУБ-СКИЛЛ: используйте
> superpowers:subagent-driven-development (рекомендуется) или
> superpowers:executing-plans, чтобы выполнять план по задачам. Шаги помечены
> чекбоксами (`- [ ]`).

**Цель:** отвязать способ входа от `User`, перевести Google на новую таблицу без
потери 107 живых аккаунтов и добавить Яндекс ID как второй способ.

**Устройство:** появляется таблица `UserIdentity` (провайдер + внешний
идентификатор) и сервис, который по паре «провайдер, идентификатор» находит или
заводит пользователя. Обработчики провайдеров становятся тонкими: получить
профиль у провайдера — отдать сервису. Видимость способов на экране входа
приходит с сервера из таблицы настроек.

**Стек:** NestJS, Prisma, Jest (`*.spec.ts` рядом с кодом), Next.js App Router,
OAuth 2.1 с PKCE.

## Общие ограничения

- Модели портальные, без сервисного префикса — рядом с `RefreshToken` и
  `LoginAudit`. Правило префиксов из CLAUDE.md касается сервисных моделей.
- Связывание аккаунтов по совпадению почты запрещено при любых обстоятельствах.
- `uuid` пользователя генерирует приложение, а не база: в третьем плане тот же
  идентификатор понадобится московской базе.
- Наружу имя отдаётся через `resolveDisplayName()` из `@vedamatch/shared`,
  Prisma-`select` рядом обязан тянуть `spiritualName`.
- Тесты запускаются `pnpm --filter @vedamatch/api test`.
- Секреты только из переменных окружения. Репозиторий публичный.
- **Новая переменная провайдера дописывается в три места сразу:** `.env.example`,
  блок `environment` сервиса `api` в `portal/docker-compose.dokploy.yml` и
  панель Dokploy. Пропуск второго не ловится ни тестами, ни типами: ключ лежит
  в `.env`, панель показывает его заполненным, а в процесс он не попадает —
  в контейнер уходит только то, что перечислено в `environment`. Наружу это
  выглядит как 503 «не сконфигурирован» при заполненной панели. Ровно так
  потерялся Яндекс 2026-09-03. Форма — `${YANDEX_CLIENT_ID:-}`, со значением
  по умолчанию: способ бывает выключен, и тогда ключей нет вовсе.

---

### Задача 1: Таблица UserIdentity и перенос googleId

**Файлы:**
- Изменить: `apps/api/prisma/schema.prisma`
- Создать: `apps/api/prisma/migrations/<timestamp>_user_identity/migration.sql`

**Интерфейсы:**
- Отдаёт: модель `UserIdentity` с полями `id`, `userId`, `provider`,
  `externalId`, `createdAt`, `lastLoginAt`; энум `AuthProvider` со значениями
  `google`, `vk`, `yandex`, `email`.

- [ ] **Шаг 1: описать модель в схеме**

В `apps/api/prisma/schema.prisma`, в конце файла, рядом с портальными моделями:

```prisma
enum AuthProvider {
  google
  vk
  yandex
  email
}

model UserIdentity {
  id          String       @id @default(uuid())
  userId      String
  provider    AuthProvider
  externalId  String
  createdAt   DateTime     @default(now())
  lastLoginAt DateTime?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, externalId])
  @@index([userId])
}
```

В модель `User` добавить обратную связь рядом с `refreshTokens`:

```prisma
  identities                         UserIdentity[]
```

Колонку `googleId` пока **не удалять** — она нужна для переноса и отката.

- [ ] **Шаг 2: создать миграцию с переносом данных**

```bash
cd apps/api && pnpm prisma migrate dev --name user_identity --create-only
```

В созданный `migration.sql` дописать в конец перенос:

```sql
INSERT INTO "UserIdentity" ("id", "userId", "provider", "externalId", "createdAt")
SELECT gen_random_uuid(), "id", 'google'::"AuthProvider", "googleId", "createdAt"
FROM "User"
WHERE "googleId" IS NOT NULL;
```

- [ ] **Шаг 3: применить и проверить, что перенеслись все**

```bash
cd apps/api && pnpm prisma migrate dev
```

Затем:

```bash
cd apps/api && pnpm prisma db execute --stdin <<'SQL'
SELECT
  (SELECT count(*) FROM "User" WHERE "googleId" IS NOT NULL) AS users_with_google,
  (SELECT count(*) FROM "UserIdentity" WHERE provider = 'google') AS identities;
SQL
```

Ожидается: два одинаковых числа. Если различаются — миграцию откатить и
разобраться, дальше не идти.

- [ ] **Шаг 4: коммит**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(auth): таблица UserIdentity и перенос googleId"
```

---

### Задача 2: Сервис идентичностей

**Файлы:**
- Создать: `apps/api/src/modules/auth/identity.service.ts`
- Создать: `apps/api/src/modules/auth/identity.service.spec.ts`
- Изменить: `apps/api/src/modules/auth/auth.module.ts`

**Интерфейсы:**
- Потребляет: `PrismaService`.
- Отдаёт: `IdentityService.resolve(profile: ProviderProfile): Promise<{ user: User; created: boolean }>`,
  где `ProviderProfile = { provider: AuthProvider; externalId: string; email: string; name: string; avatarUrl?: string; gender?: Gender; residency: 'ru' | 'global' }`.

- [ ] **Шаг 1: написать падающий тест**

`apps/api/src/modules/auth/identity.service.spec.ts`:

```ts
import { IdentityService } from './identity.service';

const profile = {
  provider: 'yandex' as const,
  externalId: '42',
  email: 'ivan@example.com',
  name: 'Иван',
  residency: 'ru' as const,
};

function prismaMock(overrides: Record<string, unknown> = {}) {
  return {
    userIdentity: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'u1', email: profile.email }),
    },
    ...overrides,
  } as never;
}

describe('IdentityService', () => {
  it('заводит пользователя, когда идентичности нет', async () => {
    const prisma = prismaMock();
    const service = new IdentityService(prisma);

    const { created } = await service.resolve(profile);

    expect(created).toBe(true);
  });

  it('не связывает аккаунты по совпадению почты', async () => {
    const prisma = prismaMock({
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'other', email: profile.email }),
        create: jest.fn(),
      },
    });
    const service = new IdentityService(prisma);

    await expect(service.resolve(profile)).rejects.toThrow(/уже используется/);
  });
});
```

- [ ] **Шаг 2: убедиться, что тест падает**

```bash
pnpm --filter @vedamatch/api test -- identity.service
```

Ожидается: FAIL, модуль `./identity.service` не найден.

- [ ] **Шаг 3: написать сервис**

`apps/api/src/modules/auth/identity.service.ts`:

```ts
import { ConflictException, Injectable } from '@nestjs/common';
import type { AuthProvider, Gender, User } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';

export type ProviderProfile = {
  provider: AuthProvider;
  externalId: string;
  email: string;
  name: string;
  avatarUrl?: string;
  gender?: Gender;
  residency: 'ru' | 'global';
};

@Injectable()
export class IdentityService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ищет пользователя по паре «провайдер, идентификатор». Не находит — заводит.
   * Совпадение почты аккаунты НЕ связывает: иначе любой, кто заведёт у другого
   * провайдера ящик с чужим адресом, заберёт чужой аккаунт. Привязать второй
   * способ можно только из настроек живой сессией.
   */
  async resolve(profile: ProviderProfile): Promise<{ user: User; created: boolean }> {
    const existing = await this.prisma.userIdentity.findUnique({
      where: {
        provider_externalId: {
          provider: profile.provider,
          externalId: profile.externalId,
        },
      },
      include: { user: true },
    });

    if (existing) {
      await this.prisma.userIdentity.update({
        where: { id: existing.id },
        data: { lastLoginAt: new Date() },
      });
      return { user: existing.user, created: false };
    }

    const byEmail = await this.prisma.user.findUnique({
      where: { email: profile.email },
    });

    if (byEmail) {
      throw new ConflictException(
        'Этот адрес уже используется. Войдите прежним способом и привяжите новый в настройках.',
      );
    }

    const user = await this.prisma.user.create({
      data: {
        id: randomUUID(),
        email: profile.email,
        name: profile.name,
        avatarUrl: profile.avatarUrl,
        gender: profile.gender,
        identities: {
          create: {
            provider: profile.provider,
            externalId: profile.externalId,
            lastLoginAt: new Date(),
          },
        },
      },
    });

    return { user, created: true };
  }
}
```

`id` задаётся явно: в третьем плане тот же идентификатор понадобится московской
базе, и полагаться на `@default(uuid())` со стороны Postgres нельзя.

- [ ] **Шаг 4: зарегистрировать в модуле**

В `apps/api/src/modules/auth/auth.module.ts` добавить `IdentityService` в
`providers` и в `exports`.

- [ ] **Шаг 5: тесты проходят**

```bash
pnpm --filter @vedamatch/api test -- identity.service
```

Ожидается: PASS, два теста.

- [ ] **Шаг 6: коммит**

```bash
git add apps/api/src/modules/auth/identity.service.ts apps/api/src/modules/auth/identity.service.spec.ts apps/api/src/modules/auth/auth.module.ts
git commit -m "feat(auth): сервис идентичностей без связывания по почте"
```

---

### Задача 3: Google переходит на идентичности

**Файлы:**
- Изменить: `apps/api/src/modules/auth/auth.service.ts:199-235`
- Изменить: `apps/api/src/modules/auth/auth.service.spec.ts`

**Интерфейсы:**
- Потребляет: `IdentityService.resolve` из задачи 2.

- [ ] **Шаг 1: тест на то, что чужая почта больше не отдаёт чужой аккаунт**

В `apps/api/src/modules/auth/auth.service.spec.ts` добавить:

```ts
it('не отдаёт существующий аккаунт при совпадении почты у нового googleId', async () => {
  // Пользователь с этим адресом есть, но идентичности google с таким sub нет.
  const service = makeService({
    userIdentity: { findUnique: jest.fn().mockResolvedValue(null) },
    user: {
      findUnique: jest.fn().mockResolvedValue({ id: 'victim', email: 'a@b.c' }),
      create: jest.fn(),
    },
  });

  await expect(
    service.resolveGoogleProfile({ sub: 'new-sub', email: 'a@b.c', name: 'Кто-то' }),
  ).rejects.toThrow(/уже используется/);
});
```

- [ ] **Шаг 2: убедиться, что падает**

```bash
pnpm --filter @vedamatch/api test -- auth.service
```

Ожидается: FAIL — сейчас код находит по почте и дописывает `googleId`.

- [ ] **Шаг 3: заменить поиск в колбэке**

В `auth.service.ts` весь блок поиска по `googleId` и по `email` (строки 199-235)
заменить на вызов сервиса:

```ts
    const { user } = await this.identities.resolve({
      provider: 'google',
      externalId: claims.sub,
      email,
      name: claims.name ?? email,
      avatarUrl,
      residency: 'global',
    });
```

`IdentityService` добавить в конструктор `AuthService`.

- [ ] **Шаг 4: тесты проходят**

```bash
pnpm --filter @vedamatch/api test -- auth.service
```

Ожидается: PASS, включая прежние тесты входа.

- [ ] **Шаг 5: проверить вручную, что нынешние пользователи входят**

Поднять локально, войти существующим аккаунтом Google. Ожидается: тот же
профиль, тот же `User.id`, в `UserIdentity` обновился `lastLoginAt`.

- [ ] **Шаг 6: коммит**

```bash
git add apps/api/src/modules/auth/auth.service.ts apps/api/src/modules/auth/auth.service.spec.ts
git commit -m "fix(auth): вход через Google больше не связывает аккаунты по почте"
```

---

### Задача 4: Настройки видимости способов

**Файлы:**
- Изменить: `apps/api/prisma/schema.prisma`
- Создать: `apps/api/src/modules/auth/auth-providers.service.ts`
- Создать: `apps/api/src/modules/auth/auth-providers.service.spec.ts`
- Изменить: `apps/api/src/modules/auth/auth.controller.ts`

**Интерфейсы:**
- Отдаёт: `AuthProvidersService.visibleFor(host: string): Promise<AuthProvider[]>`
  и `AuthProvidersService.assertEnabled(provider: AuthProvider, host: string): Promise<void>`.
- Отдаёт: `GET /auth/providers` → `{ providers: AuthProvider[] }`.

> **Выполнено с поправкой (2026-09-03).** Сверять сырой `req.hostname` с
> `domains` нельзя: в проде API стоит на `api.vedamatch.ru`, а домены в
> настройках записаны в терминах портала (`vedamatch.ru`) — совпадения не было
> бы никогда, и список способов оказался бы пустым на всём проде. Добавлена
> чистая функция `portalHost`, срезающая префикс `api.` и порт; `visibleFor`
> зовёт её первой строкой. Плюс `GET /auth/providers` принимает домен портала
> параметром `?host=` — серверный компонент страницы входа ходит к API по
> внутреннему адресу `http://api:4000`, где хост запроса вообще `api`.
> Подробности — в спецификации, раздел `AuthProviderSetting`.

- [ ] **Шаг 1: модель настроек**

```prisma
model AuthProviderSetting {
  provider  AuthProvider @id
  enabled   Boolean      @default(false)
  domains   String[]     @default([])
  sortOrder Int          @default(0)
  updatedAt DateTime     @updatedAt
}
```

Миграция с начальными значениями: `google` включён на `vedamatch.ru`,
остальные выключены.

```sql
INSERT INTO "AuthProviderSetting" ("provider", "enabled", "domains", "sortOrder")
VALUES
  ('google', true,  ARRAY['vedamatch.ru'], 0),
  ('yandex', false, ARRAY['vedamatch.ru'], 1),
  ('vk',     false, ARRAY['vedamatch.ru'], 2),
  ('email',  false, ARRAY[]::text[],       3);
```

- [ ] **Шаг 2: тест на то, что выключенный способ не пускают**

`apps/api/src/modules/auth/auth-providers.service.spec.ts`:

```ts
import { ForbiddenException } from '@nestjs/common';
import { AuthProvidersService } from './auth-providers.service';

const rows = [
  { provider: 'google', enabled: true, domains: ['vedamatch.ru'], sortOrder: 0 },
  { provider: 'yandex', enabled: false, domains: ['vedamatch.ru'], sortOrder: 1 },
];

function service() {
  const prisma = {
    authProviderSetting: { findMany: jest.fn().mockResolvedValue(rows) },
  } as never;
  return new AuthProvidersService(prisma);
}

describe('AuthProvidersService', () => {
  it('отдаёт только включённые для домена', async () => {
    await expect(service().visibleFor('vedamatch.ru')).resolves.toEqual(['google']);
  });

  it('запрещает вход выключенным способом', async () => {
    await expect(service().assertEnabled('yandex', 'vedamatch.ru')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
```

- [ ] **Шаг 3: убедиться, что падает**

```bash
pnpm --filter @vedamatch/api test -- auth-providers
```

Ожидается: FAIL, модуль не найден.

- [ ] **Шаг 4: написать сервис**

`apps/api/src/modules/auth/auth-providers.service.ts`:

```ts
import { ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthProvider } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuthProvidersService {
  constructor(private readonly prisma: PrismaService) {}

  private async settings() {
    return this.prisma.authProviderSetting.findMany({
      orderBy: { sortOrder: 'asc' },
    });
  }

  async visibleFor(host: string): Promise<AuthProvider[]> {
    const rows = await this.settings();
    return rows
      .filter((row) => row.enabled && row.domains.includes(host))
      .map((row) => row.provider);
  }

  /**
   * Проверяется в каждом обработчике входа, а не только при выдаче списка:
   * спрятанная кнопка не делает способ недоступным, а для 406-ФЗ важно, что
   * вход технически невозможен.
   */
  async assertEnabled(provider: AuthProvider, host: string): Promise<void> {
    const visible = await this.visibleFor(host);
    if (!visible.includes(provider)) {
      throw new ForbiddenException('Этот способ входа недоступен');
    }
  }
}
```

- [ ] **Шаг 5: эндпоинт списка**

В `auth.controller.ts`:

```ts
  @Get('providers')
  providers(@Req() req: Request) {
    return this.providers.visibleFor(req.hostname);
  }
```

- [ ] **Шаг 6: тесты проходят и коммит**

```bash
pnpm --filter @vedamatch/api test -- auth-providers
git add apps/api/prisma apps/api/src/modules/auth
git commit -m "feat(auth): настройки видимости способов входа"
```

---

### Задача 5: Яндекс ID

**Файлы:**
- Создать: `apps/api/src/modules/auth/yandex.provider.ts`
- Создать: `apps/api/src/modules/auth/yandex.provider.spec.ts`
- Изменить: `apps/api/src/modules/auth/auth.controller.ts`

**Интерфейсы:**
- Потребляет: `IdentityService.resolve`, `AuthProvidersService.assertEnabled`.
- Отдаёт: `GET /auth/yandex`, `GET /auth/yandex/callback`.
- Отдаёт: `mapYandexProfile(raw): ProviderProfile` — чистая функция, тестируется
  отдельно от обработчика.

- [ ] **Шаг 1: тест на разбор ответа Яндекса**

`apps/api/src/modules/auth/yandex.provider.spec.ts`:

```ts
import { mapYandexProfile } from './yandex.provider';

const raw = {
  id: '1234567',
  default_email: 'ivan@yandex.ru',
  display_name: 'Иван',
  real_name: 'Иван Петров',
  sex: 'male',
  default_avatar_id: 'abc',
  is_avatar_empty: false,
};

describe('mapYandexProfile', () => {
  it('собирает профиль с адресом аватара', () => {
    expect(mapYandexProfile(raw)).toEqual({
      provider: 'yandex',
      externalId: '1234567',
      email: 'ivan@yandex.ru',
      name: 'Иван Петров',
      avatarUrl: 'https://avatars.yandex.net/get-yapic/abc/islands-200',
      gender: 'male',
      residency: 'ru',
    });
  });

  it('обходится без аватара, когда его нет', () => {
    const profile = mapYandexProfile({ ...raw, is_avatar_empty: true });
    expect(profile.avatarUrl).toBeUndefined();
  });

  it('падает, когда Яндекс не отдал почту', () => {
    expect(() => mapYandexProfile({ ...raw, default_email: undefined })).toThrow(
      /почт/i,
    );
  });
});
```

- [ ] **Шаг 2: убедиться, что падает**

```bash
pnpm --filter @vedamatch/api test -- yandex.provider
```

Ожидается: FAIL, модуль не найден.

- [ ] **Шаг 3: написать разбор и обработчики**

`apps/api/src/modules/auth/yandex.provider.ts`:

```ts
import { BadGatewayException } from '@nestjs/common';
import type { ProviderProfile } from './identity.service';

const AVATAR = 'https://avatars.yandex.net/get-yapic';

type YandexRaw = {
  id: string;
  default_email?: string;
  display_name?: string;
  real_name?: string;
  sex?: string | null;
  default_avatar_id?: string;
  is_avatar_empty?: boolean;
};

export function mapYandexProfile(raw: YandexRaw): ProviderProfile {
  if (!raw.default_email) {
    throw new BadGatewayException('Яндекс не передал адрес почты');
  }

  const avatarUrl =
    raw.default_avatar_id && !raw.is_avatar_empty
      ? `${AVATAR}/${raw.default_avatar_id}/islands-200`
      : undefined;

  const gender = raw.sex === 'male' || raw.sex === 'female' ? raw.sex : undefined;

  return {
    provider: 'yandex',
    externalId: raw.id,
    email: raw.default_email,
    name: raw.real_name ?? raw.display_name ?? raw.default_email,
    avatarUrl,
    gender,
    residency: 'ru',
  };
}

export const YANDEX_AUTHORIZE = 'https://oauth.yandex.ru/authorize';
export const YANDEX_TOKEN = 'https://oauth.yandex.ru/token';
export const YANDEX_INFO = 'https://login.yandex.ru/info?format=json';
```

Обмен кода на токен и запрос профиля — в `auth.service.ts`, рядом с Google.
PKCE обязателен, `code_challenge_method=S256`:

```ts
  async startYandexLogin(req: Request, res: Response, returnTo?: string) {
    await this.providers.assertEnabled('yandex', req.hostname);

    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const state = randomBytes(16).toString('base64url');

    // Тот же приём, что и у Google: состояние уезжает в подписанную httpOnly
    // cookie, а не в память процесса — иначе вход развалится при перезапуске
    // и при нескольких репликах.
    res.cookie(
      'yandex_oidc',
      JSON.stringify({ verifier, state, returnTo }),
      { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600_000 },
    );

    const url = new URL(YANDEX_AUTHORIZE);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', this.config.getOrThrow('YANDEX_CLIENT_ID'));
    url.searchParams.set('redirect_uri', `${this.apiUrl}/auth/yandex/callback`);
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');

    return res.redirect(url.toString());
  }

  async handleYandexCallback(req: Request, res: Response) {
    await this.providers.assertEnabled('yandex', req.hostname);

    const raw = req.cookies?.yandex_oidc;
    if (!raw) throw new BadRequestException('Сессия входа истекла');
    const { verifier, state, returnTo } = JSON.parse(raw);
    res.clearCookie('yandex_oidc');

    if (req.query.state !== state) {
      throw new BadRequestException('Не совпало состояние запроса');
    }

    const tokenRes = await fetch(YANDEX_TOKEN, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: String(req.query.code ?? ''),
        client_id: this.config.getOrThrow('YANDEX_CLIENT_ID'),
        client_secret: this.config.getOrThrow('YANDEX_CLIENT_SECRET'),
        code_verifier: verifier,
      }),
    });

    if (!tokenRes.ok) {
      throw new BadGatewayException('Яндекс не выдал токен');
    }

    const { access_token: accessToken } = (await tokenRes.json()) as {
      access_token: string;
    };

    const infoRes = await fetch(YANDEX_INFO, {
      headers: { authorization: `OAuth ${accessToken}` },
    });

    if (!infoRes.ok) {
      throw new BadGatewayException('Яндекс не отдал профиль');
    }

    const { user } = await this.identities.resolve(
      mapYandexProfile(await infoRes.json()),
    );

    await this.prisma.loginAudit.create({
      data: { userId: user.id, ip: req.ip ?? null },
    });

    return this.issueSessionAndRedirect(res, user, returnTo);
  }
```

`issueSessionAndRedirect` — существующий приём выдачи токенов из Google-колбэка;
если он там встроен в тело метода, вынести его в отдельный приватный метод
первым шагом, чтобы не дублировать.

- [ ] **Шаг 4: маршруты в контроллере**

```ts
  @Get('yandex')
  yandex(
    @Req() req: Request,
    @Res() res: Response,
    @Query('returnTo') returnTo?: string,
  ) {
    return this.auth.startYandexLogin(req, res, returnTo);
  }

  @Get('yandex/callback')
  yandexCallback(@Req() req: Request, @Res() res: Response) {
    return this.auth.handleYandexCallback(req, res);
  }
```

Первым делом внутри обоих — `await this.providers.assertEnabled('yandex', req.hostname)`.

- [ ] **Шаг 5: тесты проходят**

```bash
pnpm --filter @vedamatch/api test -- yandex.provider
```

Ожидается: PASS, три теста.

- [ ] **Шаг 6: проверить живьём**

Включить `yandex` в таблице настроек, открыть `/auth/yandex` локально, пройти
согласие. Ожидается: аккаунт заведён, `dataResidency = ru`, в `UserIdentity`
строка с провайдером `yandex`.

- [ ] **Шаг 7: коммит**

```bash
git add apps/api/src/modules/auth
git commit -m "feat(auth): вход через Яндекс ID"
```

---

### Задача 6: Кнопки на экране входа

**Файлы:**
- Изменить: `apps/web/src/app/login/page.tsx`
- Изменить: `apps/web/src/components/login-card.tsx`
- Тест: `apps/web/src/components/login-card.spec.tsx`

**Интерфейсы:**
- Потребляет: `GET /auth/providers` → массив строк вида `['google', 'yandex']`.

- [ ] **Шаг 1: падающий тест на отрисовку по списку**

`apps/web/src/components/login-card.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { LoginCard } from './login-card';

describe('LoginCard', () => {
  it('рисует кнопку на каждый включённый способ', () => {
    render(<LoginCard providers={['google', 'yandex']} />);

    expect(screen.getByRole('link', { name: /Google/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Яндекс/ })).toBeInTheDocument();
  });

  it('не рисует выключенный способ', () => {
    render(<LoginCard providers={['google']} />);

    expect(screen.queryByRole('link', { name: /Яндекс/ })).not.toBeInTheDocument();
  });
});
```

- [ ] **Шаг 2: убедиться, что падает**

```bash
pnpm --filter @vedamatch/web exec vitest run src/components/login-card.spec.tsx
```

Ожидается: FAIL — компонент не принимает `providers`.

- [ ] **Шаг 3: список приходит с сервера**

`apps/web/src/app/login/page.tsx` — серверный компонент, запрашивает
`/auth/providers` и передаёт массив в `LoginCard`. Порядок из ответа, он задан
в настройках админки. Зашивать список в код нельзя: каждое переключение галочки
требовало бы пересборки фронта.

В `login-card.tsx` — карта провайдеров в подписи и адреса:

```tsx
const PROVIDERS = {
  google: { label: 'Войти через Google', href: '/auth/google' },
  yandex: { label: 'Войти с Яндекс ID', href: '/auth/yandex' },
  vk: { label: 'Войти через VK ID', href: '/auth/vk' },
  email: { label: 'Войти по почте', href: '/auth/email' },
} as const;
```

- [ ] **Шаг 4: тесты проходят**

```bash
pnpm --filter @vedamatch/web exec vitest run src/components/login-card.spec.tsx
```

Ожидается: PASS, два теста.

- [ ] **Шаг 5: оформление**

Только токены из `globals.css`, никаких `#RRGGBB`. Логотипы провайдеров — их
официальные, в `public/`. Контраст подписи на кнопке не ниже 4.5:1, проверить в
светлой и тёмной теме: `--vm-cyan` и `--vm-magenta` мелким текстом не
использовать, у них 3.75:1 и 4.46:1 на светлой.

- [ ] **Шаг 6: проверить в браузере**

Открыть страницу входа при включённом только `google` — одна кнопка. Включить
`yandex` в таблице настроек, обновить страницу — две, без пересборки.

- [ ] **Шаг 4: коммит**

```bash
git add apps/web/src
git commit -m "feat(web): кнопки входа приходят с сервера"
```

---

## Что осталось за пределами этого плана

Второй план: почтовый транспорт, одноразовые коды, экран подтверждения адреса,
VK ID, привязка второго способа в профиле, раздел «Вход» в админке, полоса с
предложением привязать второй способ.

Третий план: российский контур — второй клиент Prisma, слой записи персональных
данных, согласия с версией политики, фоновая досылка копии в амстердамскую базу.

> **Переехало во второй план: `User.dataResidency`.** Спецификация относила
> признак к третьему этапу, но для входа по почте он невосстановим: правило
> смотрит на домен портала, где человек регистрировался, а этого не помнят ни
> адрес, ни `UserIdentity`. Включить почту раньше, чем появится поле, — значит
> потерять признак для всех, кто через неё зашёл. Поле нужно завести вместе с
> почтой и проставлять при создании пользователя. Подробности и правило
> бэкфилла для уже заведённых — в спецификации, раздел `User.dataResidency`.
