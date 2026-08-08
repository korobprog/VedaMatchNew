# Motivation Admin: Manual Quotes + Sticky Review Actions

## Goal

Two independent usability improvements to `/admin/motivation`:

1. Let an admin add an exact quote by hand (bypassing AI discovery/verification) and have it flow through the same text/image review pipeline as AI-discovered quotes.
2. Stop review actions (Approve/Reject/Regenerate) from requiring a scroll to the bottom of a long card.

## A. Manual quote entry

### Data model

Add `manual` to `MotivationQuoteSourceType` (Prisma enum + `packages/shared/src/motivation.ts` union type). A manual quote is created with `verified: true` immediately — the admin typing it in is the verification step, unlike AI candidates which go through `QuoteVerificationService`.

### API

New endpoint `POST /admin/motivation/quotes`, admin-only (same `this.admin(role)` guard used elsewhere in `MotivationService`). Input (new shared type `MotivationManualQuoteInput`):

```ts
interface MotivationManualQuoteInput {
  originalText: string;
  originalLanguage: string; // 'ru' | 'en' | 'hi' | ...
  author: string;
  work: string;
  locator: string;
  sourceUrl?: string;
  contextExcerpt: string;
}
```

Service method `MotivationService.addManualQuote(role, input)`:

1. Validates required fields are non-empty (`BadRequestException` otherwise, mirroring `addSourceWatch`'s style).
2. Computes `normalizedHash` via the existing `quoteFingerprint(originalText)` (from `quote-normalizer.ts`) and rejects duplicates the same way `QuoteDiscoveryService.ingestCandidate` does (return existing / 409-style `BadRequestException` if a quote with that hash already exists).
3. Creates a `MotivationQuote` row: `sourceType: 'manual'`, `verified: true`, `discoveryDate: null`, `vedabaseBookSlug/vedabaseChapterSlug: null`, remaining fields from input.
4. Calls the existing `MotivationCopyService.prepareCandidate(quote.id)` — the exact same step `motivation-worker.service.ts` and `motivation-author-search.service.ts` already use to turn a verified quote into a `MotivationPost` draft (`reviewStatus: 'text_review'`). No new copy-generation logic; manual quotes join the same LLM-authored-explanation pipeline and the same review queue as AI-found ones.
5. Returns the created candidate (reuse the same DTO mapping `adminList` uses for a single post, or just return the post — the frontend calls `router.refresh()` and re-fetches the list, so the return value only needs to unblock the loading state).

### Frontend

New `ManualQuoteForm` component, rendered in `motivation-admin-watchlists.tsx`'s section alongside "Авторы для поиска" / "Источники (ссылки)" (same visual card style, `<section>` with heading "Добавить цитату вручную"). Fields: textarea for original text, language select (ru/en/hi), text inputs for author/work/locator, optional source URL, textarea for context excerpt. Submit button "Добавить в очередь", posts to `/admin/motivation/quotes`, on success clears the form and calls `router.refresh()` (same pattern as existing watchlist add actions). Client-side required-field validation only (matches existing forms in this file — no separate validation library).

Errors render inline under the form (same red-text pattern used elsewhere in `motivation-admin-controls.tsx`).

## B. Sticky review action panel

In `motivation-admin-controls.tsx`, both `QuoteReviewCard` and `ImageReviewCard` currently put their action row (`StyleSelect` + Approve/Reject buttons, `RejectControl`) as the last block inside the card, after all the quote/text/image content — requiring a scroll on long cards.

Change: wrap the action row (the `canReview && (...)` block) in a `sticky bottom-0` container with a background (`bg-white/95 dark:bg-zinc-900/95 backdrop-blur border-t`) so it stays pinned to the bottom of the viewport while the card is scrolled, instead of living at the literal end of the card's DOM flow. This requires no change to where the block sits in the card (still after the content) — `position: sticky` relative to the nearest scrolling ancestor keeps it visible without restructuring the list layout, and needs no new client state.

`RejectControl`'s textarea stays inside this sticky block; since it only appears after clicking "Отклонить", the block's height still changes but remains anchored to the bottom edge.

No change to `QuoteDetails`, polling, or the list/grid layout (`space-y-4` for text posts, `lg:grid-cols-2` for image posts) — this is a scoped visual fix to the two card components.

## Out of scope (explicitly deferred, per user's own list)

Keyboard shortcuts, autofocus-next-card, tab-title counter, "preview as feed" link. Not part of this change; can be separate follow-ups.

## Testing

- API: unit test for `MotivationService.addManualQuote` — creates quote + post, rejects duplicate hash, rejects missing fields, calls `prepareCandidate`.
- Web: component test for `ManualQuoteForm` — submits, shows validation error, calls refresh on success.
- Existing `motivation-admin-controls` and `motivation-admin-watchlists` component tests continue to pass; sticky panel is a pure CSS change with no new test beyond a quick manual/browser check that content isn't clipped.
- Full API and web test suites pass. Manual browser verification of both features against local dev stack.
