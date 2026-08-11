# Union Goal Categories — Design

## Context

A Union profile declares what the person is looking for as four weights that
must add up to 100: `family`, `business`, `friendship`, `service`
(`packages/shared/src/union.ts`, `UnionIntentionDto`). The profile form asks
for them with four sliders and a running total —
`apps/web/src/components/union/intention-constructor.tsx`.

Those weights feed matching. `UnionMatchingService.intentionsScore` scores a
pair as `sum(min(myWeight, theirWeight))` and that score is 25% of overall
compatibility (`apps/api/src/modules/union/union-matching.service.ts:31`).

The recommendation filter exposes goals as a single-select dropdown
(`intention`), so a person can filter by one goal at a time and has no idea how
many profiles sit behind each one
(`apps/web/src/components/union/recommendation-filters.tsx:187`).

Two problems: distributing 100% is a demanding way to answer "what are you
looking for", and picking one goal blind is a poor way to browse.

## Goal

1. Checkboxes become the default way to state goals. The percentage sliders
   stay, but behind an explicit "fine tuning" toggle that is off by default.
2. The recommendation filter replaces the goal dropdown with multi-select chips
   that each carry a profile count, plus an "Все" chip that clears the goal
   selection without touching the other filters.

## Decisions

| Question | Decision |
|---|---|
| How checkboxes become weights | Split 100 evenly across the checked goals: 2 → 50/50, 3 → 34/33/33, 4 → 25 each |
| Storage model | Unchanged — four weights summing to 100 |
| Matching formula | Unchanged |
| What existing uneven profiles see | Fine tuning opens expanded, so nobody's priorities are silently flattened |
| What a new profile starts with | All four goals checked, 25 each — today's 40/20/20/20 default would open every newcomer straight into the sliders |
| Filter selection | Multi-select, OR between goals; the dropdown is removed rather than kept alongside |
| What the count means | Profiles that would be returned if that chip were the only goal selected, with every other active filter applied |
| Where counts come from | Computed during the same recommendation request |
| "Show all" button | An "Все" chip that clears goal selection only |

## Weights are an implementation detail, not a data change

Even weights keep the whole backend intact: the `sum = 100` validation
(`union-profile.service.ts:902`), the intention rows, and the matching formula
all stay as they are. Checkboxes are an input method that happens to produce
one particular shape of weights. Profiles saved earlier with uneven weights
remain valid and keep competing for matches unchanged. No migration.

The even split is integer-exact: give every checked goal `floor(100 / n)` and
hand the remainder to the goals in declaration order, so three goals produce
34/33/33 and never 33/33/33.

## Profile form

`intention-constructor.tsx` splits into three pieces under
`apps/web/src/components/union/`:

- `intention-picker.tsx` — the checkbox list. One goal must always stay
  checked; unchecking the last one is refused, matching the server's "Укажите
  хотя бы одно намерение".
- `intention-constructor.tsx` — the existing sliders, unchanged.
- `intention-section.tsx` — the wrapper that owns the toggle and decides what
  to show on open: sliders when the saved weights are uneven, checkboxes
  otherwise. Both children receive and return the same `IntentionWeights`, so
  the wrapper is the only place that knows which mode is active.

Switching modes:

- Checkboxes → sliders: current weights become the sliders' starting position.
- Sliders → checkboxes: weights are re-split evenly across the goals that
  currently have a non-zero weight. The toggle says so in a line of text next
  to it — losing a hand-tuned distribution must not be a surprise. The sliders
  allow a transient all-zero state that cannot be saved; leaving the mode from
  there falls back to all four goals checked, which is also what a brand-new
  profile starts with.

`union-profile-form.tsx` keeps its existing contract with the section: it holds
`weights`, saves when the sum is 100, and sends intentions on every request.
Checkbox edits always produce a sum of 100, so they always save immediately.
Its `toWeights` default for a profile that does not exist yet changes from
40/20/20/20 to 25 each — otherwise the uneven-weights rule would greet every
newcomer with the sliders this design is meant to hide.

## Filter and counts

### Contract

`UnionRecommendationFilters.intention?: UnionIntentionType` becomes
`intentions?: UnionIntentionType[]`. The server still accepts the old
`intention` query parameter as a single-element list — links and bookmarks to
filtered results already exist in the wild.

`UnionRecommendationsResponse` gains:

```ts
/** Сколько анкет вернулось бы по каждой цели при тех же остальных фильтрах. */
intentionCounts: Record<UnionIntentionType, number> & { all: number };
```

### Computing the counts

`getRecommendations` already loads every candidate and filters in memory
(`union-profile.service.ts:340`). The counts come from one extra pass over that
same in-memory list with the goal filter ignored: `all` is the size of that
list, and each goal's count is how many of those profiles carry the goal. No
extra database round trip, and the numbers cannot drift from the results
because they are derived from the same array.

A profile with three goals contributes to three counts, so the goal counts sum
to more than `all`. That is correct for an OR filter — each number answers
"what happens if I click this one".

### Query shape

Chips are checkboxes named `intentions` inside the existing GET form, so the
URL carries `?intentions=family&intentions=business`. Two places currently
assume one value per parameter and must handle arrays:

- `union-recommendations.controller.ts` `toFilters` reads `query.intention`
  from a `Record<string, string>`; it needs the array form.
- `apps/web/src/app/union/recommendations/page.tsx` `withPage` rebuilds the
  query string with `query.set(key, first)`, which would silently drop every
  goal but the first when paginating.

### UI

The `ЦЕЛЬ` dropdown is removed. In its place, a row of chips at the top of the
filter panel:

```
[ Все · 128 ]  [ Создание семьи · 64 ]  [ Бизнес и проекты · 30 ]
[ Дружба по интересам · 48 ]  [ Совместное служение · 22 ]
```

Each goal chip is a checkbox rendered as a chip. "Все" is not a fifth
category — it is a reset that unchecks the goal chips and leaves city, age,
gender and the rest alone. It renders as active exactly when no goal is
checked.

`RecommendationFilters` takes a new `intentionCounts` prop; the page passes it
from the recommendations response it already fetches.

## Error handling

Nothing new can fail. The counts are derived from data already in hand, so
there is no request to fail and no loading state. If a goal has zero matches
its chip shows `· 0` and stays clickable — clicking it lands on the existing
"Пока нет подходящих людей" empty state, which already explains what to loosen.

An unknown value in `intentions` is dropped by `normalizeFilters`, exactly as
an unknown `intention` is dropped today. All four values unchecked means the
same thing as "Все": no goal filter.

## Testing

Backend (`union-profile.service.spec.ts`, `union-recommendations` tests):

- Counts ignore the goal filter but respect the others — a city filter changes
  the numbers, selecting a goal does not.
- Several goals behave as OR.
- A profile with several goals is counted in each of them.
- The legacy `intention` parameter still filters.

Frontend:

- `intention-picker.spec.tsx` — n checked goals produce an even split summing
  to 100; the last checked goal cannot be unchecked.
- `intention-section.spec.tsx` — uneven saved weights open in slider mode; even
  weights open in checkbox mode; a profile that does not exist yet opens in
  checkbox mode with all four checked; leaving slider mode re-splits evenly
  across the non-zero goals.
- `recommendation-filters.spec.tsx` — chips render their counts; checking two
  goals submits both; "Все" clears the goals and keeps the city.
- `page.spec.tsx` (or the pagination helper's own test) — paginating preserves
  every selected goal.
