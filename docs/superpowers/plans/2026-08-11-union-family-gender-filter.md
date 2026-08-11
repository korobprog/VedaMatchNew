# Union: авто-фильтр по полу для цели «Создание семьи» — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** For Union users whose `family` intention weight is ≥50%, automatically restrict the recommendations feed (both what they see and who sees them) to the opposite binary gender, with a profile toggle to disable this behavior.

**Architecture:** Add a `disableFamilyGenderFilter` boolean column to `UnionProfile`. Compute a per-user "family gender context" (gender + family-intent weight + toggle) once per `getRecommendations` call, and add a one-sided-per-party gender check inside the existing `matchesFilters()` gate in `union-profile.service.ts` — no changes to compatibility scoring. Expose the new field through the shared DTOs and a checkbox in the Union profile form, following the exact pattern already used for `requestsFromVerifiedOnly`.

**Tech Stack:** NestJS + Prisma (Postgres) backend in `apps/api`, Next.js frontend in `apps/web`, shared TypeScript types in `packages/shared` (compiled to `dist`, consumed by both apps), Jest (api) / Vitest (web) for tests.

## Global Constraints

- Binary gender only (`Gender` enum: `male | female`). No non-binary handling — out of scope per spec.
- Restriction threshold: `family` intention weight ≥ **50**.
- Default (no data): if `gender` is `null`/unset, or the `family` intention weight is not ≥50 (including "no `family` intention at all" → weight 0), the restriction does **not** apply.
- The toggle field `disableFamilyGenderFilter` defaults to `false` (restriction is active whenever the other two conditions hold, unless the user explicitly opts out).
- One-sided-per-party logic: a match is excluded if **either** party's own restriction is active and the other party doesn't satisfy it — it does NOT require both parties to be restricted.
- Scope: only `GET /union/recommendations` (`getRecommendations`). `GET /union/users/:id` and existing connections/chats are untouched.
- Spec: `docs/superpowers/specs/2026-08-11-union-family-gender-filter-design.md`

---

### Task 1: Prisma schema — add `disableFamilyGenderFilter` column

**Files:**
- Modify: `apps/api/prisma/schema.prisma:790-829` (`model UnionProfile`)
- Create: `apps/api/prisma/migrations/20260811120000_union_family_gender_filter/migration.sql`

**Interfaces:**
- Produces: `UnionProfile.disableFamilyGenderFilter: boolean` (Prisma Client field, default `false`), available to every task after this one.

- [ ] **Step 1: Add the field to the Prisma model**

In `apps/api/prisma/schema.prisma`, inside `model UnionProfile` (around line 822-824), add the new field right after `requestsFromVerifiedOnly`:

```prisma
  // принимать запросы на знакомство только от подтверждённых преданных
  requestsFromVerifiedOnly Boolean                    @default(false)
  /// Кто может начать общение: заявки от всех или только взаимные лайки
  contactMode              UnionContactMode           @default(requests)
  /// Не сужать рекомендации до противоположного пола, даже если цель
  /// «Создание семьи» ≥50%
  disableFamilyGenderFilter Boolean                   @default(false)
```

- [ ] **Step 2: Write the migration SQL by hand**

Create `apps/api/prisma/migrations/20260811120000_union_family_gender_filter/migration.sql` with:

```sql
-- AlterTable
ALTER TABLE "UnionProfile" ADD COLUMN     "disableFamilyGenderFilter" BOOLEAN NOT NULL DEFAULT false;
```

This matches the existing convention used for `requestsFromVerifiedOnly` in `apps/api/prisma/migrations/20260728150000_union_requests_from_verified/migration.sql`.

- [ ] **Step 3: Regenerate the Prisma Client**

Run (from repo root):

```bash
pnpm --filter @vedamatch/api exec prisma generate
```

Expected: command exits 0, `node_modules/.prisma/client` (or `@prisma/client`) now types `UnionProfile.disableFamilyGenderFilter` as `boolean`. No database connection is required for `prisma generate`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260811120000_union_family_gender_filter
git commit -m "feat(union): add disableFamilyGenderFilter column to UnionProfile"
```

---

### Task 2: Shared DTOs — expose the new field

**Files:**
- Modify: `packages/shared/src/union.ts:102-122` (`UnionProfileDto`)
- Modify: `packages/shared/src/union.ts:179-193` (`UnionProfileUpdateRequest`)

**Interfaces:**
- Consumes: nothing from Task 1 directly (this is a pure type change; the API service in Task 3 is what actually reads/writes the Prisma field).
- Produces: `UnionProfileDto.disableFamilyGenderFilter: boolean` and `UnionProfileUpdateRequest.disableFamilyGenderFilter?: boolean`, consumed by Task 3 (API) and Task 5 (web form).

- [ ] **Step 1: Add the field to `UnionProfileDto`**

In `packages/shared/src/union.ts`, inside `UnionProfileDto` (around line 116-118):

```ts
  /** Принимать запросы только от преданных, подтверждённых администрацией */
  requestsFromVerifiedOnly: boolean;
  /** Кто может начать общение: заявки от всех или только взаимные лайки */
  contactMode: UnionContactMode;
  /**
   * Не сужать рекомендации до противоположного пола, даже если цель
   * «Создание семьи» ≥50% (по умолчанию `false` — сужение включено).
   */
  disableFamilyGenderFilter: boolean;
```

- [ ] **Step 2: Add the field to `UnionProfileUpdateRequest`**

In the same file, inside `UnionProfileUpdateRequest` (around line 190-191):

```ts
  requestsFromVerifiedOnly?: boolean;
  contactMode?: UnionContactMode;
  disableFamilyGenderFilter?: boolean;
```

- [ ] **Step 3: Rebuild the shared package**

```bash
pnpm --filter @vedamatch/shared build
```

Expected: exits 0, `packages/shared/dist/index.d.ts` now includes `disableFamilyGenderFilter` on both interfaces. Both `apps/api` and `apps/web` import from `dist`, so this rebuild is required before either app will see the new field.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/union.ts packages/shared/dist
git commit -m "feat(union): add disableFamilyGenderFilter to shared profile DTOs"
```

---

### Task 3: Backend — family-gender restriction logic in recommendations

**Files:**
- Modify: `apps/api/src/modules/union/union-profile.service.ts`
- Test: `apps/api/src/modules/union/union-profile.service.spec.ts`

**Interfaces:**
- Consumes: `UnionProfile.disableFamilyGenderFilter: boolean` (Task 1), `UnionProfileDto.disableFamilyGenderFilter` / `UnionProfileUpdateRequest.disableFamilyGenderFilter?` (Task 2).
- Produces:
  - `familyGenderContext(profile: { intentions: Array<{ type: string; weight: number }>; disableFamilyGenderFilter: boolean }, gender: Gender | null): FamilyGenderContext`
  - `isFamilyGenderRestricted(context: FamilyGenderContext): boolean`
  - `passesFamilyGenderRestriction(viewer: FamilyGenderContext, candidate: FamilyGenderContext): boolean`
  - `interface FamilyGenderContext { gender: Gender | null; familyWeight: number; disableFamilyGenderFilter: boolean }`
  - `UnionProfileService.toDto()` now includes `disableFamilyGenderFilter` in its output.
  - `UnionProfileService.upsertProfile()` now persists `disableFamilyGenderFilter` when sent.
  - These are consumed by Task 4 (frontend reads `disableFamilyGenderFilter` from `UnionProfileDto`, writes it via `UnionProfileUpdateRequest`).

#### Step 1: Add test fixture helpers

In `apps/api/src/modules/union/union-profile.service.spec.ts`, add a helper next to `withGender` (after line 149) to set an arbitrary intention list on a fixture profile:

```ts
function withIntentions(
  source: ReturnType<typeof profile>,
  entries: Array<{ type: 'family' | 'business' | 'friendship' | 'service'; weight: number }>,
) {
  return {
    ...source,
    intentions: entries.map((entry, index) => ({
      id: `intention-${source.userId}-${index}`,
      profileId: source.id,
      type: entry.type,
      weight: entry.weight,
    })),
  };
}
```

- [ ] Add this function, then run `git diff` to confirm it's the only change so far (no test assertions yet — this is setup, not a test).

#### Step 2: Write the failing tests

Add the following `it` blocks right after the existing `'ignores an unsupported gender value instead of returning nothing'` test (after line 454) in `union-profile.service.spec.ts`:

```ts
  it('restricts my feed to the opposite gender when my family intent is 50% or more', async () => {
    const me = withIntentions(withGender(profile('me'), 'male'), [
      { type: 'family', weight: 60 },
      { type: 'friendship', weight: 40 },
    ]);
    const man = withGender(profile('man'), 'male');
    const woman = withGender(profile('woman'), 'female');
    const unset = withGender(profile('unset'), null);
    prisma.unionProfile.findUnique.mockResolvedValue(me);
    prisma.unionProfile.findMany.mockResolvedValue([man, woman, unset]);
    prisma.unionConnectionRequest.findMany.mockResolvedValue([]);

    const result = await service.getRecommendations('me');

    expect(result.items.map((item) => item.user.id)).toEqual(['woman']);
  });

  it('does not restrict when my family intent is below 50%', async () => {
    const me = withIntentions(withGender(profile('me'), 'male'), [
      { type: 'family', weight: 40 },
      { type: 'friendship', weight: 60 },
    ]);
    const man = withGender(profile('man'), 'male');
    const woman = withGender(profile('woman'), 'female');
    prisma.unionProfile.findUnique.mockResolvedValue(me);
    prisma.unionProfile.findMany.mockResolvedValue([man, woman]);
    prisma.unionConnectionRequest.findMany.mockResolvedValue([]);

    const result = await service.getRecommendations('me');

    expect(result.items.map((item) => item.user.id).sort()).toEqual([
      'man',
      'woman',
    ]);
  });

  it('does not restrict when my gender is not set, regardless of family intent', async () => {
    // profile('me') leaves user.gender as undefined (key omitted), not null —
    // withGender(..., null) is required to match Prisma's real null semantics
    // for an unset nullable column, which is what the service checks against.
    const me = withIntentions(withGender(profile('me'), null), [
      { type: 'family', weight: 80 },
      { type: 'friendship', weight: 20 },
    ]);
    const man = withGender(profile('man'), 'male');
    const woman = withGender(profile('woman'), 'female');
    prisma.unionProfile.findUnique.mockResolvedValue(me);
    prisma.unionProfile.findMany.mockResolvedValue([man, woman]);
    prisma.unionConnectionRequest.findMany.mockResolvedValue([]);

    const result = await service.getRecommendations('me');

    expect(result.items.map((item) => item.user.id).sort()).toEqual([
      'man',
      'woman',
    ]);
  });

  it('does not restrict when I disabled the family gender filter', async () => {
    const me = withDetails(
      withIntentions(withGender(profile('me'), 'male'), [
        { type: 'family', weight: 90 },
        { type: 'friendship', weight: 10 },
      ]),
      { disableFamilyGenderFilter: true },
    );
    const man = withGender(profile('man'), 'male');
    const woman = withGender(profile('woman'), 'female');
    prisma.unionProfile.findUnique.mockResolvedValue(me);
    prisma.unionProfile.findMany.mockResolvedValue([man, woman]);
    prisma.unionConnectionRequest.findMany.mockResolvedValue([]);

    const result = await service.getRecommendations('me');

    expect(result.items.map((item) => item.user.id).sort()).toEqual([
      'man',
      'woman',
    ]);
  });

  it('excludes a candidate whose own family intent restricts them, even when I am not restricted', async () => {
    const me = withGender(profile('me'), 'male');
    const restrictedMan = withIntentions(withGender(profile('man'), 'male'), [
      { type: 'family', weight: 70 },
      { type: 'friendship', weight: 30 },
    ]);
    const restrictedWoman = withIntentions(
      withGender(profile('woman'), 'female'),
      [
        { type: 'family', weight: 70 },
        { type: 'friendship', weight: 30 },
      ],
    );
    prisma.unionProfile.findUnique.mockResolvedValue(me);
    prisma.unionProfile.findMany.mockResolvedValue([
      restrictedMan,
      restrictedWoman,
    ]);
    prisma.unionConnectionRequest.findMany.mockResolvedValue([]);

    const result = await service.getRecommendations('me');

    // restrictedMan requires an opposite-gender viewer (female); I'm male, so
    // he's excluded even though *my* own restriction is inactive.
    // restrictedWoman requires an opposite-gender viewer (male); I qualify.
    expect(result.items.map((item) => item.user.id)).toEqual(['woman']);
  });
```

- [ ] **Run the tests to verify they fail**

```bash
pnpm --filter @vedamatch/api test -- union-profile.service.spec.ts
```

Expected: the five new tests FAIL (the current code has no family-gender restriction, so `getRecommendations('me')` returns all candidates including the ones the new tests expect excluded — e.g. the first test gets `['man', 'woman']` instead of `['woman']`).

#### Step 3: Implement the family-gender context helpers

In `apps/api/src/modules/union/union-profile.service.ts`:

1. Add `Gender` to the type-only import from `@prisma/client` (line 6-13):

```ts
import type {
  Gender,
  UnionConnectionRequest,
  UnionIntention,
  UnionProfile,
  User,
  UserPhoto,
} from '@prisma/client';
```

2. Add a new constant near the other module-level constants (after `MAX_PAGE_SIZE` around line 120):

```ts
/** Порог веса цели «Создание семьи», начиная с которого включается авто-сужение по полу. */
const FAMILY_GENDER_RESTRICTION_THRESHOLD = 50;
```

3. Add a new interface right after `interface MyAgePreference` (around line 128):

```ts
/** Пол-контекст пользователя для авто-ограничения по цели «Создание семьи». */
interface FamilyGenderContext {
  gender: Gender | null;
  familyWeight: number;
  disableFamilyGenderFilter: boolean;
}
```

4. Add free functions at the bottom of the file, next to the other pure helpers like `cleanFilterText` (after the closing `}` of the `UnionProfileService` class, around line 1149):

```ts
function familyIntentionWeight(
  intentions: Array<Pick<UnionIntention, 'type' | 'weight'>>,
): number {
  return intentions.find((intention) => intention.type === 'family')
    ?.weight ?? 0;
}

function familyGenderContext(
  profile: {
    intentions: Array<Pick<UnionIntention, 'type' | 'weight'>>;
    disableFamilyGenderFilter: boolean;
  },
  gender: Gender | null,
): FamilyGenderContext {
  return {
    gender,
    familyWeight: familyIntentionWeight(profile.intentions),
    disableFamilyGenderFilter: profile.disableFamilyGenderFilter,
  };
}

function isFamilyGenderRestricted(context: FamilyGenderContext): boolean {
  return (
    context.gender !== null &&
    context.familyWeight >= FAMILY_GENDER_RESTRICTION_THRESHOLD &&
    !context.disableFamilyGenderFilter
  );
}

function oppositeGender(gender: Gender): Gender {
  return gender === 'male' ? 'female' : 'male';
}

/**
 * Односторонняя проверка на пару «зритель, кандидат»: активная цель
 * «Создание семьи» ≥50% у ЛЮБОЙ из сторон сужает пару до противоположного
 * пола. Не требует, чтобы обе стороны были ограничены одновременно.
 */
function passesFamilyGenderRestriction(
  viewer: FamilyGenderContext,
  candidate: FamilyGenderContext,
): boolean {
  if (isFamilyGenderRestricted(viewer)) {
    if (candidate.gender === null) return false;
    if (candidate.gender !== oppositeGender(viewer.gender as Gender)) {
      return false;
    }
  }
  if (isFamilyGenderRestricted(candidate)) {
    if (viewer.gender === null) return false;
    if (viewer.gender !== oppositeGender(candidate.gender as Gender)) {
      return false;
    }
  }
  return true;
}
```

#### Step 4: Wire the check into `matchesFilters` and `getRecommendations`

1. Update the `matchesFilters` signature (line 654-660) to accept the viewer's context:

```ts
  private matchesFilters(
    profile: ProfileWithIntentions,
    user: User,
    filters: UnionRecommendationFilters,
    myInput: UnionMatchInput,
    myAge: MyAgePreference,
    myFamilyGender: FamilyGenderContext,
  ): boolean {
```

2. Right after the existing explicit gender-filter check (line 669: `if (filters.gender && user.gender !== filters.gender) return false;`), add:

```ts
    if (
      !passesFamilyGenderRestriction(
        myFamilyGender,
        familyGenderContext(profile, user.gender),
      )
    ) {
      return false;
    }
```

3. In `getRecommendations` (around line 328), compute the viewer's context once and pass it through:

```ts
    const myInput = this.toMatchInput(me, me.user);
    const myFamilyGender = familyGenderContext(me, me.user.gender);
    const normalizedFilters = this.normalizeFilters(filters);
    const recommendations = others
      .filter((other) => !hidden.has(other.userId))
      .filter((other) => !swiped.has(other.userId))
      .filter((other) => this.hasCompleteLocation(other.user))
      .filter((other) =>
        this.matchesFilters(
          other,
          other.user,
          normalizedFilters,
          myInput,
          {
            age: calculateAge(me.user.birthDate),
            ageRangeMin: me.ageRangeMin,
            ageRangeMax: me.ageRangeMax,
          },
          myFamilyGender,
        ),
      )
```

#### Step 5: Persist and expose the field on profile save/read

1. In `toDto()` (around line 1113-1148), add the field next to `contactMode`:

```ts
      isActive: profile.isActive,
      requestsFromVerifiedOnly: profile.requestsFromVerifiedOnly,
      contactMode: profile.contactMode,
      disableFamilyGenderFilter: profile.disableFamilyGenderFilter,
```

2. In `validateProfileFields()` (around line 922-934), add handling next to `requestsFromVerifiedOnly`:

```ts
    if (body.requestsFromVerifiedOnly !== undefined) {
      data.requestsFromVerifiedOnly = body.requestsFromVerifiedOnly;
    }
    if (body.disableFamilyGenderFilter !== undefined) {
      data.disableFamilyGenderFilter = body.disableFamilyGenderFilter;
    }
```

#### Step 6: Run the tests to verify they pass

```bash
pnpm --filter @vedamatch/api test -- union-profile.service.spec.ts
```

Expected: all tests in the file PASS, including the 5 new ones and all pre-existing ones (pre-existing candidates never set a `family` intention ≥50% together with a set gender, so their behavior is unchanged).

#### Step 7: Commit

```bash
git add apps/api/src/modules/union/union-profile.service.ts apps/api/src/modules/union/union-profile.service.spec.ts
git commit -m "feat(union): auto-restrict recommendations to opposite gender at 50%+ family intent"
```

---

### Task 4: Backend — combine with explicit `?gender=` filter (regression test)

**Files:**
- Test: `apps/api/src/modules/union/union-profile.service.spec.ts`

**Interfaces:**
- Consumes: `passesFamilyGenderRestriction`, `familyGenderContext` (Task 3) — exercised indirectly through `getRecommendations`, no new exports.

- [ ] **Step 1: Write the test**

Add after the last test added in Task 3:

```ts
  it('applies the explicit gender filter and the family-intent restriction together', async () => {
    const me = withIntentions(withGender(profile('me'), 'male'), [
      { type: 'family', weight: 60 },
      { type: 'friendship', weight: 40 },
    ]);
    const woman = withGender(profile('woman'), 'female');
    const otherWoman = withGender(profile('woman2'), 'female');
    prisma.unionProfile.findUnique.mockResolvedValue(me);
    prisma.unionProfile.findMany.mockResolvedValue([woman, otherWoman]);
    prisma.unionConnectionRequest.findMany.mockResolvedValue([]);

    // Explicit filter narrows further to a specific candidate; the implicit
    // family-gender restriction (male -> female) is already satisfied by both.
    const result = await service.getRecommendations('me', {
      gender: 'female',
    });

    expect(result.items.map((item) => item.user.id).sort()).toEqual([
      'woman',
      'woman2',
    ]);
  });
```

- [ ] **Step 2: Run it to verify it passes immediately**

```bash
pnpm --filter @vedamatch/api test -- union-profile.service.spec.ts
```

Expected: PASS without further implementation changes — this test documents that the two filters (Task 3's implicit one and the pre-existing explicit `?gender=`) already compose correctly via AND, since `matchesFilters` runs both checks in sequence.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/union/union-profile.service.spec.ts
git commit -m "test(union): cover explicit gender filter combined with family-intent restriction"
```

---

### Task 5: Frontend — profile toggle

**Files:**
- Modify: `apps/web/src/components/union/union-profile-form.tsx`
- Test: `apps/web/src/components/union/union-profile-form.spec.tsx`

**Interfaces:**
- Consumes: `UnionProfileDto.disableFamilyGenderFilter: boolean`, `UnionProfileUpdateRequest.disableFamilyGenderFilter?: boolean` (Task 2).
- Produces: a rendered checkbox with accessible name `"Показывать анкеты всех полов"` that PATCHes `disableFamilyGenderFilter` on toggle — no other task depends on this.

- [ ] **Step 1: Update the test fixture**

In `apps/web/src/components/union/union-profile-form.spec.tsx`, add the field to the `profile` fixture (around line 48-49):

```ts
  requestsFromVerifiedOnly: false,
  contactMode: "requests",
  disableFamilyGenderFilter: false,
```

- [ ] **Step 2: Write the failing test**

Add after the `'сохраняет видимость профиля в рекомендациях'` test (after line 108):

```ts
  it("сохраняет отключение фильтра по полу", async () => {
    const user = userEvent.setup();
    render(<UnionProfileForm profile={profile} completeness={completeness} />);

    await user.click(
      screen.getByRole("checkbox", {
        name: "Показывать анкеты всех полов",
      }),
    );

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(bodyOf(0).disableFamilyGenderFilter).toBe(true);
  });
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
pnpm --filter @vedamatch/web test -- union-profile-form.spec.tsx
```

Expected: FAILS — `screen.getByRole("checkbox", { name: "Показывать анкеты всех полов" })` throws because the checkbox doesn't exist yet, and the fixture update alone doesn't add the field to `Draft`/UI.

- [ ] **Step 4: Add the field to the `Draft` type and `toDraft()`**

In `apps/web/src/components/union/union-profile-form.tsx`, update the `Draft` type (around line 86-98):

```ts
type Draft = Omit<
  UnionProfileUpdateRequest,
  | "intentions"
  | "privacy"
  | "isActive"
  | "requestsFromVerifiedOnly"
  | "contactMode"
  | "disableFamilyGenderFilter"
> & {
  privacy: UnionPrivacySettings;
  isActive: boolean;
  requestsFromVerifiedOnly: boolean;
  contactMode: UnionContactMode;
  disableFamilyGenderFilter: boolean;
};
```

Update `toDraft()` (around line 100-127):

```ts
    isActive: profile?.isActive ?? true,
    requestsFromVerifiedOnly: profile?.requestsFromVerifiedOnly ?? false,
    contactMode: profile?.contactMode ?? "requests",
    disableFamilyGenderFilter: profile?.disableFamilyGenderFilter ?? false,
  };
}
```

- [ ] **Step 5: Add the checkbox UI**

In the same file, right after the `requestsFromVerifiedOnly` checkbox block and its helper paragraph (after line 658, before the `contactMode` `<div>` at line 660), add:

```tsx
        <label className="mt-3 flex items-center gap-2 text-sm text-text-1">
          <input
            type="checkbox"
            checked={draft.disableFamilyGenderFilter}
            onChange={(event) =>
              update("disableFamilyGenderFilter", event.target.checked)
            }
            className="h-4 w-4 accent-magenta"
          />
          Показывать анкеты всех полов
        </label>
        <p className="mt-1 pl-6 text-xs text-text-2">
          Если цель «Создание семьи» указана на 50% и больше, лента по
          умолчанию сужается до противоположного пола. Включите, чтобы видеть
          и быть видимым(ой) всем, независимо от пола.
        </p>
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
pnpm --filter @vedamatch/web test -- union-profile-form.spec.tsx
```

Expected: all tests in the file PASS, including the new one.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/union/union-profile-form.tsx apps/web/src/components/union/union-profile-form.spec.tsx
git commit -m "feat(union): add profile toggle to disable the family-intent gender filter"
```

---

### Task 6: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Run the full API test suite**

```bash
pnpm --filter @vedamatch/api test
```

Expected: all suites PASS, no regressions outside `union-profile.service.spec.ts`.

- [ ] **Step 2: Run the full web test suite**

```bash
pnpm --filter @vedamatch/web test
```

Expected: all suites PASS, no regressions outside `union-profile-form.spec.tsx`.

- [ ] **Step 3: Type-check both apps and the shared package**

```bash
pnpm --filter @vedamatch/shared lint
pnpm --filter @vedamatch/api exec tsc --noEmit
pnpm --filter @vedamatch/web exec tsc --noEmit
```

Expected: no type errors.

No commit for this task — it's a verification checkpoint, not a code change.
