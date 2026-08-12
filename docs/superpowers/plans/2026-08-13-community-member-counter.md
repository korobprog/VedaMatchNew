# Community member counter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a real, live count of registered VedaMatch users — with a subtle count-up animation — in the portal welcome header and in place of the hardcoded "10K+" on the guest landing page.

**Architecture:** A new public (no-auth) NestJS endpoint `GET /stats/community` backed by `prisma.user.count()` with a 5-minute in-memory cache in `StatsService`. A single shared React client component `MemberCounter` animates from 0 to a `total` prop using `requestAnimationFrame`, honoring `prefers-reduced-motion`. Both the portal page and the landing page fetch the same stat server-side and pass it down as a prop — no new client-side fetching.

**Tech Stack:** NestJS + Prisma (API), Next.js App Router + React (web), Jest (API tests), Vitest + Testing Library (web tests), pnpm workspaces.

## Global Constraints

- `totalMembers` = `prisma.user.count()` — every registered account, not just Union daters (per approved spec).
- `/stats/community` has **no** `@UseGuards(AuthGuard)` — it must be reachable by logged-out guests on the landing page.
- Cache TTL is exactly 5 minutes (`5 * 60 * 1000` ms).
- Animation: count-up, ease-out cubic, ~1200ms, formatted with `.toLocaleString('ru-RU')`, skipped entirely (final value shown immediately) when `window.matchMedia('(prefers-reduced-motion: reduce)').matches` is `true`.
- No invented/boosted numbers anywhere — always the real count or nothing.
- The two other landing stats ("500+ Совпадений", "98% Довольных") are out of scope — do not touch them.
- After editing `packages/shared/src/index.ts`, the package must be rebuilt (`pnpm --filter @vedamatch/shared build`) before API or web code that imports the new type will type-check or run correctly, since both consume `@vedamatch/shared` via its built `dist/` output, not a source path alias.

---

### Task 1: Shared `CommunityStats` type

**Files:**
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Produces: `export interface CommunityStats { totalMembers: number }`, importable as `import type { CommunityStats } from "@vedamatch/shared";` from both `apps/api` and `apps/web`.

- [ ] **Step 1: Add the type**

Open `packages/shared/src/index.ts` and add this block at the end of the file:

```ts
export interface CommunityStats {
  totalMembers: number;
}
```

- [ ] **Step 2: Build the shared package**

Run: `pnpm --filter @vedamatch/shared build`
Expected: exits 0, `packages/shared/dist/index.d.ts` now contains `CommunityStats`.

Verify with:

Run: `grep -n "CommunityStats" packages/shared/dist/index.d.ts`
Expected: prints the interface declaration line.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/index.ts packages/shared/dist
git commit -m "feat(shared): add CommunityStats type"
```

---

### Task 2: `StatsService` with 5-minute cache

**Files:**
- Create: `apps/api/src/modules/stats/stats.service.ts`
- Test: `apps/api/src/modules/stats/stats.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService` from `apps/api/src/prisma/prisma.service.ts` (constructor-injected, method used: `prisma.user.count(): Promise<number>`).
- Produces: `class StatsService { constructor(prisma: PrismaService); communityStats(): Promise<CommunityStats> }`, importable as `import { StatsService } from './stats.service';` — used by Task 3's controller.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/stats/stats.service.spec.ts`:

```ts
import { PrismaService } from '../../prisma/prisma.service';
import { StatsService } from './stats.service';

describe('StatsService', () => {
  const prisma = {
    user: { count: jest.fn() },
  };
  const service = new StatsService(prisma as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-08-13T00:00:00.000Z'));
    prisma.user.count.mockResolvedValue(42);
  });

  afterEach(() => jest.useRealTimers());

  it('запрашивает счётчик пользователей у Prisma', async () => {
    const result = await service.communityStats();

    expect(result).toEqual({ totalMembers: 42 });
    expect(prisma.user.count).toHaveBeenCalledTimes(1);
  });

  it('отдаёт закэшированное значение повторным вызовам в течение 5 минут', async () => {
    await service.communityStats();
    prisma.user.count.mockResolvedValue(99);

    const result = await service.communityStats();

    expect(result).toEqual({ totalMembers: 42 });
    expect(prisma.user.count).toHaveBeenCalledTimes(1);
  });

  it('перезапрашивает счётчик после истечения TTL', async () => {
    await service.communityStats();
    jest.advanceTimersByTime(5 * 60 * 1000 + 1);
    prisma.user.count.mockResolvedValue(99);

    const result = await service.communityStats();

    expect(result).toEqual({ totalMembers: 99 });
    expect(prisma.user.count).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vedamatch/api test -- stats.service.spec`
Expected: FAIL — `Cannot find module './stats.service'`

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/modules/stats/stats.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import type { CommunityStats } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';

const CACHE_TTL_MS = 5 * 60 * 1000;

/** Публичная сводка по платформе. Кэшируем count(), чтобы гости на
 *  лендинге не грузили базу на каждый заход. */
@Injectable()
export class StatsService {
  private cache: { totalMembers: number; expiresAt: number } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async communityStats(): Promise<CommunityStats> {
    const now = Date.now();
    if (this.cache && this.cache.expiresAt > now) {
      return { totalMembers: this.cache.totalMembers };
    }

    const totalMembers = await this.prisma.user.count();
    this.cache = { totalMembers, expiresAt: now + CACHE_TTL_MS };
    return { totalMembers };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vedamatch/api test -- stats.service.spec`
Expected: PASS — 3 tests passed

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/stats/stats.service.ts apps/api/src/modules/stats/stats.service.spec.ts
git commit -m "feat(api): add StatsService with cached community member count"
```

---

### Task 3: `StatsController` + `StatsModule` wiring

**Files:**
- Create: `apps/api/src/modules/stats/stats.controller.ts`
- Create: `apps/api/src/modules/stats/stats.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/src/modules/stats/stats.controller.spec.ts`

**Interfaces:**
- Consumes: `StatsService.communityStats(): Promise<CommunityStats>` from Task 2.
- Produces: `GET /stats/community` route, publicly reachable (no `@UseGuards`), returning `CommunityStats` JSON.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/stats/stats.controller.spec.ts`:

```ts
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';

describe('StatsController', () => {
  it('делегирует запрос в StatsService.communityStats', async () => {
    const stats = {
      communityStats: jest.fn().mockResolvedValue({ totalMembers: 7 }),
    };
    const controller = new StatsController(
      stats as unknown as StatsService,
    );

    const result = await controller.community();

    expect(result).toEqual({ totalMembers: 7 });
    expect(stats.communityStats).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vedamatch/api test -- stats.controller.spec`
Expected: FAIL — `Cannot find module './stats.controller'`

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/modules/stats/stats.controller.ts`:

```ts
import { Controller, Get } from '@nestjs/common';
import { StatsService } from './stats.service';

/** Единственный намеренно публичный контроллер: без него лендинг для
 *  неавторизованных гостей не может показать живое число участников. */
@Controller('stats')
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get('community')
  community() {
    return this.stats.communityStats();
  }
}
```

Create `apps/api/src/modules/stats/stats.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';

@Module({
  controllers: [StatsController],
  providers: [StatsService],
})
export class StatsModule {}
```

Modify `apps/api/src/app.module.ts`:

Add the import near the other module imports (after the `AstroModule` import on the line that currently reads `import { AstroModule } from './modules/astro/astro.module';`):

```ts
import { AstroModule } from './modules/astro/astro.module';
import { StatsModule } from './modules/stats/stats.module';
```

Add `StatsModule` to the `imports` array, after `AstroModule,`:

```ts
    AstroModule,
    StatsModule,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vedamatch/api test -- stats.controller.spec`
Expected: PASS — 1 test passed

- [ ] **Step 5: Run the full API test suite to confirm nothing else broke**

Run: `pnpm --filter @vedamatch/api test`
Expected: all suites pass

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/stats/stats.controller.ts apps/api/src/modules/stats/stats.module.ts apps/api/src/modules/stats/stats.controller.spec.ts apps/api/src/app.module.ts
git commit -m "feat(api): expose public GET /stats/community endpoint"
```

---

### Task 4: Web API client — `getCommunityStats`

**Files:**
- Modify: `apps/web/src/lib/api.ts`

**Interfaces:**
- Consumes: existing `apiGetPublic<T>(path: string): Promise<T | null>` helper already defined in this file (used the same way by `getBillingPlan`).
- Produces: `export const getCommunityStats: () => Promise<CommunityStats | null>` — used by Task 6 and Task 7.

- [ ] **Step 1: Add the import**

In `apps/web/src/lib/api.ts`, add `CommunityStats` to the existing `import type { ... } from "@vedamatch/shared";` block (alphabetical, matches existing style):

```ts
import type {
  AdminSupportTicketDto,
  AdminSupportTicketListResponse,
  SupportTicketDto,
  SupportTicketListResponse,
  AdminVerificationRequest,
  AdminUserDetail,
  AdminUserListResponse,
  AdminUserReportsResponse,
  AdminBillingModeResponse,
  CommunityStats,
  MentorVerificationPublicRequest,
  DevoteeVerificationStatus,
  PricingPlan,
  SelfIdentificationState,
  ServiceCard,
  StageHistoryItem,
  UserProfile,
} from "@vedamatch/shared";
```

- [ ] **Step 2: Add the function**

Directly below `export const getBillingPlan = () => apiGetPublic<PricingPlan>("/billing/plan");` (line 84), add:

```ts
export const getCommunityStats = () =>
  apiGetPublic<CommunityStats>("/stats/community");
```

- [ ] **Step 3: Type-check**

Run: `pnpm --filter @vedamatch/web exec tsc --noEmit`
Expected: exits 0, no new errors

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/api.ts
git commit -m "feat(web): add getCommunityStats API client"
```

---

### Task 5: `MemberCounter` client component

**Files:**
- Create: `apps/web/src/components/member-counter.tsx`
- Test: `apps/web/src/components/member-counter.spec.tsx`

**Interfaces:**
- Consumes: nothing external — pure presentational component.
- Produces: `export function MemberCounter({ total, className }: { total: number; className?: string }): JSX.Element` — used by Task 6 and Task 7. Renders a `<span>` whose text content is `total.toLocaleString('ru-RU')` once settled.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/components/member-counter.spec.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemberCounter } from "./member-counter";

describe("MemberCounter", () => {
  it("считает вверх до итогового числа и форматирует его по-русски", async () => {
    render(<MemberCounter total={1234} />);

    const expected = (1234).toLocaleString("ru-RU");
    await waitFor(() =>
      expect(screen.getByText(expected)).toBeInTheDocument(),
    );
  });

  it("при prefers-reduced-motion показывает итог сразу, без анимации", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );

    render(<MemberCounter total={500} />);

    expect(
      screen.getByText((500).toLocaleString("ru-RU")),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @vedamatch/web exec vitest run src/components/member-counter.spec.tsx`
Expected: FAIL — `Failed to resolve import "./member-counter"`

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/components/member-counter.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";

const ANIMATION_MS = 1200;

/**
 * Считает от 0 до `total` за ~1.2с при появлении. При
 * prefers-reduced-motion сразу показывает итог, без промежуточных кадров.
 */
export function MemberCounter({
  total,
  className,
}: {
  total: number;
  className?: string;
}) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (prefersReducedMotion) {
      setDisplay(total);
      return;
    }

    let frame: number;
    const start = performance.now();

    function tick(now: number) {
      const progress = Math.min(1, (now - start) / ANIMATION_MS);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * total));
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [total]);

  return <span className={className}>{display.toLocaleString("ru-RU")}</span>;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @vedamatch/web exec vitest run src/components/member-counter.spec.tsx`
Expected: PASS — 2 tests passed

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/member-counter.tsx apps/web/src/components/member-counter.spec.tsx
git commit -m "feat(web): add MemberCounter count-up component"
```

---

### Task 6: Wire into the portal welcome header

**Files:**
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/app/page.spec.tsx`

**Interfaces:**
- Consumes: `getCommunityStats(): Promise<CommunityStats | null>` (Task 4), `MemberCounter` (Task 5).

- [ ] **Step 1: Update the mock and write the failing test**

In `apps/web/src/app/page.spec.tsx`, the `vi.mock("@/lib/api", ...)` factory only lists the exports the test file uses — since `page.tsx` will now call `getCommunityStats`, add it to the factory (otherwise `page.tsx` gets `undefined` for that import at runtime):

```ts
vi.mock("@/lib/api", () => ({
  getProfile: vi.fn(),
  getServices: vi.fn(),
  getBillingPlan: vi.fn().mockResolvedValue(null),
  getCommunityStats: vi.fn().mockResolvedValue(null),
}));
```

Also update the import line at the top of the file to pull in `getCommunityStats` alongside the existing ones:

```ts
import { getCommunityStats, getProfile, getServices } from "@/lib/api";
```

Add a new test at the end of the `describe("Home", ...)` block, right before the closing `});` of the suite:

```tsx
  it("shows the live member count under the welcome message", async () => {
    vi.mocked(getProfile).mockResolvedValue(user);
    vi.mocked(getServices).mockResolvedValue(services);
    vi.mocked(getCommunityStats).mockResolvedValue({ totalMembers: 1234 });

    render(await Home({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("Вместе нас:")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByText((1234).toLocaleString("ru-RU")),
      ).toBeInTheDocument(),
    );
  });

  it("hides the member count line when the stats request fails", async () => {
    vi.mocked(getProfile).mockResolvedValue(user);
    vi.mocked(getServices).mockResolvedValue(services);
    vi.mocked(getCommunityStats).mockResolvedValue(null);

    render(await Home({ searchParams: Promise.resolve({}) }));

    expect(screen.queryByText("Вместе нас:")).not.toBeInTheDocument();
  });
```

Add `waitFor` to the existing `import { render, screen } from "@testing-library/react";` line at the top of the file:

```ts
import { render, screen, waitFor } from "@testing-library/react";
```

- [ ] **Step 2: Run tests to verify the two new ones fail**

Run: `pnpm --filter @vedamatch/web exec vitest run src/app/page.spec.tsx`
Expected: FAIL on the two new tests — `Вместе нас:` not found

- [ ] **Step 3: Wire it into the page**

In `apps/web/src/app/page.tsx`, add the import (alongside the existing component imports, e.g. right after the `ServiceCard` import):

```ts
import { MemberCounter } from "@/components/member-counter";
```

Add `getCommunityStats` to the `@/lib/api` import:

```ts
import { getBillingPlan, getCommunityStats, getProfile, getServices } from "@/lib/api";
```

Extend the `Promise.all` destructure and call list to include the new stats fetch:

```ts
  const [
    user,
    services,
    unionCounts,
    unionChats,
    unionProfile,
    unionRecommendations,
    plan,
    communityStats,
  ] = await Promise.all([
    getProfile(),
    getServices(),
    getUnionConnectionCounts().catch(() => null),
    getUnionChats().catch(() => null),
    getUnionProfileState().catch(() => null),
    getUnionRecommendations({ sort: "new", pageSize: "3" }).catch(() => null),
    getBillingPlan().catch(() => null),
    getCommunityStats().catch(() => null),
  ]);
```

Add the new line under the welcome paragraph:

```tsx
          <p className="text-text-1">
         {user.gender === 'female' ? 'Дорогая' : 'Дорогой'} {user.name}, Вы находитесь на Портале у вас доступ к этим сервисам:
          </p>
          {communityStats && (
            <p className="mt-1 text-sm text-text-2">
              Вместе нас:{" "}
              <MemberCounter
                total={communityStats.totalMembers}
                className="font-semibold text-text-0"
              />
            </p>
          )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @vedamatch/web exec vitest run src/app/page.spec.tsx`
Expected: PASS — all tests passed

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/page.tsx apps/web/src/app/page.spec.tsx
git commit -m "feat(web): show live member count on the portal welcome header"
```

---

### Task 7: Wire into the landing page stats row

**Files:**
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/components/landing/LandingPage.tsx`

**Interfaces:**
- Consumes: `communityStats: CommunityStats | null` (already fetched in Task 6's `Promise.all`), `MemberCounter` (Task 5).

- [ ] **Step 1: Add the prop to `LandingPage`**

In `apps/web/src/components/landing/LandingPage.tsx`, add the import:

```tsx
import { MemberCounter } from "@/components/member-counter";
```

Change the component signature:

```tsx
export function LandingPage({
  returnTo,
  plan,
  totalMembers,
}: {
  returnTo?: string;
  plan?: PricingPlan;
  totalMembers?: number;
}) {
```

Replace the first stat block (currently hardcoded `10K+`):

```tsx
                <div>
                  <div className="font-display text-2xl md:text-3xl font-bold text-text-0">10K+</div>
                  <div className="text-text-2 text-sm">Пользователей</div>
                </div>
```

with:

```tsx
                <div>
                  {totalMembers != null && (
                    <div className="font-display text-2xl md:text-3xl font-bold text-text-0">
                      <MemberCounter total={totalMembers} />
                    </div>
                  )}
                  <div className="text-text-2 text-sm">Пользователей</div>
                </div>
```

- [ ] **Step 2: Pass the prop from `page.tsx`**

In `apps/web/src/app/page.tsx`, update the guest-branch return (the line reading
`return <LandingPage returnTo={returnTo} plan={plan ?? undefined} />;`) to also
pass the count:

```tsx
  if (!user || !services)
    return (
      <LandingPage
        returnTo={returnTo}
        plan={plan ?? undefined}
        totalMembers={communityStats?.totalMembers}
      />
    );
```

Note: this requires `communityStats` (added to the `Promise.all` in Task 6,
Step 3) to already be in scope at this point in the function — it is, since
the `Promise.all` runs before this `if` check.

- [ ] **Step 3: Type-check**

Run: `pnpm --filter @vedamatch/web exec tsc --noEmit`
Expected: exits 0, no new errors

- [ ] **Step 4: Manual verification**

Run: `pnpm --filter @vedamatch/web dev` and `pnpm --filter @vedamatch/api dev` (or use the project's existing dev-server workflow), then open the site logged out.
Expected: the landing page's first stat shows a real animated number instead of "10K+", and the "Пользователей" label stays underneath it.

- [ ] **Step 5: Run the full web test suite to confirm nothing else broke**

Run: `pnpm --filter @vedamatch/web test`
Expected: all suites pass

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/page.tsx apps/web/src/components/landing/LandingPage.tsx
git commit -m "feat(web): replace hardcoded landing member count with live counter"
```
