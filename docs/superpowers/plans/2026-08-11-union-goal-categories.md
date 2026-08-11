# Union Goal Categories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make goal selection a set of checkboxes by default with the percentage sliders behind an opt-in toggle, and replace the single-goal filter dropdown with multi-select chips that each carry a live profile count.

**Architecture:** The stored model does not change — four intention weights summing to 100. Checkboxes are an input method that produces an even split. On the read side, goal filtering moves to the end of the in-memory recommendation pipeline so the list just before it yields the chip counts for free.

**Tech Stack:** NestJS + Prisma (`apps/api`), Next.js App Router + React (`apps/web`), shared types in `packages/shared`, Jest on the API, Vitest + Testing Library on the web.

**Spec:** `docs/superpowers/specs/2026-08-11-union-goal-categories-design.md`

## Global Constraints

- Goal order everywhere is the declaration order of `intentionLabels`: `family`, `business`, `friendship`, `service`. Even splits distribute the remainder in that order (3 goals → 34/33/33).
- Weights stay integers summing to exactly 100. The server-side validation at `apps/api/src/modules/union/union-profile.service.ts:902` is not relaxed.
- `UnionMatchingService` is not touched.
- The legacy `intention` query parameter keeps working as a one-element `intentions` list.
- Russian user-facing copy, Russian code comments explaining *why*, matching the surrounding files.
- Web tests: `cd apps/web && npx vitest run <path>`. API tests: `cd apps/api && npx jest <path>`.

---

### Task 1: Shared contract for multi-goal filtering and counts

**Files:**
- Modify: `packages/shared/src/union.ts:337-366` (`UnionRecommendationFilters`), and `UnionRecommendationsResponse` in the same file

**Interfaces:**
- Consumes: `UnionIntentionType` (already exported)
- Produces:
  - `UnionIntentionCounts = Record<UnionIntentionType, number> & { all: number }`
  - `UnionRecommendationFilters.intentions?: UnionIntentionType[]`
  - `UnionRecommendationFilters.intention?: UnionIntentionType` (kept, marked legacy)
  - `UnionRecommendationsResponse.intentionCounts: UnionIntentionCounts`

- [ ] **Step 1: Add the counts type and widen the filter**

In `packages/shared/src/union.ts`, replace the `intention` line inside `UnionRecommendationFilters`:

```ts
  /** @deprecated Одна цель. Оставлено ради сохранённых ссылок на выдачу. */
  intention?: UnionIntentionType;
  /** Цели через ИЛИ: анкета проходит, если несёт хотя бы одну из них. */
  intentions?: UnionIntentionType[];
```

Directly above `UnionRecommendationsResponse`, add:

```ts
/**
 * Сколько анкет вернулось бы по каждой цели при тех же остальных фильтрах.
 * `all` — размер выдачи без фильтра целей. Анкета с тремя целями попадает в
 * три счётчика, поэтому сумма по целям больше `all` — это верно для ИЛИ.
 */
export type UnionIntentionCounts = Record<UnionIntentionType, number> & {
  all: number;
};
```

And add the field to `UnionRecommendationsResponse`:

```ts
  intentionCounts: UnionIntentionCounts;
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json`
Expected: errors only in `union-profile.service.ts` (the response now misses `intentionCounts`) and the pre-existing failures in `src/modules/motivation/*.spec.ts`. The motivation errors exist on `main` — ignore them, do not fix them here.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/union.ts
git commit -m "feat(union): multi-goal filter and goal counts in the recommendations contract"
```

---

### Task 2: Count goals and filter by several of them

Goal filtering moves out of `matchesFilters` to the end of the pipeline. Everything before it — location, swipes, blocks, city, age, gender, `minScore` — still applies, so the counts answer exactly "what will I see if I click this chip".

**Files:**
- Modify: `apps/api/src/modules/union/union-profile.service.ts` (`normalizeFilters`, `matchesFilters`, `getRecommendations`)
- Test: `apps/api/src/modules/union/union-profile.service.spec.ts`

**Interfaces:**
- Consumes: `UnionIntentionCounts`, `UnionRecommendationFilters.intentions` from Task 1
- Produces: `getRecommendations` returns `intentionCounts`; `normalizeFilters` emits `intentions?: UnionIntentionType[]` and no longer emits `intention`

- [ ] **Step 1: Write the failing tests**

Append inside the existing `describe('UnionProfileService', ...)` in `apps/api/src/modules/union/union-profile.service.spec.ts`:

```ts
  it('counts profiles per goal ignoring the goal filter but honouring the others', async () => {
    prisma.unionProfile.findUnique.mockResolvedValue(profile('me'));
    prisma.unionProfile.findMany.mockResolvedValue([
      withIntentions(profile('a'), [
        { type: 'family', weight: 50 },
        { type: 'service', weight: 50 },
      ]),
      withIntentions(profile('b'), [{ type: 'family', weight: 100 }]),
      withIntentions(profile('c'), [{ type: 'business', weight: 100 }]),
    ]);
    prisma.unionConnectionRequest.findMany.mockResolvedValue([]);

    const result = await service.getRecommendations('me', {
      intentions: ['business'],
    });

    expect(result.items.map((item) => item.user.id)).toEqual(['c']);
    // Счётчики не зависят от выбранной цели: они отвечают на вопрос
    // «сколько будет, если нажать вот сюда».
    expect(result.intentionCounts).toEqual({
      all: 3,
      family: 2,
      business: 1,
      friendship: 0,
      service: 1,
    });
  });

  it('drops profiles excluded by another filter from the goal counts', async () => {
    prisma.unionProfile.findUnique.mockResolvedValue(profile('me'));
    prisma.unionProfile.findMany.mockResolvedValue([
      withIntentions(profile('near'), [{ type: 'family', weight: 100 }]),
      withIntentions(
        profile('far', { homeLocation: { ...defaultLocation, city: 'Казань' } }),
        [{ type: 'family', weight: 100 }],
      ),
    ]);
    prisma.unionConnectionRequest.findMany.mockResolvedValue([]);

    const result = await service.getRecommendations('me', { city: 'Москва' });

    expect(result.intentionCounts.all).toBe(1);
    expect(result.intentionCounts.family).toBe(1);
  });

  it('treats several goals as OR', async () => {
    prisma.unionProfile.findUnique.mockResolvedValue(profile('me'));
    prisma.unionProfile.findMany.mockResolvedValue([
      withIntentions(profile('a'), [{ type: 'family', weight: 100 }]),
      withIntentions(profile('b'), [{ type: 'business', weight: 100 }]),
      withIntentions(profile('c'), [{ type: 'service', weight: 100 }]),
    ]);
    prisma.unionConnectionRequest.findMany.mockResolvedValue([]);

    const result = await service.getRecommendations('me', {
      intentions: ['family', 'service'],
    });

    expect(result.items.map((item) => item.user.id).sort()).toEqual(['a', 'c']);
  });

  it('still filters by the legacy single intention parameter', async () => {
    prisma.unionProfile.findUnique.mockResolvedValue(profile('me'));
    prisma.unionProfile.findMany.mockResolvedValue([
      withIntentions(profile('a'), [{ type: 'family', weight: 100 }]),
      withIntentions(profile('b'), [{ type: 'business', weight: 100 }]),
    ]);
    prisma.unionConnectionRequest.findMany.mockResolvedValue([]);

    const result = await service.getRecommendations('me', {
      intention: 'business',
    });

    expect(result.items.map((item) => item.user.id)).toEqual(['b']);
  });

  it('ignores an unknown goal instead of emptying the deck', async () => {
    prisma.unionProfile.findUnique.mockResolvedValue(profile('me'));
    prisma.unionProfile.findMany.mockResolvedValue([profile('a')]);
    prisma.unionConnectionRequest.findMany.mockResolvedValue([]);

    const result = await service.getRecommendations('me', {
      intentions: ['nonsense'] as never,
    });

    expect(result.items.map((item) => item.user.id)).toEqual(['a']);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && npx jest src/modules/union/union-profile.service.spec.ts -t "goal"`
Expected: FAIL — `result.intentionCounts` is `undefined`.

- [ ] **Step 3: Normalize the goal list**

In `apps/api/src/modules/union/union-profile.service.ts`, inside `normalizeFilters`, replace the `intention:` entry with:

```ts
      intentions: normalizeIntentions(filters),
```

Add this module-level helper next to the other `clamp*` helpers at the bottom of the file:

```ts
/** Принимает и новый список целей, и старый одиночный параметр из
 *  сохранённых ссылок. Пустой список — то же самое, что фильтра нет. */
function normalizeIntentions(
  filters: UnionRecommendationFilters,
): UnionIntentionType[] | undefined {
  const raw = Array.isArray(filters.intentions)
    ? filters.intentions
    : filters.intention
      ? [filters.intention]
      : [];
  const valid = INTENTION_TYPES.filter((type) => raw.includes(type));
  return valid.length > 0 ? valid : undefined;
}
```

- [ ] **Step 4: Stop filtering by goal inside matchesFilters**

Delete this block from `matchesFilters` (currently the first check in the method):

```ts
    if (
      filters.intention &&
      !profile.intentions.some((i) => i.type === filters.intention)
    ) {
      return false;
    }
```

- [ ] **Step 5: Count, then filter, in getRecommendations**

In `getRecommendations`, the existing chain ends with `.filter(({ recommendation }) => normalizedFilters.minScore == null || ...)` followed by `.sort(...)`. Split the chain at that point. Name the result of everything up to and including the `minScore` filter `beforeIntentions`, then insert between it and the sort:

```ts
    // Счётчики берём до фильтра целей и после всех остальных: чип должен
    // обещать ровно то, что человек увидит, нажав на него.
    const intentionCounts = countIntentions(
      beforeIntentions.map(({ other }) => other),
    );
    const selectedIntentions = normalizedFilters.intentions;
    const recommendations = (
      selectedIntentions
        ? beforeIntentions.filter(({ other }) =>
            other.intentions.some((i) =>
              selectedIntentions.includes(i.type as UnionIntentionType),
            ),
          )
        : beforeIntentions
    ).sort((a, b) => {
```

Keep the body of the existing `.sort(...)` callback unchanged.

Add `intentionCounts` to the returned object, after `totalPages`:

```ts
      totalPages,
      intentionCounts,
```

Add the counting helper as a private method next to `matchesFilters`:

```ts
  /** Анкета с несколькими целями попадает в каждый счётчик: чипы работают
   *  как ИЛИ, поэтому сумма по целям законно больше `all`. */
  private countIntentions(
    profiles: ProfileWithIntentions[],
  ): UnionIntentionCounts {
    const counts: UnionIntentionCounts = {
      all: profiles.length,
      family: 0,
      business: 0,
      friendship: 0,
      service: 0,
    };
    for (const profile of profiles) {
      for (const type of new Set(profile.intentions.map((i) => i.type))) {
        counts[type as UnionIntentionType] += 1;
      }
    }
    return counts;
  }
```

Add `UnionIntentionCounts` to the `@vedamatch/shared` type import at the top of the file.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd apps/api && npx jest src/modules/union/union-profile.service.spec.ts`
Expected: PASS, all tests in the file including the five new ones.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/union/union-profile.service.ts apps/api/src/modules/union/union-profile.service.spec.ts
git commit -m "feat(union): filter recommendations by several goals and count each one"
```

---

### Task 3: Accept repeated goal parameters in the controller

`@Query()` hands back a string for `?intentions=family` and an array for `?intentions=family&intentions=business`. `toFilters` currently types every value as `string | undefined`, so the array case would silently reach `normalizeIntentions` as a non-array.

**Files:**
- Modify: `apps/api/src/modules/union/union-recommendations.controller.ts`
- Test: `apps/api/src/modules/union/union-recommendations.controller.spec.ts` (create)

**Interfaces:**
- Consumes: `normalizeIntentions` behaviour from Task 2 (the controller only shapes the input)
- Produces: `toFilters` maps `intentions` to `UnionIntentionType[]`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/union/union-recommendations.controller.spec.ts`:

```ts
import { UnionRecommendationsController } from './union-recommendations.controller';
import type { UnionProfileService } from './union-profile.service';

describe('UnionRecommendationsController', () => {
  const getRecommendations = jest.fn().mockResolvedValue({ items: [] });
  const controller = new UnionRecommendationsController({
    getRecommendations,
  } as unknown as UnionProfileService);
  const user = { sub: 'me' } as never;

  beforeEach(() => getRecommendations.mockClear());

  it('passes a single repeated goal as a one-element list', async () => {
    await controller.recommendations(user, { intentions: 'family' });

    expect(getRecommendations).toHaveBeenCalledWith(
      'me',
      expect.objectContaining({ intentions: ['family'] }),
    );
  });

  it('keeps every value when the goal parameter repeats', async () => {
    await controller.recommendations(user, {
      intentions: ['family', 'service'],
    });

    expect(getRecommendations).toHaveBeenCalledWith(
      'me',
      expect.objectContaining({ intentions: ['family', 'service'] }),
    );
  });

  it('takes the first value of a repeated scalar parameter', async () => {
    await controller.recommendations(user, { city: ['Москва', 'Казань'] });

    expect(getRecommendations).toHaveBeenCalledWith(
      'me',
      expect.objectContaining({ city: 'Москва' }),
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && npx jest src/modules/union/union-recommendations.controller.spec.ts`
Expected: FAIL — TypeScript rejects the array argument, and `intentions` arrives unshaped.

- [ ] **Step 3: Widen the query type**

In `apps/api/src/modules/union/union-recommendations.controller.ts`, change the query type in both the handler and `toFilters` from `Record<string, string | undefined>` to `QueryParams`, and add at the bottom of the file:

```ts
type QueryParams = Record<string, string | string[] | undefined>;

/** Повторяющийся параметр приходит массивом; для всего, кроме целей,
 *  осмысленно только первое значение. */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function toIntentions(
  value: string | string[] | undefined,
): UnionRecommendationFilters['intentions'] {
  if (value == null) return undefined;
  const list = Array.isArray(value) ? value : [value];
  return list as UnionRecommendationFilters['intentions'];
}
```

Inside `toFilters`, replace the `intention` line with:

```ts
    intention: first(query.intention) as UnionRecommendationFilters['intention'],
    intentions: toIntentions(query.intentions),
```

and wrap every other `query.x` in `first(...)`: `city`, `country`, `stage`, `gender`, `format`, `language`, `diet`, `childrenStatus`, `sort`, and the `verifiedOnly` / `photoVerifiedOnly` comparisons. `toNumber` calls become `toNumber(first(query.lat))` and so on.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/api && npx jest src/modules/union/union-recommendations.controller.spec.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/union/union-recommendations.controller.ts apps/api/src/modules/union/union-recommendations.controller.spec.ts
git commit -m "feat(union): read repeated goal parameters from the recommendations query"
```

---

### Task 4: Carry every selected goal through the web query helpers

Two helpers rebuild the query string keeping only the first value of each parameter. Left alone, they would drop all goals but one — `toQueryString` on the way to the API, `withPage` on the way to page 2.

**Files:**
- Modify: `apps/web/src/lib/union-api.ts:53-60` (`toQueryString`)
- Modify: `apps/web/src/app/union/recommendations/page.tsx:127-138` (`withPage`)
- Test: `apps/web/src/lib/union-api.spec.ts` (create)

**Interfaces:**
- Produces: both helpers emit one query entry per array element; `withPage` is exported for its test

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/union-api.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import { toQueryString } from "./union-api";

describe("toQueryString", () => {
  it("repeats a parameter given several values", () => {
    expect(toQueryString({ intentions: ["family", "service"] })).toBe(
      "?intentions=family&intentions=service",
    );
  });

  it("keeps a single value as it was", () => {
    expect(toQueryString({ city: "Москва" })).toBe(
      `?city=${encodeURIComponent("Москва")}`,
    );
  });

  it("returns an empty string without parameters", () => {
    expect(toQueryString({})).toBe("");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx vitest run src/lib/union-api.spec.ts`
Expected: FAIL — `toQueryString` is not exported, and the array collapses to one value.

- [ ] **Step 3: Append instead of set**

In `apps/web/src/lib/union-api.ts`, export the helper and iterate the values:

```ts
export function toQueryString(
  params?: Record<string, string | string[] | undefined>,
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    // Цели приходят повторяющимся параметром: `set` оставил бы одну.
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item) query.append(key, item);
    }
  }
  const text = query.toString();
```

Keep the rest of the function body unchanged.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run src/lib/union-api.spec.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Write the failing pagination test**

Create `apps/web/src/app/union/recommendations/page.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import { withPage } from "./page";

describe("withPage", () => {
  it("keeps every selected goal when turning the page", () => {
    const query = withPage({ intentions: ["family", "service"] }, 2);

    expect(query).toContain("intentions=family");
    expect(query).toContain("intentions=service");
    expect(query).toContain("page=2");
  });

  it("replaces the previous page number", () => {
    expect(withPage({ page: "3", city: "Москва" }, 4)).toContain("page=4");
    expect(withPage({ page: "3" }, 4)).not.toContain("page=3");
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `cd apps/web && npx vitest run src/app/union/recommendations/page.spec.ts`
Expected: FAIL — `withPage` is not exported.

- [ ] **Step 7: Export and fix withPage**

In `apps/web/src/app/union/recommendations/page.tsx`:

```ts
export function withPage(
  params: Record<string, string | string[] | undefined>,
  page: number,
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "page") continue;
    // Целей может быть несколько — иначе на второй странице осталась бы одна.
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item) query.append(key, item);
    }
  }
  query.set("page", String(page));
  return query.toString();
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run src/app/union/recommendations/page.spec.ts src/lib/union-api.spec.ts`
Expected: PASS, 5 tests.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/lib/union-api.ts apps/web/src/lib/union-api.spec.ts apps/web/src/app/union/recommendations/page.tsx apps/web/src/app/union/recommendations/page.spec.ts
git commit -m "fix(union): keep every selected goal in the query and across pages"
```

---

### Task 5: Goal chips with counts in the filter

**Files:**
- Create: `apps/web/src/components/union/intention-chips.tsx`
- Modify: `apps/web/src/components/union/recommendation-filters.tsx` (remove the `intention` `Select`, render the chips, extend `filterKeys`)
- Modify: `apps/web/src/app/union/recommendations/page.tsx:55` (pass counts)
- Test: `apps/web/src/components/union/intention-chips.spec.tsx` (create)

**Interfaces:**
- Consumes: `UnionIntentionCounts` (Task 1), `intentionLabels` / `intentionTypes` from `./labels`
- Produces: `<IntentionChips counts selected />` rendering checkboxes named `intentions`; `RecommendationFilters` gains an optional `intentionCounts` prop

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/union/intention-chips.spec.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { IntentionChips } from "./intention-chips";

const counts = {
  all: 128,
  family: 64,
  business: 30,
  friendship: 48,
  service: 22,
};

describe("IntentionChips", () => {
  it("shows a count next to every goal", () => {
    render(<IntentionChips counts={counts} selected={[]} />);

    expect(screen.getByRole("button", { name: "Все · 128" })).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Создание семьи · 64" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Совместное служение · 22" }),
    ).toBeInTheDocument();
  });

  it("submits every checked goal under the same name", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <IntentionChips counts={counts} selected={["family"]} />,
    );

    await user.click(
      screen.getByRole("checkbox", { name: "Бизнес и проекты · 30" }),
    );

    const checked = Array.from(
      container.querySelectorAll<HTMLInputElement>(
        'input[name="intentions"]:checked',
      ),
    ).map((input) => input.value);
    expect(checked).toEqual(["family", "business"]);
  });

  it("clears the goals when «Все» is pressed", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <IntentionChips counts={counts} selected={["family", "service"]} />,
    );

    await user.click(screen.getByRole("button", { name: "Все · 128" }));

    expect(
      container.querySelectorAll('input[name="intentions"]:checked'),
    ).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx vitest run src/components/union/intention-chips.spec.tsx`
Expected: FAIL — cannot resolve `./intention-chips`.

- [ ] **Step 3: Write the component**

Create `apps/web/src/components/union/intention-chips.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { UnionIntentionCounts, UnionIntentionType } from "@vedamatch/shared";
import { intentionLabels, intentionTypes } from "./labels";

const chipClass =
  "rounded-full border px-3 py-1.5 text-sm transition cursor-pointer";
const activeChip = "border-magenta bg-magenta/15 text-text-0";
const idleChip = "border-glass-brd text-text-1 hover:text-text-0";

/**
 * Цели выбираются несколькими сразу (ИЛИ). «Все» — не пятая категория, а
 * сброс именно целей: город, возраст и прочее он не трогает.
 */
export function IntentionChips({
  counts,
  selected,
}: {
  counts: UnionIntentionCounts;
  selected: UnionIntentionType[];
}) {
  const [chosen, setChosen] = useState<UnionIntentionType[]>(selected);

  function toggle(type: UnionIntentionType) {
    setChosen((current) =>
      current.includes(type)
        ? current.filter((item) => item !== type)
        : // Порядок фиксирован, чтобы ссылка на выдачу не зависела от того,
          // в каком порядке человек нажимал чипы.
          intentionTypes.filter((item) => item === type || current.includes(item)),
    );
  }

  return (
    <div className="mb-3">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-text-2">
        Цель
      </span>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setChosen([])}
          aria-pressed={chosen.length === 0}
          className={`${chipClass} ${chosen.length === 0 ? activeChip : idleChip}`}
        >
          Все · {counts.all}
        </button>
        {intentionTypes.map((type) => (
          <label
            key={type}
            className={`${chipClass} ${chosen.includes(type) ? activeChip : idleChip}`}
          >
            <input
              type="checkbox"
              name="intentions"
              value={type}
              checked={chosen.includes(type)}
              onChange={() => toggle(type)}
              className="sr-only"
            />
            {intentionLabels[type]} · {counts[type]}
          </label>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run src/components/union/intention-chips.spec.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 5: Replace the dropdown with the chips**

In `apps/web/src/components/union/recommendation-filters.tsx`:

Add to the props:

```tsx
export function RecommendationFilters({
  params,
  intentionCounts,
}: {
  params: Record<string, string | string[] | undefined>;
  intentionCounts?: UnionIntentionCounts;
}) {
```

Import `IntentionChips` and the `UnionIntentionCounts` / `UnionIntentionType` types. Keep the `intentionTypes` import — the `selectedIntentions` helper below uses it. `intentionLabels` was only used by the dropdown, so drop it from that import.

Delete the whole `<Select name="intention" label="Цель" ... />` block and render the chips just above the `<div className="grid gap-3 md:grid-cols-3">` that used to contain it:

```tsx
      {intentionCounts && (
        <IntentionChips
          counts={intentionCounts}
          selected={selectedIntentions(params)}
        />
      )}
```

Add the helper next to `first`:

```tsx
/** Старая ссылка с `intention=` продолжает открываться выбранным чипом. */
function selectedIntentions(
  params: Record<string, string | string[] | undefined>,
): UnionIntentionType[] {
  const raw = params.intentions ?? params.intention;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return intentionTypes.filter((type) => list.includes(type));
}
```

Replace `"intention"` with `"intentions"` in `filterKeys` so the mobile badge still counts a goal filter, and keep `"intention"` in the list as well — an old link must still light the badge.

- [ ] **Step 6: Pass the counts from the page**

In `apps/web/src/app/union/recommendations/page.tsx`, change line 55 to:

```tsx
        <RecommendationFilters
          params={params}
          intentionCounts={recommendations.intentionCounts}
        />
```

- [ ] **Step 7: Run the filter tests**

Run: `cd apps/web && npx vitest run src/components/union`
Expected: PASS. `recommendation-filters.spec.tsx` renders without `intentionCounts`, which is why the prop is optional — the chips simply do not render there.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/union/intention-chips.tsx apps/web/src/components/union/intention-chips.spec.tsx apps/web/src/components/union/recommendation-filters.tsx apps/web/src/app/union/recommendations/page.tsx
git commit -m "feat(union): pick several goals as chips carrying profile counts"
```

---

### Task 6: Goal checkboxes with the sliders behind a toggle

**Files:**
- Create: `apps/web/src/components/union/intention-picker.tsx`
- Create: `apps/web/src/components/union/intention-section.tsx`
- Modify: `apps/web/src/components/union/union-profile-form.tsx:132-144` (`toWeights` default), `:22-26` (import), `:309-316` (render)
- Test: `apps/web/src/components/union/intention-picker.spec.tsx` (create)
- Test: `apps/web/src/components/union/intention-section.spec.tsx` (create)

**Interfaces:**
- Consumes: `IntentionWeights`, `intentionSum` from `./intention-constructor`
- Produces:
  - `evenWeights(selected: UnionIntentionType[]): IntentionWeights`
  - `isEvenSplit(weights: IntentionWeights): boolean`
  - `selectedTypes(weights: IntentionWeights): UnionIntentionType[]`
  - `<IntentionPicker weights onChange />`
  - `<IntentionSection weights onChange />` — the single component the form renders

- [ ] **Step 1: Write the failing picker test**

Create `apps/web/src/components/union/intention-picker.spec.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  IntentionPicker,
  evenWeights,
  isEvenSplit,
} from "./intention-picker";

describe("evenWeights", () => {
  it("splits 100 exactly, remainder first", () => {
    expect(evenWeights(["family", "business", "friendship"])).toEqual({
      family: 34,
      business: 33,
      friendship: 33,
      service: 0,
    });
  });

  it("gives a single goal everything", () => {
    expect(evenWeights(["service"])).toEqual({
      family: 0,
      business: 0,
      friendship: 0,
      service: 100,
    });
  });
});

describe("isEvenSplit", () => {
  it("recognises an even split", () => {
    expect(isEvenSplit({ family: 50, business: 50, friendship: 0, service: 0 })).toBe(true);
  });

  it("rejects hand-tuned weights", () => {
    expect(isEvenSplit({ family: 50, business: 25, friendship: 25, service: 0 })).toBe(false);
    expect(isEvenSplit({ family: 40, business: 20, friendship: 20, service: 20 })).toBe(false);
  });
});

describe("IntentionPicker", () => {
  it("re-splits evenly when a goal is checked", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <IntentionPicker
        weights={{ family: 100, business: 0, friendship: 0, service: 0 }}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: "Бизнес и проекты" }));

    expect(onChange).toHaveBeenCalledWith({
      family: 50,
      business: 50,
      friendship: 0,
      service: 0,
    });
  });

  it("refuses to uncheck the last goal", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <IntentionPicker
        weights={{ family: 100, business: 0, friendship: 0, service: 0 }}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: "Создание семьи" }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(/хотя бы одну цель/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx vitest run src/components/union/intention-picker.spec.tsx`
Expected: FAIL — cannot resolve `./intention-picker`.

- [ ] **Step 3: Write the picker**

Create `apps/web/src/components/union/intention-picker.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { UnionIntentionType } from "@vedamatch/shared";
import type { IntentionWeights } from "./intention-constructor";
import { intentionLabels, intentionTypes } from "./labels";

const empty: IntentionWeights = {
  family: 0,
  business: 0,
  friendship: 0,
  service: 0,
};

/** Делит 100 поровну, остаток отдаёт первым по порядку целям: три цели дают
 *  34/33/33, а не 33/33/33 — сумма обязана быть ровно 100. */
export function evenWeights(selected: UnionIntentionType[]): IntentionWeights {
  if (selected.length === 0) return evenWeights(intentionTypes);
  const base = Math.floor(100 / selected.length);
  let remainder = 100 - base * selected.length;
  const weights: IntentionWeights = { ...empty };
  for (const type of intentionTypes) {
    if (!selected.includes(type)) continue;
    weights[type] = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
  }
  return weights;
}

export function selectedTypes(weights: IntentionWeights): UnionIntentionType[] {
  return intentionTypes.filter((type) => weights[type] > 0);
}

/** Ровно то, что получилось бы из галочек. Всё остальное — ручная настройка,
 *  которую нельзя молча потерять. */
export function isEvenSplit(weights: IntentionWeights): boolean {
  const selected = selectedTypes(weights);
  if (selected.length === 0) return false;
  const even = evenWeights(selected);
  return intentionTypes.every((type) => weights[type] === even[type]);
}

export function IntentionPicker({
  weights,
  onChange,
}: {
  weights: IntentionWeights;
  onChange: (weights: IntentionWeights) => void;
}) {
  const [warned, setWarned] = useState(false);
  const selected = selectedTypes(weights);

  function toggle(type: UnionIntentionType) {
    const next = selected.includes(type)
      ? selected.filter((item) => item !== type)
      : intentionTypes.filter((item) => item === type || selected.includes(item));
    // Сервер требует хотя бы одно намерение, поэтому пустой набор не
    // отправляем вовсе — иначе анкета молча перестала бы сохраняться.
    if (next.length === 0) {
      setWarned(true);
      return;
    }
    setWarned(false);
    onChange(evenWeights(next));
  }

  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-semibold text-text-0">
        Что вы ищете? Отметьте подходящее
      </legend>
      {intentionTypes.map((type) => (
        <label key={type} className="flex items-center gap-3 text-sm text-text-1">
          <input
            type="checkbox"
            checked={selected.includes(type)}
            onChange={() => toggle(type)}
            className="h-5 w-5"
          />
          {intentionLabels[type]}
        </label>
      ))}
      {warned && (
        <p className="text-xs text-magenta">
          Оставьте хотя бы одну цель — без неё анкета не сохранится.
        </p>
      )}
    </fieldset>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run src/components/union/intention-picker.spec.tsx`
Expected: PASS, 6 tests.

- [ ] **Step 5: Write the failing section test**

Create `apps/web/src/components/union/intention-section.spec.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { IntentionSection } from "./intention-section";

describe("IntentionSection", () => {
  it("shows checkboxes for an even split", () => {
    render(
      <IntentionSection
        weights={{ family: 50, business: 50, friendship: 0, service: 0 }}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("checkbox", { name: "Создание семьи" })).toBeChecked();
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  });

  it("opens hand-tuned weights in slider mode so they are not flattened", () => {
    render(
      <IntentionSection
        weights={{ family: 50, business: 25, friendship: 25, service: 0 }}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("slider")).toHaveLength(4);
    expect(
      screen.getByRole("checkbox", { name: /тонкая настройка/i }),
    ).toBeChecked();
  });

  it("re-splits evenly when fine tuning is switched off", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <IntentionSection
        weights={{ family: 50, business: 25, friendship: 25, service: 0 }}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: /тонкая настройка/i }));

    expect(onChange).toHaveBeenCalledWith({
      family: 34,
      business: 33,
      friendship: 33,
      service: 0,
    });
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `cd apps/web && npx vitest run src/components/union/intention-section.spec.tsx`
Expected: FAIL — cannot resolve `./intention-section`.

- [ ] **Step 7: Write the section**

Create `apps/web/src/components/union/intention-section.tsx`:

```tsx
"use client";

import { useState } from "react";
import {
  IntentionConstructor,
  type IntentionWeights,
} from "./intention-constructor";
import {
  IntentionPicker,
  evenWeights,
  isEvenSplit,
  selectedTypes,
} from "./intention-picker";
import { intentionTypes } from "./labels";

/**
 * Галочки — обычный режим, проценты — по желанию. Анкета с ручными весами
 * открывается сразу в процентах: иначе первое же касание галочек стёрло бы
 * настройку, которую человек делал руками.
 */
export function IntentionSection({
  weights,
  onChange,
}: {
  weights: IntentionWeights;
  onChange: (weights: IntentionWeights) => void;
}) {
  const [fineTuning, setFineTuning] = useState(() => !isEvenSplit(weights));

  function toggleMode(next: boolean) {
    setFineTuning(next);
    if (next) return;
    // Возврат к галочкам выравнивает веса: набор целей сохраняется, а вот
    // приоритеты внутри него — нет, о чём написано рядом с переключателем.
    const selected = selectedTypes(weights);
    onChange(evenWeights(selected.length > 0 ? selected : intentionTypes));
  }

  return (
    <div className="space-y-3">
      {fineTuning ? (
        <IntentionConstructor weights={weights} onChange={onChange} />
      ) : (
        <IntentionPicker weights={weights} onChange={onChange} />
      )}
      <label className="flex items-start gap-3 text-sm text-text-1">
        <input
          type="checkbox"
          checked={fineTuning}
          onChange={(event) => toggleMode(event.target.checked)}
          className="mt-0.5 h-5 w-5"
        />
        <span>
          Тонкая настройка: распределить 100% между целями
          <span className="block text-xs text-text-2">
            При выключении проценты выровняются поровну между отмеченными
            целями.
          </span>
        </span>
      </label>
    </div>
  );
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run src/components/union/intention-section.spec.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 9: Wire the section into the profile form**

In `apps/web/src/components/union/union-profile-form.tsx`:

Change the import block at line 22 to keep `IntentionWeights` and `intentionSum` from `./intention-constructor` and add `import { IntentionSection } from "./intention-section";`.

Replace line 311:

```tsx
        <IntentionSection weights={weights} onChange={updateWeights} />
```

Change the default in `toWeights` so a brand-new profile opens in checkbox mode:

```ts
  // Ровные веса: неровный дефолт открывал бы каждому новичку режим процентов.
  if (!profile) return { family: 25, business: 25, friendship: 25, service: 25 };
```

- [ ] **Step 10: Run the whole union suite**

Run: `cd apps/web && npx vitest run src/components/union`
Expected: PASS, including the existing `union-profile-form` tests.

- [ ] **Step 11: Typecheck and lint**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json && npx eslint src/components/union src/app/union src/lib/union-api.ts`
Expected: no new errors. `src/app/profile/page.spec.tsx` reports a missing `gender` property — that failure exists on `main`, leave it.

- [ ] **Step 12: Commit**

```bash
git add apps/web/src/components/union/intention-picker.tsx apps/web/src/components/union/intention-picker.spec.tsx apps/web/src/components/union/intention-section.tsx apps/web/src/components/union/intention-section.spec.tsx apps/web/src/components/union/union-profile-form.tsx
git commit -m "feat(union): pick goals with checkboxes and hide the percentages behind a toggle"
```

---

## Verification

After the last task, confirm the two flows by hand against a running dev server:

1. `/union/profile` → «Цель знакомства» shows checkboxes; ticking a second goal saves and the row stops complaining about the sum; enabling «Тонкая настройка» reveals the sliders with the current split.
2. `/union/recommendations` → the chips carry counts; picking two goals widens the result rather than narrowing it to one; «Все» clears goals and leaves the city filter alone; page 2 keeps both goals in the URL.
