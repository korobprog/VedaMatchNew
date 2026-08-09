# Union Dashboard Quick-Access Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a compact, glanceable mini-widget inside the "Знакомства" (Union) dashboard card showing unread messages, incoming likes, a preview of fresh matches, and profile completeness — without leaving the dashboard.

**Architecture:** A pure function maps the four existing Union API responses into one small data shape; a presentational component renders that shape as a dense row (chips + avatar strip) plus a thin progress bar; `ServiceCard` gains a generic `extra` slot; `page.tsx` fetches the extra data in its existing `Promise.all` and wires the two together, scoped to the `/union` card only.

**Tech Stack:** Next.js App Router (server component), React, Tailwind CSS, TypeScript, Vitest + Testing Library.

## Global Constraints

- No new backend endpoints — all four data sources already exist (spec: "Out of scope")
- Widget content is never interactive — chips/avatars are not clickable; the card still opens only via the "Открыть" button (spec: "Layout")
- Never show a zero/empty state for any piece — each element (chips, avatars, progress bar) renders only when there's something to report; if all four inputs are empty, the whole widget renders nothing (spec: "Conditional rendering rules")
- Layout is the approved "B" direction: one dense row (chips left, avatar strip right), a thin unlabeled progress bar below it (spec: "Layout")
- Every new external call in `page.tsx` is wrapped in `.catch(() => null)`, exactly like the existing `getUnionConnectionCounts()` call, so one failing call never breaks the page or the other three signals (spec: "Error handling")

---

## File Structure

- Create `apps/web/src/lib/union-quick-access.ts` — pure function turning four raw API responses into the widget's props shape. No React, no fetching — independently unit-testable.
- Create `apps/web/src/lib/union-quick-access.spec.ts` — tests for the above.
- Create `apps/web/src/components/union/union-quick-access-widget.tsx` — presentational component rendering the row + progress bar, or `null`.
- Create `apps/web/src/components/union/union-quick-access-widget.spec.tsx` — tests for the above.
- Modify `apps/web/src/components/service-card.tsx` — add optional `extra?: ReactNode` prop rendered between the description and the button.
- Modify `apps/web/src/components/service-card.spec.tsx` — add a test for the `extra` slot.
- Modify `apps/web/src/app/page.tsx` — fetch the three new data sources, build widget props, pass as `extra` only for the `/union` card.
- Modify `apps/web/src/app/page.spec.tsx` — mock the three new `@/lib/union-api` exports, add tests for widget presence/absence.

---

### Task 1: `buildUnionQuickAccessData` mapping function

**Files:**
- Create: `apps/web/src/lib/union-quick-access.ts`
- Test: `apps/web/src/lib/union-quick-access.spec.ts`

**Interfaces:**
- Consumes: `UnionChatsState`, `UnionConnectionCounts`, `UnionProfileState`, `UnionRecommendationsResponse` from `@vedamatch/shared` (all already defined, all nullable)
- Produces: `UnionQuickAccessData` interface and `buildUnionQuickAccessData(chats, counts, profile, recommendations)` function, both consumed by Task 2 and Task 4:
  ```ts
  export interface UnionQuickAccessData {
    unreadMessages: number;
    incomingLikes: number;
    previewAvatars: { url: string | null; initial: string }[];
    moreCount: number;
    profileCompletionPercent: number | null;
  }
  ```

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/lib/union-quick-access.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildUnionQuickAccessData } from "./union-quick-access";

describe("buildUnionQuickAccessData", () => {
  it("returns all-empty defaults when every source is null", () => {
    const result = buildUnionQuickAccessData(null, null, null, null);

    expect(result).toEqual({
      unreadMessages: 0,
      incomingLikes: 0,
      previewAvatars: [],
      moreCount: 0,
      profileCompletionPercent: null,
    });
  });

  it("reads unread messages from chats and incoming likes from counts", () => {
    const result = buildUnionQuickAccessData(
      { chats: [], unreadTotal: 3 },
      { incomingPending: 2 },
      null,
      null,
    );

    expect(result.unreadMessages).toBe(3);
    expect(result.incomingLikes).toBe(2);
  });

  it("caps preview avatars at 3 and computes the overflow count", () => {
    const recommendations = {
      items: [
        { user: { name: "Ана", avatarUrl: "https://x/a.jpg" } },
        { user: { name: "Борис", avatarUrl: null } },
        { user: { name: "Вера", avatarUrl: "https://x/v.jpg" } },
        { user: { name: "Глеб", avatarUrl: null } },
      ],
      total: 12,
      page: 1,
      pageSize: 3,
      totalPages: 4,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const result = buildUnionQuickAccessData(null, null, null, recommendations);

    expect(result.previewAvatars).toEqual([
      { url: "https://x/a.jpg", initial: "А" },
      { url: null, initial: "Б" },
      { url: "https://x/v.jpg", initial: "В" },
    ]);
    expect(result.moreCount).toBe(9);
  });

  it("hides the overflow count when total fits within the preview", () => {
    const recommendations = {
      items: [{ user: { name: "Ана", avatarUrl: null } }],
      total: 1,
      page: 1,
      pageSize: 3,
      totalPages: 1,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const result = buildUnionQuickAccessData(null, null, null, recommendations);

    expect(result.moreCount).toBe(0);
  });

  it("exposes profile completion percent only when below 100", () => {
    const below = buildUnionQuickAccessData(null, null, {
      profile: null,
      completeness: { percent: 72, items: [], missing: [], next: null },
    }, null);
    const complete = buildUnionQuickAccessData(null, null, {
      profile: null,
      completeness: { percent: 100, items: [], missing: [], next: null },
    }, null);

    expect(below.profileCompletionPercent).toBe(72);
    expect(complete.profileCompletionPercent).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @vedamatch/web test -- src/lib/union-quick-access.spec.ts`
Expected: FAIL — `Cannot find module './union-quick-access'` (file doesn't exist yet)

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/lib/union-quick-access.ts`:

```ts
import type {
  UnionChatsState,
  UnionConnectionCounts,
  UnionProfileState,
  UnionRecommendationsResponse,
} from "@vedamatch/shared";

const MAX_PREVIEW_AVATARS = 3;

export interface UnionQuickAccessData {
  unreadMessages: number;
  incomingLikes: number;
  previewAvatars: { url: string | null; initial: string }[];
  moreCount: number;
  profileCompletionPercent: number | null;
}

/**
 * Maps the four independent Union dashboard signals into one shape for
 * `UnionQuickAccessWidget`. Each input is nullable because every caller in
 * `page.tsx` wraps its fetch in `.catch(() => null)` — one failing/missing
 * source degrades that piece only, never the whole widget.
 */
export function buildUnionQuickAccessData(
  chats: UnionChatsState | null,
  counts: UnionConnectionCounts | null,
  profile: UnionProfileState | null,
  recommendations: UnionRecommendationsResponse | null,
): UnionQuickAccessData {
  const items = recommendations?.items ?? [];
  const total = recommendations?.total ?? 0;
  const shown = items.slice(0, MAX_PREVIEW_AVATARS);
  const percent = profile?.completeness.percent ?? null;

  return {
    unreadMessages: chats?.unreadTotal ?? 0,
    incomingLikes: counts?.incomingPending ?? 0,
    previewAvatars: shown.map((item) => ({
      url: item.user.avatarUrl,
      initial: item.user.name.charAt(0).toUpperCase(),
    })),
    moreCount: Math.max(0, total - shown.length),
    profileCompletionPercent:
      percent !== null && percent < 100 ? percent : null,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @vedamatch/web test -- src/lib/union-quick-access.spec.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/union-quick-access.ts apps/web/src/lib/union-quick-access.spec.ts
git commit -m "feat(union): add pure mapping for the dashboard quick-access widget"
```

---

### Task 2: `UnionQuickAccessWidget` component

**Files:**
- Create: `apps/web/src/components/union/union-quick-access-widget.tsx`
- Test: `apps/web/src/components/union/union-quick-access-widget.spec.tsx`

**Interfaces:**
- Consumes: `UnionQuickAccessData` from `@/lib/union-quick-access` (Task 1)
- Produces: `UnionQuickAccessWidget` component, consumed by Task 4 (`page.tsx`)

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/components/union/union-quick-access-widget.spec.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { UnionQuickAccessData } from "@/lib/union-quick-access";
import { UnionQuickAccessWidget } from "./union-quick-access-widget";

const empty: UnionQuickAccessData = {
  unreadMessages: 0,
  incomingLikes: 0,
  previewAvatars: [],
  moreCount: 0,
  profileCompletionPercent: null,
};

describe("UnionQuickAccessWidget", () => {
  it("renders nothing when there is no data to show", () => {
    const { container } = render(<UnionQuickAccessWidget {...empty} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("shows only the messages chip when only messages are unread", () => {
    render(<UnionQuickAccessWidget {...empty} unreadMessages={3} />);

    expect(screen.getByText("💬 3")).toBeInTheDocument();
    expect(screen.queryByText(/❤️/)).not.toBeInTheDocument();
  });

  it("shows only the likes chip when only likes are pending", () => {
    render(<UnionQuickAccessWidget {...empty} incomingLikes={2} />);

    expect(screen.getByText("❤️ 2")).toBeInTheDocument();
    expect(screen.queryByText(/💬/)).not.toBeInTheDocument();
  });

  it("renders preview avatars with an overflow count", () => {
    render(
      <UnionQuickAccessWidget
        {...empty}
        previewAvatars={[
          { url: null, initial: "А" },
          { url: "https://x/b.jpg", initial: "Б" },
        ]}
        moreCount={9}
      />,
    );

    expect(screen.getByText("А")).toBeInTheDocument();
    expect(screen.getByText("+9")).toBeInTheDocument();
  });

  it("hides the overflow label when moreCount is 0", () => {
    render(
      <UnionQuickAccessWidget
        {...empty}
        previewAvatars={[{ url: null, initial: "А" }]}
        moreCount={0}
      />,
    );

    expect(screen.queryByText(/^\+/)).not.toBeInTheDocument();
  });

  it("shows the progress bar with the right value when below 100%", () => {
    render(
      <UnionQuickAccessWidget {...empty} profileCompletionPercent={72} />,
    );

    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "72",
    );
  });

  it("hides the progress bar when profileCompletionPercent is null", () => {
    render(<UnionQuickAccessWidget {...empty} />);

    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @vedamatch/web test -- src/components/union/union-quick-access-widget.spec.tsx`
Expected: FAIL — `Cannot find module './union-quick-access-widget'`

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/components/union/union-quick-access-widget.tsx`:

```tsx
import type { UnionQuickAccessData } from "@/lib/union-quick-access";

export function UnionQuickAccessWidget({
  unreadMessages,
  incomingLikes,
  previewAvatars,
  moreCount,
  profileCompletionPercent,
}: UnionQuickAccessData) {
  const hasChips = unreadMessages > 0 || incomingLikes > 0;
  const hasAvatars = previewAvatars.length > 0;
  const hasProgress = profileCompletionPercent !== null;

  if (!hasChips && !hasAvatars && !hasProgress) return null;

  return (
    <div className="mb-4 space-y-2">
      {(hasChips || hasAvatars) && (
        <div className="flex flex-wrap items-center gap-2">
          {unreadMessages > 0 && (
            <span className="inline-flex items-center rounded-full bg-glass px-2.5 py-1 text-xs font-semibold text-text-1">
              💬 {unreadMessages}
            </span>
          )}
          {incomingLikes > 0 && (
            <span className="inline-flex items-center rounded-full bg-glass px-2.5 py-1 text-xs font-semibold text-text-1">
              ❤️ {incomingLikes}
            </span>
          )}
          {hasAvatars && (
            <div className="ml-auto flex items-center">
              {previewAvatars.map((avatar, index) => (
                <span
                  key={index}
                  className="-ml-2 flex h-6 w-6 items-center justify-center rounded-full border-2 border-bg-0 bg-glass text-[10px] font-semibold text-text-1 first:ml-0"
                  style={
                    avatar.url
                      ? {
                          backgroundImage: `url(${avatar.url})`,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                        }
                      : undefined
                  }
                >
                  {avatar.url ? null : avatar.initial}
                </span>
              ))}
              {moreCount > 0 && (
                <span className="ml-1.5 text-[11px] text-text-2">
                  +{moreCount}
                </span>
              )}
            </div>
          )}
        </div>
      )}
      {hasProgress && (
        <div
          role="progressbar"
          aria-label="Заполненность анкеты Union"
          aria-valuenow={profileCompletionPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-1.5 w-full overflow-hidden rounded-full bg-glass"
        >
          <div
            className="h-full rounded-full bg-[linear-gradient(to_right,#33CCCC,#5CCCCC)]"
            style={{ width: `${profileCompletionPercent}%` }}
          />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @vedamatch/web test -- src/components/union/union-quick-access-widget.spec.tsx`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/union/union-quick-access-widget.tsx apps/web/src/components/union/union-quick-access-widget.spec.tsx
git commit -m "feat(union): add UnionQuickAccessWidget presentational component"
```

---

### Task 3: `extra` slot on `ServiceCard`

**Files:**
- Modify: `apps/web/src/components/service-card.tsx:1-10` (props) and `:47-50` (render location, between description and button)
- Modify: `apps/web/src/components/service-card.spec.tsx`

**Interfaces:**
- Consumes: nothing new
- Produces: `ServiceCard` now accepts `extra?: ReactNode`, consumed by Task 4 (`page.tsx`)

- [ ] **Step 1: Write the failing test**

Add to `apps/web/src/components/service-card.spec.tsx` (after the existing two tests, inside the same `describe` block):

```tsx
  it("renders extra content between the description and the button", () => {
    render(
      <ServiceCard
        service={service}
        extra={<div data-testid="quick-access">widget</div>}
      />,
    );

    expect(screen.getByTestId("quick-access")).toBeInTheDocument();
  });

  it("renders no extra content when the prop is omitted", () => {
    render(<ServiceCard service={service} />);

    expect(screen.queryByTestId("quick-access")).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @vedamatch/web test -- src/components/service-card.spec.tsx`
Expected: FAIL — TypeScript error / `extra` not rendered (element not found)

- [ ] **Step 3: Write the implementation**

In `apps/web/src/components/service-card.tsx`, update the imports and props (lines 1-10):

```tsx
import type { ReactNode } from "react";
import type { ServiceCard as ServiceCardType } from "@vedamatch/shared";
import { ServiceIcon } from "@/components/icons/service-icons";

export function ServiceCard({
  service,
  badgeCount,
  extra,
}: {
  service: ServiceCardType;
  badgeCount?: number;
  extra?: ReactNode;
}) {
```

Then insert `{extra}` right after the description paragraph and before the `comingSoon` conditional (replace lines 48-50):

```tsx
      <p className="mb-6 flex-1 text-sm text-text-1">
        {service.description}
      </p>
      {extra}
      {comingSoon ? (
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @vedamatch/web test -- src/components/service-card.spec.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/service-card.tsx apps/web/src/components/service-card.spec.tsx
git commit -m "feat(service-card): add optional extra content slot"
```

---

### Task 4: Wire the widget into the dashboard

**Files:**
- Modify: `apps/web/src/app/page.tsx` (entire file — small, shown in full below)
- Modify: `apps/web/src/app/page.spec.tsx`

**Interfaces:**
- Consumes: `buildUnionQuickAccessData` (Task 1), `UnionQuickAccessWidget` (Task 2), `ServiceCard`'s `extra` prop (Task 3), and the existing `getUnionChats`, `getUnionProfileState`, `getUnionRecommendations` exports from `@/lib/union-api`
- Produces: nothing consumed elsewhere — this is the top-level wiring

- [ ] **Step 1: Write the failing tests**

Replace the mock setup and add tests in `apps/web/src/app/page.spec.tsx`. Full new file:

```tsx
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ServiceCard as ServiceCardType, UserProfile } from "@vedamatch/shared";
import Home from "./page";
import { getProfile, getServices } from "@/lib/api";
import {
  getUnionChats,
  getUnionConnectionCounts,
  getUnionProfileState,
  getUnionRecommendations,
} from "@/lib/union-api";

vi.mock("@/lib/api", () => ({
  getProfile: vi.fn(),
  getServices: vi.fn(),
}));

vi.mock("@/lib/union-api", () => ({
  getUnionConnectionCounts: vi.fn(),
  getUnionChats: vi.fn(),
  getUnionProfileState: vi.fn(),
  getUnionRecommendations: vi.fn(),
}));

vi.mock("@/components/landing", () => ({
  LandingPage: ({ returnTo }: { returnTo?: string }) => (
    <div data-testid="landing" data-return-to={returnTo} />
  ),
}));

const user: UserProfile = {
  id: "user-1",
  email: "radha@example.com",
  name: "Радха",
  avatarUrl: null,
  avatarKey: null,
  homeLocation: null,
  socialLinks: {},
  messengers: {},
  role: "user",
  gender: "female",
  spiritualStage: "seeker",
  devoteeVerificationStatus: null,
  birthDate: null,
  age: null,
  photoVerification: { status: "none", requestedAt: null, verifiedAt: null },
  lastSelfIdentificationAt: null,
  subscription: {
    status: "trial",
    trialEndsAt: "2026-08-27T00:00:00.000Z",
    paidUntil: null,
    accessUntil: "2026-08-27T00:00:00.000Z",
    daysLeft: 30,
    note: null,
  },
};

const services: ServiceCardType[] = [
  {
    id: "union",
    slug: "union",
    name: "Знакомства",
    description: "Осознанные знакомства и сотрудничество",
    iconUrl: null,
    url: "/union",
    status: "active",
    category: "community",
    requiresDevoteeVerification: false,
  },
];

describe("Home", () => {
  beforeEach(() => {
    vi.mocked(getProfile).mockResolvedValue(null);
    vi.mocked(getServices).mockResolvedValue(null);
    vi.mocked(getUnionConnectionCounts).mockResolvedValue(null);
    vi.mocked(getUnionChats).mockResolvedValue(null);
    vi.mocked(getUnionProfileState).mockResolvedValue(null);
    vi.mocked(getUnionRecommendations).mockResolvedValue(null);
  });

  it("renders the landing page for a guest", async () => {
    render(await Home({ searchParams: Promise.resolve({}) }));

    expect(screen.getByTestId("landing")).toBeInTheDocument();
  });

  it("passes the original destination to session restoration", async () => {
    render(
      await Home({
        searchParams: Promise.resolve({ returnTo: "/union?tab=matches" }),
      }),
    );

    expect(screen.getByTestId("landing")).toHaveAttribute(
      "data-return-to",
      "/union?tab=matches",
    );
  });

  it("shows quick-access chips on the Union card when there is activity", async () => {
    vi.mocked(getProfile).mockResolvedValue(user);
    vi.mocked(getServices).mockResolvedValue(services);
    vi.mocked(getUnionConnectionCounts).mockResolvedValue({ incomingPending: 2 });
    vi.mocked(getUnionChats).mockResolvedValue({ chats: [], unreadTotal: 3 });

    render(await Home({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("💬 3")).toBeInTheDocument();
    expect(screen.getByText("❤️ 2")).toBeInTheDocument();
  });

  it("hides the quick-access widget when there is nothing to show", async () => {
    vi.mocked(getProfile).mockResolvedValue(user);
    vi.mocked(getServices).mockResolvedValue(services);

    render(await Home({ searchParams: Promise.resolve({}) }));

    expect(screen.queryByText(/💬/)).not.toBeInTheDocument();
    expect(screen.queryByText(/❤️/)).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `pnpm --filter @vedamatch/web test -- src/app/page.spec.tsx`
Expected: The two new tests FAIL (chips not rendered yet — `page.tsx` doesn't fetch or pass the data yet); the two pre-existing tests still PASS.

- [ ] **Step 3: Write the implementation**

Replace `apps/web/src/app/page.tsx` in full:

```tsx
import { redirect } from "next/navigation";
import { getProfile, getServices } from "@/lib/api";
import { Header } from "@/components/header";
import { ServiceCard } from "@/components/service-card";
import {
  getUnionChats,
  getUnionConnectionCounts,
  getUnionProfileState,
  getUnionRecommendations,
} from "@/lib/union-api";
import { buildUnionQuickAccessData } from "@/lib/union-quick-access";
import { UnionQuickAccessWidget } from "@/components/union/union-quick-access-widget";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";
import { LandingPage } from "@/components/landing";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const { returnTo: rawReturnTo } = await searchParams;
  const returnTo = Array.isArray(rawReturnTo) ? rawReturnTo[0] : rawReturnTo;
  const [
    user,
    services,
    unionCounts,
    unionChats,
    unionProfile,
    unionRecommendations,
  ] = await Promise.all([
    getProfile(),
    getServices(),
    getUnionConnectionCounts().catch(() => null),
    getUnionChats().catch(() => null),
    getUnionProfileState().catch(() => null),
    getUnionRecommendations({ sort: "new", pageSize: "3" }).catch(() => null),
  ]);
  if (!user || !services) return <LandingPage returnTo={returnTo} />;
  if (!user.spiritualStage) redirect("/self-identification");

  const unionQuickAccess = buildUnionQuickAccessData(
    unionChats,
    unionCounts,
    unionProfile,
    unionRecommendations,
  );

  return (
    <div className="relative min-h-screen bg-bg-0">
      <BackgroundOrbs />
      <NoiseOverlay />
      <Header user={user} />
      <main className="mx-auto max-w-6xl px-4 py-8 pb-24">
        <section className="mb-10">
          <h1 className="mb-2 font-display text-2xl font-bold text-text-0 sm:text-3xl">
            Добро пожаловать в VedaMatch
          </h1>
          <p className="text-text-1">
         {user.gender === 'female' ? 'Дорогая' : 'Дорогой'} {user.name}, Вы находитесь на Портале у вас доступ к этим сервисам:
          </p>
        </section>
        <section className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((service) => (
            <ServiceCard
              key={service.id}
              service={service}
              badgeCount={
                service.url === "/union"
                  ? unionCounts?.incomingPending
                  : undefined
              }
              extra={
                service.url === "/union" ? (
                  <UnionQuickAccessWidget {...unionQuickAccess} />
                ) : undefined
              }
            />
          ))}
        </section>
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @vedamatch/web test -- src/app/page.spec.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Run the full web test suite to check for regressions**

Run: `pnpm --filter @vedamatch/web test`
Expected: PASS (no regressions in other suites)

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/page.tsx apps/web/src/app/page.spec.tsx
git commit -m "feat(union): wire the quick-access widget into the dashboard"
```

---

### Task 5: Manual verification in the browser

**Files:** none (verification only)

**Interfaces:** none

- [ ] **Step 1: Start the API and web dev servers**

Use the project's preview tooling to start both `api` and `web` from `.claude/launch.json` (or `pnpm --filter @vedamatch/api dev` and `pnpm --filter @vedamatch/web dev` in two terminals).

- [ ] **Step 2: Log in as a demo user with Union activity**

At `/login`, use the dev quick-login buttons (e.g. "Радха"), password `vedamatch`. If the seeded demo account has no pending likes/unread messages/recommendations yet, that's expected — the widget should simply not render for that account (verifies the "hide everything" branch).

- [ ] **Step 3: Verify the empty-state branch**

On the dashboard (`/`), confirm the "Знакомства" card looks exactly as it did before this change when the logged-in user has no Union activity, no pending profile fields under 100%, and no fresh recommendations.

- [ ] **Step 4: Verify the populated branch**

Using two demo accounts (e.g. Радха and Говинда) with an accepted connection and an unread message between them (create one directly via Prisma if no UI path exists yet, following the same pattern used earlier in this project's chat feature verification), confirm on the dashboard:
- The 💬 chip shows the correct unread count
- The ❤️ chip shows the correct incoming-likes count when a third demo account sends a like
- The avatar strip shows up to 3 avatars plus a correct "+N" when more than 3 recommendations exist
- The progress bar shows the right width for an account with an incomplete Union profile, and is absent for one with a complete profile

- [ ] **Step 5: Check both themes**

Toggle light/dark theme and confirm the chips, avatars, and progress bar remain legible in both.

- [ ] **Step 6: Report results**

Summarize what was verified (or any discrepancy found) back to the user; fix and re-verify if anything doesn't match the approved design.
