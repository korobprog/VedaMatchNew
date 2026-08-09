# Union Quick-Access Widget on the Dashboard — Design

## Context

The portal dashboard (`apps/web/src/app/page.tsx`) shows a grid of service
cards (`ServiceCard`). The "Знакомства" (Union) card currently only shows a
badge with the count of incoming connection requests. There's no way to see
chat activity, profile completeness, or fresh recommendations without opening
the Union section.

## Goal

Add a compact mini-widget inside the "Знакомства" card so a user can glance
at what needs attention — unread messages, new likes, profile completeness,
fresh matches — without leaving the dashboard.

## Layout

Single dense row placed between the card description and the "Открыть"
button (chosen visual direction "B" from the mockup review):

```
[💬 3] [❤️ 2]  ⓞⓞⓞ +12
▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░  (thin progress bar, no label)
```

- Left: activity chips (unread messages, incoming likes)
- Right, same row: a strip of up to 3 small circular avatars from fresh
  recommendations, plus a "+N" overflow count
- Below the row: a thin, unlabeled progress bar for profile completeness

The whole card stays a static block (only the "Открыть" button is a link),
consistent with today's `ServiceCard` — the widget is informational, not
interactive.

## Component structure

- New component: `apps/web/src/components/union/union-quick-access-widget.tsx`
  - Props: `unreadMessages: number`, `incomingLikes: number`,
    `previewAvatars: { url: string | null; initial: string }[]`,
    `moreCount: number`, `profileCompletionPercent: number | null`
  - Pure presentational — no data fetching, no client-side state
- `apps/web/src/components/service-card.tsx` gains an optional
  `extra?: ReactNode` prop, rendered between the description paragraph and
  the "Открыть"/"В разработке" button block
- `apps/web/src/app/page.tsx` passes
  `extra={service.url === "/union" ? <UnionQuickAccessWidget ... /> : undefined}`,
  mirroring the existing `badgeCount` conditional for the same card

## Data sources

All fetched in the existing `Promise.all` in `page.tsx`, alongside
`getProfile`, `getServices`, `getUnionConnectionCounts` — each new call
guarded with `.catch(() => null)` exactly like `unionCounts` is today:

| Data | Source | Used for |
|---|---|---|
| Unread messages | `getUnionChats()` → `unreadTotal` | 💬 chip |
| Incoming likes | `getUnionConnectionCounts()` → `incomingPending` | ❤️ chip (same value already used for the card's top-right badge — no new call) |
| Profile completeness | `getUnionProfileState()` → `completeness.percent` | progress bar |
| Fresh matches preview | `getUnionRecommendations({ sort: "new", pageSize: 3 })` → `items` (for avatars) and `total` (for "+N") | avatar strip |

## Conditional rendering rules

Nothing is ever shown as a zero or empty state — each piece appears only
when there's something to report:

- 💬 chip — only if `unreadMessages > 0`
- ❤️ chip — only if `incomingLikes > 0`
- Avatar strip — only if `total > 0` (recommendations exist); "+N" shown only
  when `N = total - items.length > 0`
- Progress bar — only if the user has a Union profile and
  `profileCompletionPercent < 100`
- If all four are empty/absent, `UnionQuickAccessWidget` returns `null` and
  the card renders exactly as it does today

## Error handling

Each of the four data calls is independently wrapped in `.catch(() => null)`
in `page.tsx`. A failure in any one of them only hides that piece of the
widget — it never breaks the dashboard page or the other three signals.

## Performance note

`getUnionRecommendations` computes compatibility scoring and is the
heaviest of the four calls; it now runs on every dashboard page load.
`pageSize: 3` bounds the work, but if this becomes a measurable load
concern, a follow-up could add a lighter endpoint that returns just
`total` + 3 avatar URLs without full compatibility scoring.

## Out of scope

- No new backend endpoints — all four data sources already exist
- No interactivity inside the widget (chips/avatars are not clickable;
  the whole card still opens via the "Открыть" button only)
- No changes to the badge shown at the top-right of the card (unchanged)
