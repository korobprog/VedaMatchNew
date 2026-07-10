# Union P1 Connections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven development (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Завершить production P1 для Union: отдельная страница связей, badges входящих заявок, управляемая видимость профиля, корректный UTF-8 и автоматические backend/web тесты.

**Architecture:** NestJS сохраняет существующий полный список заявок и добавляет лёгкий counts endpoint. Next.js страницы остаются server-rendered, а tabs и accept/decline выполняются client component с `router.refresh()`; общий `UnionNav` получает count от server-side helper без polling. `isActive` скрывает профиль только из рекомендаций и не сбрасывается при обычном сохранении.

**Tech Stack:** NestJS 11, Prisma 6, Next.js 16 App Router, React 19, TypeScript 5, Jest 30, Vitest 4.1.6, React Testing Library, jsdom, pnpm workspace.

## Global Constraints

- Не добавлять polling, WebSocket, email, Telegram или push-уведомления.
- `GET /union/connection-requests/counts` возвращает только `{ incomingPending: number }` и остаётся под `AuthGuard`.
- `isActive=false` исключает профиль из рекомендаций, но не ломает собственную анкету, существующие связи, карточки принятых связей и чаты.
- Counts failures скрывают badge и не ломают страницу.
- После accept/decline вызывать `router.refresh()` и сохранять выбранную вкладку.
- Не менять HTTP status codes существующих Union endpoint-ов.
- Не создавать коммиты: текущая агентская политика разрешает коммит только по явному запросу пользователя.
- Каждый агент редактирует только назначенные ему файлы; `pnpm-lock.yaml` принадлежит Connections UI agent.

## File Map And Agent Ownership

### Backend/counts agent

- Modify: `packages/shared/src/union.ts` — shared `UnionConnectionCounts` contract.
- Modify: `apps/api/src/modules/union/union-connection.controller.ts` — counts route before dynamic `:id` routes.
- Modify: `apps/api/src/modules/union/union-connection.service.ts` — `counts(userId)` query.
- Create: `apps/api/src/modules/union/union-connection.service.spec.ts` — connection/counts behavior.
- Create: `apps/api/src/modules/union/union-chat.service.spec.ts` — accepted-chat authorization behavior.

### Profile/encoding agent

- Modify: `apps/api/src/modules/union/union-profile.service.ts` — preserve `isActive`, inactive accepted card access, UTF-8 messages.
- Create: `apps/api/src/modules/union/union-profile.service.spec.ts` — visibility, validation, privacy tests.
- Modify: `apps/web/src/components/union/union-profile-form.tsx` — visibility checkbox and request field.
- Create: `apps/web/src/components/union/union-profile-form.spec.tsx` — toggle payload test.
- Modify: `apps/web/src/components/union/recommendation-card.tsx` — repair contacts heading mojibake.

### Connections UI agent

- Modify: `apps/web/package.json` and `pnpm-lock.yaml` — Vitest/RTL dependencies and `test` script.
- Create: `apps/web/vitest.config.ts` and `apps/web/vitest.setup.ts` — jsdom test environment.
- Modify: `apps/web/src/lib/union-api.ts` — counts helper.
- Create: `apps/web/src/components/union/union-nav.tsx` — reusable Union navigation and badge.
- Create: `apps/web/src/components/union/union-nav.spec.tsx` — badge visibility.
- Create: `apps/web/src/components/union/connections-panel.tsx` — tabs, grouping, actions, empty/error states.
- Create: `apps/web/src/components/union/connections-panel.spec.tsx` — tabs, grouping, accept/decline refresh.
- Create: `apps/web/src/app/union/connections/page.tsx` — SSR connections route.
- Create: `apps/web/src/app/union/users/[id]/page.tsx` — SSR user card route.
- Modify: `apps/web/src/app/union/page.tsx`, `apps/web/src/app/union/recommendations/page.tsx`, `apps/web/src/app/union/chats/[id]/page.tsx` — shared Union navigation/count.
- Modify: `apps/web/src/app/page.tsx` and `apps/web/src/components/service-card.tsx` — root portal badge.
- Create: `apps/web/src/components/service-card.spec.tsx` — root badge behavior.

---

### Task 1: Shared Counts Contract And Endpoint

**Files:**
- Modify: `packages/shared/src/union.ts`
- Modify: `apps/api/src/modules/union/union-connection.controller.ts`
- Modify: `apps/api/src/modules/union/union-connection.service.ts`
- Test: `apps/api/src/modules/union/union-connection.service.spec.ts`

**Interfaces:**
- Produces: `export interface UnionConnectionCounts { incomingPending: number }`.
- Produces: `UnionConnectionService.counts(userId: string): Promise<UnionConnectionCounts>`.
- Produces: authenticated `GET /union/connection-requests/counts`.
- Consumes: Prisma `unionConnectionRequest.count({ where: { toUserId, status: 'pending' } })`.

- [ ] **Step 1: Add a failing unit test for counts**

Create a Jest mock with only the Prisma methods used by each test and assert the exact query:

```ts
it('counts only incoming pending requests', async () => {
  prisma.unionConnectionRequest.count.mockResolvedValue(3);

  await expect(service.counts('user-1')).resolves.toEqual({
    incomingPending: 3,
  });
  expect(prisma.unionConnectionRequest.count).toHaveBeenCalledWith({
    where: { toUserId: 'user-1', status: 'pending' },
  });
});
```

- [ ] **Step 2: Run the focused test and verify red**

Run: `pnpm --filter @vedamatch/api test -- union-connection.service.spec.ts --runInBand`

Expected: FAIL because `service.counts` does not exist.

- [ ] **Step 3: Add the shared type and service method**

Append beside the connection request state types in `packages/shared/src/union.ts`:

```ts
export interface UnionConnectionCounts {
  incomingPending: number;
}
```

Import it in the service and implement:

```ts
async counts(userId: string): Promise<UnionConnectionCounts> {
  const incomingPending = await this.prisma.unionConnectionRequest.count({
    where: { toUserId: userId, status: 'pending' },
  });
  return { incomingPending };
}
```

- [ ] **Step 4: Publish the static counts route**

Place this route immediately after `list()` and before `@Patch(':id/...')` routes:

```ts
@Get('counts')
counts(@CurrentUser() user: AccessTokenPayload) {
  return this.connections.counts(user.sub);
}
```

- [ ] **Step 5: Run the focused test and typecheck API**

Run: `pnpm --filter @vedamatch/api test -- union-connection.service.spec.ts --runInBand`

Expected: PASS.

Run: `pnpm --filter @vedamatch/api exec tsc --noEmit`

Expected: exit code 0.

### Task 2: Backend Union Critical Behavior Tests

**Files:**
- Modify: `apps/api/src/modules/union/union-connection.service.spec.ts`
- Create: `apps/api/src/modules/union/union-chat.service.spec.ts`

**Interfaces:**
- Consumes: `create(fromUserId, body)`, `accept(userId, requestId)`, `decline(userId, requestId)`.
- Consumes: `getChat(userId, requestId)` and `sendMessage(userId, requestId, body)`.
- Produces: regression coverage only; production signatures remain unchanged.

- [ ] **Step 1: Test rejection of self-connections**

```ts
it('rejects a request to yourself', async () => {
  await expect(
    service.create('user-1', { toUserId: 'user-1' }),
  ).rejects.toThrow('Cannot send a request to yourself');
  expect(prisma.unionProfile.findUnique).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Test reverse pending auto-acceptance**

Use a reverse request fixture with `fromUserId: 'user-2'`, `toUserId: 'user-1'`, `status: 'pending'`; mock `findUnique` profile calls and `unionConnectionRequest.findUnique/update`. Assert update data is exactly `{ status: 'accepted', respondedAt: expect.any(Date) }` and returned DTO direction is `incoming`.

- [ ] **Step 3: Test accept/decline authorization and status**

Add table-driven tests that assert:

```ts
await expect(service.accept('stranger', 'request-1')).rejects.toThrow(
  'Not your request',
);
await expect(service.decline('recipient', 'request-1')).rejects.toThrow(
  'Only pending requests can be declined',
);
```

Also add happy-path cases asserting only the recipient can change a pending request and the saved statuses are `accepted` / `declined`.

- [ ] **Step 4: Test chat access rules**

In `union-chat.service.spec.ts`, provide connection fixtures with both included users and assert:

```ts
await expect(service.getChat('stranger', 'request-1')).rejects.toThrow(
  'Not your chat',
);
await expect(service.getChat('sender', 'request-1')).rejects.toThrow(
  'Chat is available only after a match',
);
```

For an accepted connection, assert sender and recipient can load the chat and `otherUser` is the opposite participant.

- [ ] **Step 5: Run both backend suites**

Run: `pnpm --filter @vedamatch/api test -- union-connection.service.spec.ts union-chat.service.spec.ts --runInBand`

Expected: all tests PASS.

### Task 3: Profile Visibility, Inactive Connections, And UTF-8

**Files:**
- Modify: `apps/api/src/modules/union/union-profile.service.ts`
- Create: `apps/api/src/modules/union/union-profile.service.spec.ts`
- Modify: `apps/web/src/components/union/union-profile-form.tsx`
- Create: `apps/web/src/components/union/union-profile-form.spec.tsx`
- Modify: `apps/web/src/components/union/recommendation-card.tsx`

**Interfaces:**
- Consumes/produces: `UnionProfileUpdateRequest.isActive?: boolean` already exists.
- Changes internal profile validation to omit `isActive` when absent on update, while create defaults to Prisma schema/default behavior.
- Keeps `getRecommendationForUser(userId, targetUserId)` available for an inactive target only when the connection status is `accepted`.
- Produces UI state `const [isActive, setIsActive] = useState(profile?.isActive ?? true)` and always sends it.

- [ ] **Step 1: Write failing profile service tests**

Cover these exact cases:

```ts
it('queries only active recommendation profiles', async () => {
  // mock own profile and empty results
  await service.getRecommendations('me');
  expect(prisma.unionProfile.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { isActive: true, userId: { not: 'me' } },
    }),
  );
});

it('does not update isActive when the field is omitted', async () => {
  await service.upsertProfile('me', validProfileBody);
  expect(prisma.$transaction).toHaveBeenCalled();
  expect(profileUpsert).toHaveBeenCalledWith(
    expect.objectContaining({
      update: expect.not.objectContaining({ isActive: expect.anything() }),
    }),
  );
});
```

Add an accepted-connection test where target profile has `isActive: false`; `getRecommendationForUser` must resolve. Add a non-connected inactive target test that still throws `Профиль не найден`.

- [ ] **Step 2: Write failing validation/privacy tests**

Assert intention total `99` throws `Сумма весов намерений должна быть 100, сейчас 99`. Assert an invalid privacy level throws `Недопустимое значение приватности: contacts`. Assert an unmatched recommendation has `contacts: null`, while an accepted connection exposes contacts unless privacy is `hidden`.

- [ ] **Step 3: Preserve omitted `isActive` in profile updates**

Change `validateProfileFields` to return a shape that may omit `isActive`, then add the field conditionally:

```ts
const data: Omit<Prisma.UnionProfileUncheckedCreateInput, 'userId'> = {
  about: body.about?.trim() || null,
  relocationReady: body.relocationReady ?? false,
  format: body.format ?? 'any',
  languages: this.cleanList(body.languages, 'Языки'),
  skills: this.cleanList(body.skills, 'Навыки'),
  interests: this.cleanList(body.interests, 'Интересы'),
  values: this.cleanList(body.values, 'Ценности'),
  familyStatus: body.familyStatus?.trim() || null,
  privacy: this.validatePrivacy(body.privacy),
};
if (body.isActive !== undefined) data.isActive = body.isActive;
return data;
```

Do not add a separate read/update gate based on `isActive`.

- [ ] **Step 4: Allow inactive cards for accepted connections**

Load `connectionBetween(userId, targetUserId)` before rejecting an inactive target and use:

```ts
if (!other || (!other.isActive && connection?.status !== 'accepted')) {
  throw new NotFoundException('Профиль не найден');
}
```

- [ ] **Step 5: Repair every mojibake string in the profile service**

Replace corrupted literals with these exact Russian strings:

```text
Укажите хотя бы одно намерение
Неизвестный тип намерения: ...
Тип намерения указан дважды: ...
Вес намерения должен быть целым числом от 0 до 100
Сумма весов намерений должна быть 100, сейчас ...
Поле «О себе» не длиннее 2000 символов
Недопустимый формат общения
Языки
Навыки
Интересы
Ценности
не более 30 значений
Недопустимое значение приватности: ...
```

Run: `rg -n 'Р.|С.' apps/api/src/modules/union apps/web/src/components/union`

Expected: no mojibake matches in user-facing Union strings after also changing the recommendation heading to `Контакты открыты`.

- [ ] **Step 6: Write the failing visibility toggle component test**

Mock `next/navigation`, `global.fetch`, render `UnionProfileForm`, uncheck `Показывать профиль в рекомендациях`, submit, and assert:

```ts
expect(fetch).toHaveBeenCalledWith(
  expect.stringEndingWith('/union/profile'),
  expect.objectContaining({
    method: 'PUT',
    body: expect.stringContaining('"isActive":false'),
  }),
);
```

- [ ] **Step 7: Add the visibility control and payload field**

Initialize state:

```ts
const [isActive, setIsActive] = useState(profile?.isActive ?? true);
```

Add this checkbox before the privacy fieldset and include `isActive` in `UnionProfileUpdateRequest`:

```tsx
<div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
  <label className="flex items-center gap-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">
    <input
      type="checkbox"
      checked={isActive}
      onChange={(event) => setIsActive(event.target.checked)}
      className="h-4 w-4 accent-amber-600"
    />
    Показывать профиль в рекомендациях
  </label>
  {!isActive && (
    <p className="mt-2 text-sm text-zinc-500">
      Профиль исчезнет из рекомендаций, но существующие связи и чаты останутся доступны.
    </p>
  )}
</div>
```

- [ ] **Step 8: Run profile backend and web tests**

Run: `pnpm --filter @vedamatch/api test -- union-profile.service.spec.ts --runInBand`

Expected: PASS.

Run after Task 4 installs Vitest: `pnpm --filter @vedamatch/web test -- union-profile-form.spec.tsx --run`

Expected: PASS.

### Task 4: Web Test Harness And Counts Helper

**Files:**
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/vitest.setup.ts`
- Modify: `apps/web/src/lib/union-api.ts`

**Interfaces:**
- Produces: `pnpm --filter @vedamatch/web test` mapped to `vitest`.
- Produces: `getUnionConnectionCounts(): Promise<UnionConnectionCounts | null>`.
- Consumes: `@/` alias mapped to `apps/web/src/`.

- [ ] **Step 1: Add current Vitest dependencies and script**

Use `apply_patch` to add the following dev dependencies to `apps/web/package.json`: `vitest@^4.1.6`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`, and `@testing-library/jest-dom`. Set:

```json
"test": "vitest"
```

Then run `pnpm install --lockfile-only` to synchronize `pnpm-lock.yaml`.

Expected: only `apps/web/package.json` and `pnpm-lock.yaml` dependency metadata changes.

- [ ] **Step 2: Configure jsdom and setup**

Create `apps/web/vitest.config.ts`:

```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./vitest.setup.ts",
  },
});
```

Create `apps/web/vitest.setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => cleanup());
```

- [ ] **Step 3: Add counts server helper**

Import `UnionConnectionCounts` and add:

```ts
export const getUnionConnectionCounts = () =>
  unionGet<UnionConnectionCounts>("/union/connection-requests/counts");
```

Callers must use `.catch(() => null)` because network/API errors must hide badges instead of failing pages.

- [ ] **Step 4: Smoke-test Vitest discovery**

Run: `pnpm --filter @vedamatch/web test -- --run`

Expected before component specs land: exit code 1 with `No test files found`; after Task 5 specs land: exit code 0.

### Task 5: Union Navigation And Root Portal Badge

**Files:**
- Create: `apps/web/src/components/union/union-nav.tsx`
- Create: `apps/web/src/components/union/union-nav.spec.tsx`
- Modify: `apps/web/src/app/union/page.tsx`
- Modify: `apps/web/src/app/union/recommendations/page.tsx`
- Modify: `apps/web/src/app/union/chats/[id]/page.tsx`
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/components/service-card.tsx`
- Create: `apps/web/src/components/service-card.spec.tsx`

**Interfaces:**
- Produces: `UnionNav({ incomingPending }: { incomingPending: number }): JSX.Element`.
- Changes: `ServiceCard({ service, badgeCount }: { service: ServiceCardType; badgeCount?: number })`.
- Consumes: `getUnionConnectionCounts().catch(() => null)` on server pages.

- [ ] **Step 1: Write failing badge tests**

Test `UnionNav` twice: `incomingPending={0}` must not render a count badge, `incomingPending={4}` must render `4` beside `Связи`. Test `ServiceCard` with `badgeCount={0}` and `badgeCount={2}` using accessible text `2 новых заявки`.

- [ ] **Step 2: Implement shared Union navigation**

Render links to `/union`, `/union/recommendations`, `/union/connections`; show the count only when positive:

```tsx
{incomingPending > 0 && (
  <span
    aria-label={`Входящих заявок: ${incomingPending}`}
    className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white"
  >
    {incomingPending}
  </span>
)}
```

Use neutral link styles matching existing amber/zinc UI.

- [ ] **Step 3: Integrate navigation into all Union routes**

For each existing Union page, fetch counts with:

```ts
const counts = await getUnionConnectionCounts().catch(() => null);
```

Prefer `Promise.all` when the page already makes independent calls. Render:

```tsx
<UnionNav incomingPending={counts?.incomingPending ?? 0} />
```

On chat pages replace the sole recommendations backlink with the shared navigation while preserving the page title.

- [ ] **Step 4: Add optional root service-card badge**

Place a red count bubble in the card header only when `(badgeCount ?? 0) > 0`. Keep all existing service flags and CTA behavior unchanged.

- [ ] **Step 5: Load root counts without breaking the portal**

Change the root `Promise.all` to include a caught counts request:

```ts
const [user, services, unionCounts] = await Promise.all([
  getProfile(),
  getServices(),
  getUnionConnectionCounts().catch(() => null),
]);
```

Pass the count only for the Union service:

```tsx
<ServiceCard
  key={service.id}
  service={service}
  badgeCount={service.url === "/union" ? unionCounts?.incomingPending : undefined}
/>
```

- [ ] **Step 6: Run badge tests**

Run: `pnpm --filter @vedamatch/web test -- union-nav.spec.tsx service-card.spec.tsx --run`

Expected: PASS.

### Task 6: Connections Page, Actions, And User Cards

**Files:**
- Create: `apps/web/src/components/union/connections-panel.tsx`
- Create: `apps/web/src/components/union/connections-panel.spec.tsx`
- Create: `apps/web/src/app/union/connections/page.tsx`
- Create: `apps/web/src/app/union/users/[id]/page.tsx`

**Interfaces:**
- Consumes: `UnionConnectionRequestsState`, `UnionConnectionRequestDto`.
- Produces: `ConnectionsPanel({ requests, loadError }: { requests: UnionConnectionRequestsState | null; loadError?: string | null })`.
- Produces: exported pure `buildAcceptedConnections(requests): UnionConnectionRequestDto[]` for deterministic testing.
- Calls: `PATCH /union/connection-requests/:id/accept` and `/decline` with cookies, then `router.refresh()`.

- [ ] **Step 1: Write failing pure grouping and tab tests**

Use incoming/outgoing fixtures with duplicate accepted request ids and assert:

```ts
expect(buildAcceptedConnections(requests).map((request) => request.id)).toEqual([
  "accepted-new",
  "accepted-old",
]);
```

The function must merge incoming/outgoing accepted entries, deduplicate by `id`, and sort descending by `respondedAt ?? createdAt`. Render the panel, click `Исходящие` and `Принятые`, and assert only the selected list is visible.

- [ ] **Step 2: Write failing action tests**

Mock `fetch` and `useRouter`. Click `Принять` and assert the accept URL, `{ method: "PATCH", credentials: "include" }`, disabled buttons while pending, and one `refresh()` after success. Repeat for `Отклонить`. Reject fetch and assert the selected tab remains active and the error appears near the list.

- [ ] **Step 3: Implement deterministic list helpers**

Inside the component module, implement:

```ts
export function buildAcceptedConnections(
  requests: UnionConnectionRequestsState,
): UnionConnectionRequestDto[] {
  const unique = new Map<string, UnionConnectionRequestDto>();
  for (const request of [...requests.incoming, ...requests.outgoing]) {
    if (request.status === "accepted") unique.set(request.id, request);
  }
  return [...unique.values()].sort(
    (left, right) =>
      Date.parse(right.respondedAt ?? right.createdAt) -
      Date.parse(left.respondedAt ?? left.createdAt),
  );
}
```

Sort incoming with `pending` first, then newest by date; keep outgoing newest first.

- [ ] **Step 4: Implement cards, tabs, and error states**

Each card displays avatar/fallback, name, city, formatted date, optional request message, and status label. Pending incoming cards show accept/decline; accepted cards link to `/union/chats/${request.id}`; every card links to `/union/users/${request.user.id}`.

Use these empty messages:

```text
Новых входящих заявок пока нет.
Исходящих заявок пока нет.
Принятых связей пока нет.
```

When `requests === null`, render only `Не удалось загрузить связи. Обновите страницу и попробуйте снова.` and do not render stale action buttons.

- [ ] **Step 5: Implement the SSR connections route**

Authenticate with `getProfile()` and `redirect('/login')`. Fetch full requests and counts independently; convert a full-list failure into `{ requests: null, loadError }`, while counts failure becomes zero. Render `Header`, `UnionNav`, the title `Связи Union`, and `ConnectionsPanel`.

- [ ] **Step 6: Implement the SSR user-card route**

Resolve async params, authenticate, and load `getUnionUserCard(id)` plus `getUnionConnectionCounts().catch(() => null)` in parallel. Call `notFound()` for a null card. Render `Header`, `UnionNav` with `counts?.incomingPending ?? 0`, and the existing `RecommendationCard` so connection/chat actions remain consistent.

- [ ] **Step 7: Run connections component tests**

Run: `pnpm --filter @vedamatch/web test -- connections-panel.spec.tsx --run`

Expected: PASS.

### Task 7: Integration Review And Verification

**Files:**
- Review all changed files; edit only to resolve integration/type/test failures.

**Interfaces:**
- Validates all earlier tasks as one build.

- [ ] **Step 1: Review shared diff and scan accidental overlap**

Run: `git status --short && git diff --stat && git diff -- packages/shared/src/union.ts apps/api/src/modules/union apps/web/src`

Expected: only planned Union/test-harness files plus the approved spec/plan.

- [ ] **Step 2: Scan for placeholders and mojibake**

Search the changed production files for unfinished marker comments, then inspect every changed Russian user-facing literal in the diff.

Run: `git diff -- apps/api/src/modules/union apps/web/src/app/union apps/web/src/components/union`

Expected: no unfinished marker comments and no mojibake in user-facing Union copy.

- [ ] **Step 3: Run all targeted API tests**

Run: `pnpm --filter @vedamatch/api test -- union-connection.service.spec.ts union-chat.service.spec.ts union-profile.service.spec.ts --runInBand`

Expected: all suites PASS.

- [ ] **Step 4: Run all web tests**

Run: `pnpm --filter @vedamatch/web test -- --run`

Expected: all suites PASS.

- [ ] **Step 5: Run TypeScript checks**

Run:

```bash
pnpm --filter @vedamatch/api exec tsc --noEmit
pnpm --filter @vedamatch/web exec tsc --noEmit
```

Expected: both exit code 0.

- [ ] **Step 6: Run targeted ESLint without auto-fix**

Run:

```bash
pnpm --filter @vedamatch/api exec eslint "src/modules/union/**/*.ts"
pnpm --filter @vedamatch/web exec eslint "src/app/union/**/*.{ts,tsx}" "src/components/union/**/*.{ts,tsx}" "src/app/page.tsx" "src/components/service-card.tsx"
```

Expected: exit code 0 with no errors.

- [ ] **Step 7: Run production build and diff checks**

Run:

```bash
pnpm build
git diff --check
```

Expected: production build succeeds and `git diff --check` prints nothing.

- [ ] **Step 8: Manual browser smoke test against local or preview server**

Verify authenticated flows at `/`, `/union`, `/union/recommendations`, `/union/connections`, one `/union/users/:id`, and one accepted `/union/chats/:id`. Confirm badges agree, zero hides them, accept/decline refreshes data, hidden profiles disappear from recommendations, and existing accepted connections/chats remain usable.
