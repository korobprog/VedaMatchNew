# Community member counter

## Problem

The portal welcome header ("Добро пожаловать в VedaMatch, [Имя]") and the
guest landing page's stats row ("10K+ Пользователей") show no real signal
of platform size. The landing number is a hardcoded placeholder, not backed
by data.

## Goal

Show a real, live count of registered users in both places, presented with
a subtle count-up animation on load.

## Backend

### New public endpoint

`GET /stats/community` — **no auth guard**, since the landing page serves
logged-out guests.

Response:

```ts
type CommunityStats = {
  totalMembers: number;
};
```

`totalMembers` = `prisma.user.count()` — every registered account on the
portal, regardless of which service (Union, Vedabase, Motivation, ...) they
have or haven't set up. This matches the earlier decision in this
conversation: count all registered users, not just Union daters.

### Implementation

- New `StatsModule` / `StatsController` / `StatsService` under
  `apps/api/src/modules/stats/`.
- `StatsController` has no `@UseGuards(AuthGuard)` — this is the one
  intentionally public data endpoint in the API surface for this feature;
  keep it narrow (just the count, nothing per-user).
- `StatsService` caches the count in memory for 5 minutes
  (`{ value: number; expiresAt: number }` held on the service instance) so
  a burst of guest landing-page loads doesn't hit `user.count()` on every
  request. A cache miss/expiry re-queries and resets the TTL.
- Add `CommunityStats` to `packages/shared/src/` (alongside the other
  shared response types) so both API and web import the same type.

### Testing

- `StatsService` unit test: first call queries Prisma, second call within
  TTL returns the cached value without a second Prisma call, call after TTL
  expiry re-queries.
- `StatsController` test / e2e smoke: endpoint responds `200` with no
  `Authorization` header.

## Frontend

### Shared component: `MemberCounter`

New client component, e.g. `apps/web/src/components/member-counter.tsx`.

Props:

```ts
{ total: number; className?: string }
```

Behavior:

- On mount, animates from `0` to `total` over ~1.2s using
  `requestAnimationFrame` with a cubic ease-out curve (the "A. Плавный
  count-up" option approved during design).
- Formats the number with `total.toLocaleString('ru-RU')` at every frame
  (thousands separator matches the existing Russian-language UI).
- Respects `prefers-reduced-motion: reduce` — when set, renders the final
  number immediately with no animation (checked once on mount via
  `window.matchMedia`).
- Pure presentation component: no data fetching, no API calls. Callers pass
  `total` as a prop.

### Portal page (`apps/web/src/app/page.tsx`)

- Add `getCommunityStats()` to the existing `Promise.all([...])` fetch list
  (new function in `apps/web/src/lib/api.ts`, calls `GET /stats/community`,
  `.catch(() => null)` like the other calls in this file).
- Render a new line directly under the welcome paragraph
  ([page.tsx:68-70](../../../apps/web/src/app/page.tsx)):

  ```
  Вместе нас: <MemberCounter total={stats.totalMembers} />
  ```

- If the fetch failed (`stats === null`), the line is omitted entirely —
  no fallback text, no zero.

### Landing page (`apps/web/src/components/landing/LandingPage.tsx`)

- `LandingPage` is a `"use client"` component and does not fetch data
  itself; `totalMembers?: number` is added as a new prop, populated by
  `apps/web/src/app/page.tsx` the same way `plan` already is today (fetched
  server-side, passed down).
- The guest branch in `page.tsx` currently only fetches `plan` before
  falling back to `<LandingPage>` when `!user || !services`. Add the same
  `getCommunityStats().catch(() => null)` call there (in parallel with the
  `plan` fetch) and pass the result down.
- In the stats row ([LandingPage.tsx:113-116](../../../apps/web/src/components/landing/LandingPage.tsx)),
  the first stat block ("10K+ / Пользователей") is replaced:
  - If `totalMembers` is present: `<MemberCounter total={totalMembers} />`
    with the same "Пользователей" label underneath.
  - If it's missing (fetch failed): fall back to a neutral label with no
    number — reuse the existing "Пользователей" wording without inventing
    a substitute number, so the layout doesn't shift and no invented stat
    is shown.
- The other two stats ("500+ Совпадений", "98% Довольных") are unchanged —
  out of scope for this feature.

### Testing

- `MemberCounter` component test: renders the final formatted value;
  with `prefers-reduced-motion` mocked to `reduce`, renders the final value
  immediately without going through intermediate frames.
- Existing snapshot/rendering tests for the portal header and landing
  stats row, if any, updated to account for the new line/component.

## Out of scope

- Real-time/live-updating count (e.g. via websocket) — the count is
  fetched once per page load, not pushed.
- Per-service breakdowns (Union members vs Vedabase readers, etc.).
- Changing the other two landing stats ("Совпадений", "Довольных").
- A "boosted" or inflated display number — this feature always shows the
  real `user.count()`, per the explicit decision in this conversation.
