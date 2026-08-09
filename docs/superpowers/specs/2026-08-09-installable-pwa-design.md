# Installable VedaMatch PWA — Design

## Context

The portal (`apps/web`) is a single Next.js 16 App Router application behind
one domain. A PWA already exists, but only for the library section:

- `apps/web/public/vedabase.webmanifest` — `scope: "/vedabase/"`,
  `start_url: "/vedabase"`
- `apps/web/public/vedabase/sw.js` — shell cache + offline navigation fallback
- `apps/web/src/lib/vedabase/register-service-worker.ts` — registration and
  cache clearing, called from `components/vedabase/sync-status.tsx` and
  `components/logout-button.tsx`
- the manifest is linked only from `apps/web/src/app/vedabase/layout.tsx` via
  `metadata.manifest`

Downloaded books live in IndexedDB (`lib/vedabase/local-db.ts`,
`lib/vedabase/book-storage.ts`), **not** in Cache Storage. The service worker
only caches the shell: `/_next/static/`, `/vedabase/offline`, the manifest and
the logo. Offline reading works like this: on a failed navigation under
`/vedabase/*` the worker serves the `/vedabase/offline` shell, and
`components/vedabase/offline-router.tsx` parses `window.location.pathname` and
renders the library or the reader from IndexedDB.

## Goal

Let a user install VedaMatch as an app on their phone: an icon on the home
screen, a standalone window, and a usable offline shell for the whole portal.

Push notifications are explicitly **out of scope** for this spec. There is no
notification infrastructure in `apps/api` at all (no subscription model, no
VAPID config, no sending service), so push is its own subsystem and gets its
own spec on top of the service worker delivered here.

## Decisions

| Question | Decision |
|---|---|
| One app or two? | **One.** A single manifest and a single service worker scoped to `/`. Vedabase becomes a section inside it. |
| Separate Vedabase icon? | Replaced by a manifest `shortcuts` entry. |
| Icon artwork | Derived from the existing logo, wordmark removed. |
| Where do we offer install? | Dismissible banner on the dashboard **and** the landing page, plus a permanent entry in the profile. |
| Offline depth | Shell only for the portal. Vedabase offline reading is preserved exactly as it works today. |

### Why one app and not two

Two service workers can legally coexist on one origin — the narrowest matching
scope wins — but it costs more than it returns:

- a root worker would **not** control `/vedabase/*`, so offline logic would
  have to be written and maintained twice;
- push subscriptions are bound to a *registration*. Two workers means two
  possible subscriptions per user and a backend that has to decide which one to
  send to. Since push is the next spec, this cost is real, not hypothetical;
- which app gets installed would depend on which page the user pressed
  "Install" from, which is invisible to them.

The cost of merging is losing a standalone library icon. A `shortcuts` entry
covers most of that need on Android.

## Manifest and icons

Replace the static `public/vedabase.webmanifest` with `app/manifest.ts`. Next
serves it at `/manifest.webmanifest`, applies the
`application/manifest+json` content type, and injects `<link rel="manifest">`
itself. The file is only picked up at the app root.

```ts
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "VedaMatch",
    short_name: "VedaMatch",
    description: "Единый вход во все сервисы VedaMatch",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#FBF9FF",
    theme_color: "#FBF9FF",
    icons: [/* the four entries from the icon set below */],
    shortcuts: [
      { name: "Библиотека", url: "/vedabase" },
      { name: "Знакомства", url: "/union" },
    ],
  };
}
```

`background_color` and `theme_color` use the light-theme `--vm-bg-0`
(`#FBF9FF`, `globals.css:72`). The manifest carries a single static colour; the
per-scheme `<meta name="theme-color">` already declared in
`app/layout.tsx` (`viewport.themeColor`) keeps working inside the app.

Remove `manifest: "/vedabase.webmanifest"` from `app/vedabase/layout.tsx`.
A route-level `metadata.manifest` overrides the root one, so leaving it would
point library pages back at the old scope.

### Icon set

`public/logo_tilak.png` is 1024×1024 but unusable as-is: the background is
transparent (iOS composites it onto black), the "VEDA MATCH" wordmark is
illegible below ~96 px, and the mark runs to the edges — a maskable crop keeps
only the inner 80% and would slice the wordmark and the outer legs of the "M".
The current Vedabase manifest declares one file as `"any maskable"`, which is
exactly this mistake.

A generation script (`apps/web/scripts/generate-icons.mjs`, run manually, output
committed) produces from the logo, with the wordmark cropped out:

| File | Purpose | Notes |
|---|---|---|
| `public/icons/icon-192.png` | `any` | mark with padding, opaque background |
| `public/icons/icon-512.png` | `any` | same |
| `public/icons/icon-maskable-192.png` | `maskable` | mark inside the inner 80%, background bleeds to the edge |
| `public/icons/icon-maskable-512.png` | `maskable` | same |
| `app/apple-icon.png` | iOS home screen | 180×180, Next file convention, emits `<link rel="apple-touch-icon">` |

`any` and `maskable` are separate entries. One file serving both roles is bad
at both.

The `apple-icon.png` is not optional: iOS does not read icons from the
manifest.

## Service worker

One `public/sw.js` with `scope: "/"`, registered from the root layout for
every route rather than from a Vedabase component.

`fetch` handling:

| Request | Behaviour |
|---|---|
| Navigation under `/vedabase/*`, network fails | Serve the `/vedabase/offline` shell — **carried over unchanged** |
| Any other navigation, network fails | Serve `/offline` |
| `/_next/static/*`, icons, manifest | Cache-first |
| Everything else, including all API responses | Not cached at all |

Nothing user-specific is written to disk, so there is no cross-account leak to
clean up on logout or account switch.

New route `app/offline/page.tsx`: a static page with no personal data,
precached on install alongside the Vedabase shell.

### Migration off the old worker

This is the riskiest part. A worker scoped to `/` will **not** take control of
`/vedabase/*` while the `/vedabase/sw.js` registration is alive — the narrower
scope wins. So registration runs in order:

1. `navigator.serviceWorker.getRegistration("/vedabase/")` → `unregister()`
2. delete all caches whose name starts with `vedamatch-vedabase-`
3. register `/sw.js` with `scope: "/"`

For a user who already installed Vedabase this happens on their first online
visit after the release. IndexedDB is untouched, so downloaded books survive
the migration and are not re-downloaded.

### Middleware

`apps/web/src/proxy.ts` redirects unauthenticated requests to the landing page.
Its matcher excludes `_next`, `favicon.ico` and image extensions, but not `.js`
or `.webmanifest`. Update `publicFiles`:

- add `/sw.js`, `/manifest.webmanifest`, `/offline`
- remove `/vedabase/sw.js` and `/vedabase.webmanifest`

Without this a guest gets a redirect instead of the worker, and installation
breaks for exactly the people who have not signed in yet.

## Install UI

All platform branching lives in one pure module, `lib/pwa/platform.ts`:

```ts
type InstallMode = "installed" | "can-prompt" | "ios-manual" | "unsupported";

function detectInstallMode(input: {
  matchMedia: (q: string) => { matches: boolean };
  navigator: { standalone?: boolean; userAgent: string };
  promptEvent: unknown | null;
}): InstallMode;
```

`installed` is `(display-mode: standalone)` matching or `navigator.standalone`
being true. `can-prompt` means a captured `beforeinstallprompt` event is
available. `ios-manual` is iOS/iPadOS Safari, where that event does not exist
and installation is manual. Everything else is `unsupported`.

Components render from that state and hold no platform logic of their own, in
`components/pwa/`:

| Component | Role |
|---|---|
| `install-banner.tsx` | Bottom-of-screen card, mobile widths only, hidden when `installed` or dismissed. The close button records the dismissal in `localStorage`; once dismissed the banner never returns. |
| `install-button.tsx` | "Установить приложение" entry in the profile. Triggers the system dialog on `can-prompt`, opens the instructions on `ios-manual`. Always present, so a user who dismissed the banner can still find it. |
| `ios-install-instructions.tsx` | "Поделиться → На экран „Домой"" steps. |
| `service-worker-registrar.tsx` | Client component in the root layout: runs the migration, then registers `/sw.js`. |

Insertion points: `app/page.tsx` (dashboard branch), the landing page, and
`app/profile/page.tsx`. Same components in each place.

### Capturing `beforeinstallprompt`

Chrome fires this event once and early — sometimes before React hydrates. A
listener attached in `useEffect` can miss it, leaving a dead install button in
an otherwise healthy app.

So capture it from a `next/script` with `strategy="beforeInteractive"` in the
root layout: the script calls `preventDefault()` and stashes the event on a
global. The hook reads that global on mount, and also subscribes to later
`beforeinstallprompt` and to `appinstalled`.

The comment in `app/layout.tsx` about avoiding inline scripts concerns
`<script>` inside the component tree and theme flashing; `beforeInteractive` is
injected into the document by Next and is the intended mechanism here.

## Testing

Unit (vitest, matching existing `*.spec.tsx` conventions):

- `detectInstallMode` as a table over the four states
- dismissal persistence
- `install-banner` rendering across states

Existing specs that change with the code: `components/logout-button.spec.tsx`
and the `sync-status` registration path — cache clearing moves from a
Vedabase-specific helper to a shared one, and registration moves to the root
layout.

The worker itself is not unit-tested. `public/sw.js` does not go through the
bundler, so any unit test would exercise a copy of the logic rather than the
shipped file. It is covered end-to-end with Playwright, already configured in
the app:

- context offline → navigate to `/union` → the `/offline` page renders
- context offline → navigate to `/vedabase` → the reader shell renders

The second case is the regression guard for offline book reading.

### Manual checks before release

- install on Android (Chrome) and iOS (Safari)
- icon appearance on the home screen under both circular and square masks
- migration: a device with the old Vedabase app installed, updated to this
  release — the old worker is gone, one worker remains, downloaded books still
  open offline

## Out of scope

- Push notifications (own spec)
- Caching authenticated pages or API responses
- A separate installable Vedabase app
