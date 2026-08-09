# Installable VedaMatch PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the whole VedaMatch portal installable as one app on a phone — one manifest, one service worker, an install UI — without breaking Vedabase offline reading.

**Architecture:** The Vedabase-scoped PWA is merged into an app-wide one. `app/manifest.ts` replaces `public/vedabase.webmanifest`; a single `public/sw.js` scoped to `/` replaces `public/vedabase/sw.js` and keeps the `/vedabase/offline` fallback verbatim; registration moves from a Vedabase component to the root layout and first retires the old worker. Platform branching for the install UI lives in one pure module so it can be tested as a table.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, vitest + @testing-library/react, Playwright, sharp (icon generation).

**Spec:** `docs/superpowers/specs/2026-08-09-installable-pwa-design.md`

## Global Constraints

- All work happens in `apps/web`. Run commands from `apps/web` unless stated otherwise.
- Unit tests: `pnpm test` (vitest, `dir: "./src"` — **every unit test must live under `apps/web/src`**).
- Vitest runs in ESM: use `fileURLToPath(new URL(..., import.meta.url))`, never `__dirname`.
- The localStorage key `vedabase:activeUserId` **must keep that exact string value**. `e2e/auth-state.ts` seeds it and `components/vedabase/offline-router.tsx` reads it; changing it breaks offline reading and the e2e suite.
- Offline reading of downloaded books must keep working. Books live in IndexedDB and must never be cleared by this work.
- No API response and no authenticated HTML may be written to Cache Storage.
- UI copy is Russian, matching the surrounding code.
- Manifest colours: `background_color` and `theme_color` are `#FBF9FF` (the light `--vm-bg-0` from `src/app/globals.css:72`).
- Cache naming: current caches use the prefix `vedamatch-shell-`; the retired Vedabase caches use `vedamatch-vedabase-`.

---

### Task 1: Manifest and icon set

**Files:**
- Create: `apps/web/scripts/generate-icons.mjs`
- Create: `apps/web/public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-192.png`, `icon-maskable-512.png` (generated)
- Create: `apps/web/src/app/apple-icon.png` (generated)
- Create: `apps/web/src/app/manifest.ts`
- Test: `apps/web/src/app/manifest.spec.ts`
- Modify: `apps/web/src/app/vedabase/layout.tsx` (drop `manifest`)
- Modify: `apps/web/package.json` (add `sharp` devDependency)
- Delete: `apps/web/public/vedabase.webmanifest`

**Interfaces:**
- Consumes: nothing.
- Produces: `/manifest.webmanifest` served by Next; icon files at `/icons/icon-192.png`, `/icons/icon-512.png`, `/icons/icon-maskable-192.png`, `/icons/icon-maskable-512.png`. Task 3 precaches `/manifest.webmanifest` and `/icons/icon-192.png`.

- [ ] **Step 1: Add sharp as a devDependency**

```bash
pnpm --filter @vedamatch/web add -D sharp@0.34.5
```

- [ ] **Step 2: Write the icon generation script**

The crop box below was measured from `public/logo_tilak.png` (1024×1024): the mark occupies x 247–793 / y 308–798, and the "VEDA MATCH" wordmark is a separate band at y 856–918. The square below is centred on the mark and stops at y 827, so the wordmark is excluded by construction.

Create `apps/web/scripts/generate-icons.mjs`:

```js
// Генератор иконок PWA из логотипа. Запуск: node scripts/generate-icons.mjs
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "public/logo_tilak.png");
const iconsDir = path.join(root, "public/icons");
const appDir = path.join(root, "src/app");

// Квадрат вокруг знака (глобус + «M») в logo_tilak.png, измерен по альфа-каналу.
// Надпись «VEDA MATCH» лежит ниже (y 856..918) и в кроп не попадает.
const MARK = { left: 246, top: 279, width: 548, height: 548 };
const BACKGROUND = { r: 0xfb, g: 0xf9, b: 0xff, alpha: 1 };

// «any» оставляет поля; «maskable» обязан пережить обрезку до внутренних 80%,
// поэтому знак там рисуется мельче.
const ANY_RATIO = 0.76;
const MASKABLE_RATIO = 0.6;

async function render(size, ratio, outputPath) {
  const markSize = Math.round(size * ratio);
  const offset = Math.round((size - markSize) / 2);
  const mark = await sharp(source)
    .extract(MARK)
    .resize(markSize, markSize)
    .png()
    .toBuffer();
  const image = await sharp({
    create: { width: size, height: size, channels: 4, background: BACKGROUND },
  })
    .composite([{ input: mark, left: offset, top: offset }])
    .png()
    .toBuffer();
  await writeFile(outputPath, image);
  console.log(`Wrote ${path.relative(root, outputPath)} (${size}x${size})`);
}

await mkdir(iconsDir, { recursive: true });
await render(192, ANY_RATIO, path.join(iconsDir, "icon-192.png"));
await render(512, ANY_RATIO, path.join(iconsDir, "icon-512.png"));
await render(192, MASKABLE_RATIO, path.join(iconsDir, "icon-maskable-192.png"));
await render(512, MASKABLE_RATIO, path.join(iconsDir, "icon-maskable-512.png"));
await render(180, ANY_RATIO, path.join(appDir, "apple-icon.png"));
```

- [ ] **Step 3: Generate the icons**

Run from `apps/web`: `node scripts/generate-icons.mjs`
Expected: five `Wrote ...` lines, no errors.

- [ ] **Step 4: Look at the generated icons**

Open `public/icons/icon-512.png` and `public/icons/icon-maskable-512.png`. Confirm: no wordmark, opaque light background, and in the maskable one the mark is clearly inside the middle 80% (imagine a circle touching the edges — nothing important may cross it). If the mark looks cramped or lost, adjust `ANY_RATIO`/`MASKABLE_RATIO` and re-run.

- [ ] **Step 5: Write the failing test**

Create `apps/web/src/app/manifest.spec.ts`:

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import manifest from "./manifest";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(appDir, "../../public");

function pngSize(file: string): { width: number; height: number } {
  const buffer = readFileSync(file);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

describe("manifest", () => {
  it("scopes the app to the whole portal", () => {
    const result = manifest();

    expect(result.id).toBe("/");
    expect(result.scope).toBe("/");
    expect(result.start_url).toBe("/");
    expect(result.display).toBe("standalone");
  });

  it("ships separate any and maskable icons that exist at the declared size", () => {
    const icons = manifest().icons ?? [];

    expect(icons.filter((icon) => icon.purpose === "any")).toHaveLength(2);
    expect(icons.filter((icon) => icon.purpose === "maskable")).toHaveLength(2);

    for (const icon of icons) {
      const file = path.join(publicDir, icon.src!);
      const [declared] = icon.sizes!.split("x");
      expect(pngSize(file)).toEqual({
        width: Number(declared),
        height: Number(declared),
      });
    }
  });

  it("keeps a shortcut into the library and into Union", () => {
    const urls = (manifest().shortcuts ?? []).map((shortcut) => shortcut.url);

    expect(urls).toEqual(["/vedabase", "/union"]);
  });

  it("provides an apple touch icon, which iOS needs outside the manifest", () => {
    expect(pngSize(path.join(appDir, "apple-icon.png"))).toEqual({
      width: 180,
      height: 180,
    });
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `pnpm test -- manifest`
Expected: FAIL — `Failed to resolve import "./manifest"`.

- [ ] **Step 7: Write the manifest**

Create `apps/web/src/app/manifest.ts`:

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
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "Библиотека", short_name: "Библиотека", url: "/vedabase" },
      { name: "Знакомства", short_name: "Знакомства", url: "/union" },
    ],
  };
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `pnpm test -- manifest`
Expected: PASS, 4 tests.

- [ ] **Step 9: Remove the route-level manifest override**

A `metadata.manifest` on a nested layout overrides the root one, which would point library pages back at the old scope. Edit `apps/web/src/app/vedabase/layout.tsx` — delete the `manifest: "/vedabase.webmanifest",` line so it reads:

```ts
export const metadata: Metadata = {
  title: "Vedabase",
  description: "Офлайн-библиотека ведических книг VedaMatch",
};
```

- [ ] **Step 10: Delete the old manifest file**

```bash
git rm apps/web/public/vedabase.webmanifest
```

- [ ] **Step 11: Commit**

```bash
git add apps/web/scripts/generate-icons.mjs apps/web/public/icons apps/web/src/app/apple-icon.png apps/web/src/app/manifest.ts apps/web/src/app/manifest.spec.ts apps/web/src/app/vedabase/layout.tsx apps/web/package.json pnpm-lock.yaml
git commit -m "feat(pwa): add an app-wide manifest and a generated icon set"
```

---

### Task 2: Let guests reach the worker, manifest and offline shells

**Files:**
- Modify: `apps/web/src/proxy.ts:11-16`
- Test: `apps/web/src/proxy.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `/sw.js`, `/manifest.webmanifest`, `/offline`, `/vedabase/offline` reachable without an `access_token` cookie. Task 3 depends on this — `cache.addAll` fails as a whole if any precached request is redirected to the landing page.

- [ ] **Step 1: Write the failing test**

Add to `apps/web/src/proxy.spec.ts`, inside the existing `describe("proxy", ...)`:

```ts
  it("serves the worker, manifest and offline shells to guests", () => {
    for (const path of [
      "/sw.js",
      "/manifest.webmanifest",
      "/offline",
      "/vedabase/offline",
    ]) {
      const response = proxy(new NextRequest(`https://vedamatch.ru${path}`));

      expect(response.headers.get("location"), path).toBeNull();
    }
  });

  it("still guards the library itself", () => {
    const response = proxy(new NextRequest("https://vedamatch.ru/vedabase"));

    expect(response.headers.get("location")).toBe(
      "https://vedamatch.ru/?returnTo=%2Fvedabase",
    );
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- proxy`
Expected: FAIL on `/sw.js` — a redirect to the landing page is returned.

- [ ] **Step 3: Update the public file list**

Edit `apps/web/src/proxy.ts`, replacing the `publicFiles` set:

```ts
// Воркер, манифест и офлайн-оболочки обязаны отдаваться и гостю: без них
// приложение не устанавливается и не кэшируется при первом визите.
const publicFiles = new Set([
  "/gitabase",
  "/sw.js",
  "/manifest.webmanifest",
  "/offline",
  "/vedabase/offline",
]);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- proxy`
Expected: PASS, all tests in the file.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/proxy.ts apps/web/src/proxy.spec.ts
git commit -m "feat(pwa): expose the worker, manifest and offline shells to guests"
```

---

### Task 3: One service worker for the whole portal

**Files:**
- Create: `apps/web/src/app/offline/page.tsx`
- Create: `apps/web/public/sw.js`
- Create: `apps/web/src/lib/pwa/service-worker.ts`
- Test: `apps/web/src/lib/pwa/service-worker.spec.ts`
- Create: `apps/web/src/components/pwa/service-worker-registrar.tsx`
- Modify: `apps/web/src/app/layout.tsx`
- Modify: `apps/web/src/components/vedabase/sync-status.tsx:4,41`
- Modify: `apps/web/src/components/vedabase/offline-router.tsx:6`
- Modify: `apps/web/src/components/logout-button.tsx:7-10,37-40`
- Modify: `apps/web/src/components/logout-button.spec.tsx`
- Delete: `apps/web/public/vedabase/sw.js`, `apps/web/src/lib/vedabase/register-service-worker.ts`

**Interfaces:**
- Consumes: `/manifest.webmanifest` and `/icons/icon-192.png` from Task 1; the public paths from Task 2.
- Produces:
  - `lib/pwa/service-worker.ts` exports `activeUserKey: string` (value `"vedabase:activeUserId"`), `registerAppServiceWorker(userId?: string): Promise<ServiceWorkerRegistration | null>`, `retireLegacyVedabaseWorker(): Promise<void>`, `clearOfflineCaches(): Promise<void>`.
  - `components/pwa/service-worker-registrar.tsx` exports `ServiceWorkerRegistrar`, rendered in the root layout.
  - Route `/offline` with the heading "Нет подключения" (Task 8 asserts on it).

- [ ] **Step 1: Create the portal offline page**

Create `apps/web/src/app/offline/page.tsx`. It must contain no personal data — it is precached and served to anyone.

```tsx
export const metadata = {
  title: "Нет подключения — VedaMatch",
};

export default function OfflinePage() {
  return (
    <main className="grid min-h-screen place-items-center bg-bg-0 px-4">
      <section className="glass max-w-md rounded-2xl border border-glass-brd p-6 text-center">
        <h1 className="font-display text-xl font-bold text-text-0">
          Нет подключения
        </h1>
        <p className="mt-3 text-sm text-text-1">
          Этот раздел недоступен без сети. Скачанные книги можно читать в
          библиотеке — они хранятся на устройстве.
        </p>
        <a
          href="/vedabase"
          className="mt-6 inline-block rounded-xl border border-glass-brd px-4 py-3 text-sm font-medium text-text-1 transition hover:text-text-0"
        >
          Открыть библиотеку
        </a>
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Write the merged service worker**

Create `apps/web/public/sw.js`. The `/vedabase` navigation branch is carried over from the old worker unchanged — it is what makes offline book reading work.

```js
const CACHE_PREFIX = "vedamatch-shell-";
const CACHE_NAME = `${CACHE_PREFIX}v1`;
// Кэши старого воркера Vedabase: удаляем при активации.
const LEGACY_CACHE_PREFIX = "vedamatch-vedabase-";
const PORTAL_SHELL = "/offline";
const VEDABASE_SHELL = "/vedabase/offline";
const PRE_CACHE = [
  PORTAL_SHELL,
  VEDABASE_SHELL,
  "/manifest.webmanifest",
  "/icons/icon-192.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRE_CACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter(
              (name) =>
                (name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME) ||
                name.startsWith(LEGACY_CACHE_PREFIX),
            )
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Навигацию всегда ведём в сеть: страницы портала персональные и в кэш не
  // попадают. Без сети отдаём оболочку — для библиотеки свою, она умеет
  // читать книги из IndexedDB.
  if (request.mode === "navigate") {
    const shell = url.pathname.startsWith("/vedabase")
      ? VEDABASE_SHELL
      : PORTAL_SHELL;
    event.respondWith(fetch(request).catch(() => caches.match(shell)));
    return;
  }

  if (!isCacheableAsset(url.pathname)) return;
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});

function isCacheableAsset(pathname) {
  return (
    pathname.startsWith("/_next/static/") ||
    pathname.startsWith("/icons/") ||
    pathname === PORTAL_SHELL ||
    pathname === VEDABASE_SHELL ||
    pathname === "/manifest.webmanifest"
  );
}
```

- [ ] **Step 3: Write the failing test for the registration module**

Create `apps/web/src/lib/pwa/service-worker.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  activeUserKey,
  clearOfflineCaches,
  registerAppServiceWorker,
  retireLegacyVedabaseWorker,
} from "./service-worker";

function stubCaches(names: string[]) {
  const deleted: string[] = [];
  vi.stubGlobal("caches", {
    keys: vi.fn().mockResolvedValue(names),
    delete: vi.fn(async (name: string) => {
      deleted.push(name);
      return true;
    }),
  });
  return deleted;
}

describe("service worker registration", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("keeps the storage key the offline reader and e2e setup rely on", () => {
    expect(activeUserKey).toBe("vedabase:activeUserId");
  });

  it("retires the old vedabase worker before registering the root one", async () => {
    const order: string[] = [];
    const unregister = vi.fn(async () => {
      order.push("unregister");
      return true;
    });
    const register = vi.fn(async () => {
      order.push("register");
      return {} as ServiceWorkerRegistration;
    });
    vi.stubGlobal("navigator", {
      serviceWorker: {
        getRegistration: vi.fn(async () => ({
          scope: "https://vedamatch.ru/vedabase/",
          unregister,
        })),
        register,
      },
    });

    await registerAppServiceWorker("user-1");

    expect(order).toEqual(["unregister", "register"]);
    expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/" });
    expect(localStorage.getItem(activeUserKey)).toBe("user-1");
  });

  it("does not unregister the root worker when the old one is already gone", async () => {
    const unregister = vi.fn();
    vi.stubGlobal("navigator", {
      serviceWorker: {
        getRegistration: vi.fn(async () => ({
          scope: "https://vedamatch.ru/",
          unregister,
        })),
        register: vi.fn(),
      },
    });

    await retireLegacyVedabaseWorker();

    expect(unregister).not.toHaveBeenCalled();
  });

  it("clears both current and legacy caches, leaving unrelated ones alone", async () => {
    const deleted = stubCaches([
      "vedamatch-shell-v1",
      "vedamatch-vedabase-shell-v1",
      "some-other-cache",
    ]);

    await clearOfflineCaches();

    expect(deleted).toEqual(["vedamatch-shell-v1", "vedamatch-vedabase-shell-v1"]);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm test -- service-worker`
Expected: FAIL — `Failed to resolve import "./service-worker"`.

- [ ] **Step 5: Write the registration module**

Create `apps/web/src/lib/pwa/service-worker.ts`:

```ts
// Ключ хранит id пользователя для офлайн-читалки. Значение менять нельзя:
// его же пишет e2e-подготовка и читает components/vedabase/offline-router.tsx.
export const activeUserKey = "vedabase:activeUserId";

const legacyScope = "/vedabase/";
const cacheNamePrefix = "vedamatch-";

export async function registerAppServiceWorker(
  userId?: string,
): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  if (userId) localStorage.setItem(activeUserKey, userId);
  await retireLegacyVedabaseWorker();
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

// Воркер со scope "/" не получит контроль над /vedabase/*, пока жива старая
// регистрация: при совпадении выигрывает более узкий scope.
export async function retireLegacyVedabaseWorker(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration(legacyScope);
  if (!registration?.scope.endsWith(legacyScope)) return;
  await registration.unregister();
}

export async function clearOfflineCaches(): Promise<void> {
  if (typeof caches === "undefined") return;
  const names = await caches.keys();
  await Promise.all(
    names
      .filter((name) => name.startsWith(cacheNamePrefix))
      .map((name) => caches.delete(name)),
  );
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm test -- service-worker`
Expected: PASS, 4 tests.

- [ ] **Step 7: Add the registrar component**

Create `apps/web/src/components/pwa/service-worker-registrar.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { registerAppServiceWorker } from "@/lib/pwa/service-worker";

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    void registerAppServiceWorker();
  }, []);

  return null;
}
```

- [ ] **Step 8: Render it from the root layout**

In `apps/web/src/app/layout.tsx`, add the import next to the other component imports:

```tsx
import { ServiceWorkerRegistrar } from "@/components/pwa/service-worker-registrar";
```

and render it inside `<body>`, before `<ThemeProvider>`:

```tsx
      <body className="flex min-h-full flex-col font-body">
        <ServiceWorkerRegistrar />
        <ThemeProvider initialPreference={preference}>{children}</ThemeProvider>
      </body>
```

- [ ] **Step 9: Repoint the three existing consumers**

In `apps/web/src/components/vedabase/sync-status.tsx`, replace the import on line 4 and the call on line 41:

```tsx
import { registerAppServiceWorker } from "@/lib/pwa/service-worker";
```
```tsx
    void registerAppServiceWorker(userId);
```

In `apps/web/src/components/vedabase/offline-router.tsx`, replace the import on line 6:

```tsx
import { activeUserKey } from "@/lib/pwa/service-worker";
```
and rename the `vedabaseActiveUserKey` reference inside `useEffect` to `activeUserKey`.

In `apps/web/src/components/logout-button.tsx`, replace the import block on lines 7–10:

```tsx
import { activeUserKey, clearOfflineCaches } from "@/lib/pwa/service-worker";
```
and update the cleanup block (lines 37–40):

```tsx
      const activeUserId = localStorage.getItem(activeUserKey);
      const cleanupTasks = [clearOfflineCaches()];
      if (activeUserId) cleanupTasks.push(deleteVedabaseDb(activeUserId));
      await Promise.allSettled(cleanupTasks);
      localStorage.removeItem(activeUserKey);
```

- [ ] **Step 10: Update the logout spec to the new module**

In `apps/web/src/components/logout-button.spec.tsx`, replace every occurrence of the module path `"@/lib/vedabase/register-service-worker"` with `"@/lib/pwa/service-worker"`, and every occurrence of the identifier `clearVedabaseOfflineData` with `clearOfflineCaches`. The mock factory becomes:

```tsx
vi.mock("@/lib/pwa/service-worker", () => ({
  clearOfflineCaches: vi.fn(),
  activeUserKey: "vedabase:activeUserId",
}));
```

- [ ] **Step 11: Delete the old worker and module**

```bash
git rm apps/web/public/vedabase/sw.js apps/web/src/lib/vedabase/register-service-worker.ts
```

- [ ] **Step 12: Verify nothing still imports the deleted module**

Run from the repo root: `grep -rn "register-service-worker\|clearVedabaseOfflineData\|vedabaseActiveUserKey" apps/web/src apps/web/e2e`
Expected: no matches.

- [ ] **Step 13: Run the full unit suite and lint**

Run: `pnpm test` then `pnpm lint`
Expected: both pass.

- [ ] **Step 14: Commit**

```bash
git add apps/web/src apps/web/public
git commit -m "feat(pwa): serve one service worker for the whole portal"
```

---

### Task 4: Platform detection and banner dismissal

**Files:**
- Create: `apps/web/src/lib/pwa/platform.ts`
- Test: `apps/web/src/lib/pwa/platform.spec.ts`
- Create: `apps/web/src/lib/pwa/install-dismissal.ts`
- Test: `apps/web/src/lib/pwa/install-dismissal.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type InstallMode = "installed" | "can-prompt" | "ios-manual" | "unsupported"`
  - `interface BeforeInstallPromptEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> }`
  - `detectInstallMode(env: InstallEnvironment): InstallMode` where `InstallEnvironment = { matchMedia: (query: string) => { matches: boolean }; navigator: { standalone?: boolean; userAgent: string }; promptEvent: BeforeInstallPromptEvent | null }`
  - `isInstallBannerDismissed(storage: Pick<Storage, "getItem">): boolean`
  - `rememberInstallDismissal(storage: Pick<Storage, "setItem">): void`

- [ ] **Step 1: Write the failing platform test**

Create `apps/web/src/lib/pwa/platform.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  detectInstallMode,
  type BeforeInstallPromptEvent,
  type InstallEnvironment,
} from "./platform";

const androidChrome =
  "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36";
const iphoneSafari =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1";
const desktopFirefox =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0";

function environment(overrides: Partial<InstallEnvironment>): InstallEnvironment {
  return {
    matchMedia: () => ({ matches: false }),
    navigator: { userAgent: desktopFirefox },
    promptEvent: null,
    ...overrides,
  };
}

const promptEvent = {} as BeforeInstallPromptEvent;

describe("detectInstallMode", () => {
  it("reports an installed app when it runs in a standalone window", () => {
    expect(
      detectInstallMode(
        environment({
          matchMedia: (query) => ({ matches: query.includes("standalone") }),
          navigator: { userAgent: androidChrome },
          promptEvent,
        }),
      ),
    ).toBe("installed");
  });

  it("reports an installed app on iOS via navigator.standalone", () => {
    expect(
      detectInstallMode(
        environment({ navigator: { userAgent: iphoneSafari, standalone: true } }),
      ),
    ).toBe("installed");
  });

  it("offers the system dialog when a prompt event was captured", () => {
    expect(
      detectInstallMode(
        environment({ navigator: { userAgent: androidChrome }, promptEvent }),
      ),
    ).toBe("can-prompt");
  });

  it("falls back to manual instructions on iOS, which has no prompt event", () => {
    expect(
      detectInstallMode(environment({ navigator: { userAgent: iphoneSafari } })),
    ).toBe("ios-manual");
  });

  it("stays silent where installation is not available", () => {
    expect(detectInstallMode(environment({}))).toBe("unsupported");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- platform`
Expected: FAIL — `Failed to resolve import "./platform"`.

- [ ] **Step 3: Write the platform module**

Create `apps/web/src/lib/pwa/platform.ts`:

```ts
export type InstallMode =
  | "installed"
  | "can-prompt"
  | "ios-manual"
  | "unsupported";

// Событие нестандартное: его шлёт только Chromium, в lib.dom оно отсутствует.
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export interface InstallEnvironment {
  matchMedia: (query: string) => { matches: boolean };
  navigator: { standalone?: boolean; userAgent: string };
  promptEvent: BeforeInstallPromptEvent | null;
}

export function isIos(userAgent: string): boolean {
  return /iPad|iPhone|iPod/.test(userAgent);
}

export function detectInstallMode(environment: InstallEnvironment): InstallMode {
  const standalone =
    environment.matchMedia("(display-mode: standalone)").matches ||
    environment.navigator.standalone === true;
  if (standalone) return "installed";
  if (environment.promptEvent) return "can-prompt";
  // На iOS beforeinstallprompt не существует ни в одном браузере — там
  // установка только вручную через меню «Поделиться».
  if (isIos(environment.navigator.userAgent)) return "ios-manual";
  return "unsupported";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- platform`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write the failing dismissal test**

Create `apps/web/src/lib/pwa/install-dismissal.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  isInstallBannerDismissed,
  rememberInstallDismissal,
} from "./install-dismissal";

describe("install banner dismissal", () => {
  it("shows the banner when nothing was stored", () => {
    expect(isInstallBannerDismissed({ getItem: () => null })).toBe(false);
  });

  it("stays hidden once the user closed it", () => {
    const store = new Map<string, string>();
    rememberInstallDismissal({ setItem: (key, value) => void store.set(key, value) });

    expect(
      isInstallBannerDismissed({ getItem: (key) => store.get(key) ?? null }),
    ).toBe(true);
  });

  it("survives storage that throws, as in private browsing", () => {
    expect(
      isInstallBannerDismissed({
        getItem: () => {
          throw new Error("denied");
        },
      }),
    ).toBe(false);
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `pnpm test -- install-dismissal`
Expected: FAIL — `Failed to resolve import "./install-dismissal"`.

- [ ] **Step 7: Write the dismissal module**

Create `apps/web/src/lib/pwa/install-dismissal.ts`:

```ts
export const installDismissalKey = "pwa:install-dismissed";

export function isInstallBannerDismissed(
  storage: Pick<Storage, "getItem">,
): boolean {
  try {
    return storage.getItem(installDismissalKey) === "1";
  } catch {
    // В приватном режиме доступ к хранилищу может бросать: показываем баннер.
    return false;
  }
}

export function rememberInstallDismissal(
  storage: Pick<Storage, "setItem">,
): void {
  try {
    storage.setItem(installDismissalKey, "1");
  } catch {
    // Не смогли запомнить отказ — не повод ронять страницу.
  }
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `pnpm test -- install-dismissal`
Expected: PASS, 3 tests.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/lib/pwa
git commit -m "feat(pwa): detect install mode and remember banner dismissal"
```

---

### Task 5: Capture the install prompt and expose it as a hook

**Files:**
- Create: `apps/web/src/lib/pwa/prompt-capture.ts`
- Test: `apps/web/src/lib/pwa/prompt-capture.spec.ts`
- Create: `apps/web/src/components/pwa/use-install-prompt.ts`
- Modify: `apps/web/src/app/layout.tsx`

**Interfaces:**
- Consumes: `InstallMode`, `BeforeInstallPromptEvent`, `detectInstallMode` from Task 4.
- Produces:
  - `installPromptGlobalKey: string`, `installPromptCaptureScript: string`, `readCapturedInstallPrompt(): BeforeInstallPromptEvent | null`, `clearCapturedInstallPrompt(): void`
  - `useInstallPrompt(): { mode: InstallMode; promptInstall: () => Promise<void> }`

- [ ] **Step 1: Write the failing capture test**

Create `apps/web/src/lib/pwa/prompt-capture.spec.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearCapturedInstallPrompt,
  installPromptCaptureScript,
  installPromptGlobalKey,
  readCapturedInstallPrompt,
} from "./prompt-capture";

describe("install prompt capture", () => {
  beforeEach(() => {
    clearCapturedInstallPrompt();
  });

  it("stores an event that fires before React hydrates", () => {
    // Скрипт грузится стратегией beforeInteractive, поэтому проверяем его
    // ровно так, как он выполняется в браузере — как строку.
    new Function(installPromptCaptureScript)();

    const event = new Event("beforeinstallprompt", { cancelable: true });
    window.dispatchEvent(event);

    expect(readCapturedInstallPrompt()).toBe(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("reports nothing when the event never fired", () => {
    expect(readCapturedInstallPrompt()).toBeNull();
  });

  it("uses a namespaced global so it cannot collide with page scripts", () => {
    expect(installPromptGlobalKey).toMatch(/^__vedamatch/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- prompt-capture`
Expected: FAIL — `Failed to resolve import "./prompt-capture"`.

- [ ] **Step 3: Write the capture module**

Create `apps/web/src/lib/pwa/prompt-capture.ts`:

```ts
import type { BeforeInstallPromptEvent } from "./platform";

export const installPromptGlobalKey = "__vedamatchInstallPrompt";

// Chrome шлёт beforeinstallprompt один раз и рано — иногда до гидратации.
// Слушатель из useEffect его пропустит, поэтому ловим строкой скрипта,
// которую layout подключает со стратегией beforeInteractive.
export const installPromptCaptureScript = `window.addEventListener("beforeinstallprompt",function(event){event.preventDefault();window.${installPromptGlobalKey}=event;});`;

export function readCapturedInstallPrompt(): BeforeInstallPromptEvent | null {
  if (typeof window === "undefined") return null;
  const captured = (window as unknown as Record<string, unknown>)[
    installPromptGlobalKey
  ];
  return (captured as BeforeInstallPromptEvent | undefined) ?? null;
}

export function clearCapturedInstallPrompt(): void {
  if (typeof window === "undefined") return;
  delete (window as unknown as Record<string, unknown>)[installPromptGlobalKey];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- prompt-capture`
Expected: PASS, 3 tests.

- [ ] **Step 5: Load the capture script from the root layout**

In `apps/web/src/app/layout.tsx` add the imports:

```tsx
import Script from "next/script";
import { installPromptCaptureScript } from "@/lib/pwa/prompt-capture";
```

and render it inside `<body>`, above `<ServiceWorkerRegistrar />`:

```tsx
        <Script
          id="pwa-install-prompt"
          strategy="beforeInteractive"
          // Скрипт-строка, а не компонент: событие приходит до гидратации.
          dangerouslySetInnerHTML={{ __html: installPromptCaptureScript }}
        />
```

- [ ] **Step 6: Write the hook**

Create `apps/web/src/components/pwa/use-install-prompt.ts`:

```ts
"use client";

import { useCallback, useEffect, useState } from "react";
import {
  detectInstallMode,
  type BeforeInstallPromptEvent,
  type InstallMode,
} from "@/lib/pwa/platform";
import {
  clearCapturedInstallPrompt,
  readCapturedInstallPrompt,
} from "@/lib/pwa/prompt-capture";

export function useInstallPrompt(): {
  mode: InstallMode;
  promptInstall: () => Promise<void>;
} {
  // На сервере режим неизвестен — «unsupported» ничего не рисует, поэтому
  // разметка сервера и первого рендера совпадают.
  const [mode, setMode] = useState<InstallMode>("unsupported");
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(
    null,
  );

  useEffect(() => {
    function resolve(event: BeforeInstallPromptEvent | null) {
      setPromptEvent(event);
      setMode(
        detectInstallMode({
          matchMedia: (query) => window.matchMedia(query),
          navigator: window.navigator as InstallNavigator,
          promptEvent: event,
        }),
      );
    }

    resolve(readCapturedInstallPrompt());

    function onBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      resolve(event as BeforeInstallPromptEvent);
    }
    function onInstalled() {
      clearCapturedInstallPrompt();
      setPromptEvent(null);
      setMode("installed");
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    // Событие одноразовое: повторный prompt() бросит исключение.
    clearCapturedInstallPrompt();
    setPromptEvent(null);
    if (outcome === "accepted") setMode("installed");
  }, [promptEvent]);

  return { mode, promptInstall };
}

type InstallNavigator = Navigator & { standalone?: boolean };
```

- [ ] **Step 7: Run the full suite and lint**

Run: `pnpm test` then `pnpm lint`
Expected: both pass.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/pwa apps/web/src/components/pwa apps/web/src/app/layout.tsx
git commit -m "feat(pwa): capture the install prompt before hydration"
```

---

### Task 6: Install banner, button and iOS instructions

**Files:**
- Create: `apps/web/src/components/pwa/ios-install-instructions.tsx`
- Create: `apps/web/src/components/pwa/install-button.tsx`
- Create: `apps/web/src/components/pwa/install-banner.tsx`
- Test: `apps/web/src/components/pwa/install-banner.spec.tsx`

**Interfaces:**
- Consumes: `useInstallPrompt` (Task 5), `isInstallBannerDismissed` / `rememberInstallDismissal` (Task 4).
- Produces: `InstallBanner` and `InstallButton`, both taking no required props. Task 7 mounts them.

- [ ] **Step 1: Write the iOS instructions component**

Create `apps/web/src/components/pwa/ios-install-instructions.tsx`:

```tsx
"use client";

import { Share, Plus, X } from "lucide-react";

export function IosInstallInstructions({ onClose }: { onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-label="Как установить приложение на iPhone"
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 px-4"
    >
      <div className="glass w-full max-w-sm rounded-2xl border border-glass-brd p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 className="font-display text-lg font-bold text-text-0">
            Установка на iPhone
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="text-text-2 transition hover:text-text-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <ol className="mt-4 space-y-3 text-sm text-text-1">
          <li className="flex items-center gap-3">
            <Share className="h-5 w-5 shrink-0 text-text-2" aria-hidden="true" />
            Нажмите «Поделиться» в нижней панели Safari
          </li>
          <li className="flex items-center gap-3">
            <Plus className="h-5 w-5 shrink-0 text-text-2" aria-hidden="true" />
            Выберите «На экран „Домой“»
          </li>
        </ol>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write the install button**

Create `apps/web/src/components/pwa/install-button.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { useInstallPrompt } from "./use-install-prompt";
import { IosInstallInstructions } from "./ios-install-instructions";

export function InstallButton({ className }: { className?: string }) {
  const { mode, promptInstall } = useInstallPrompt();
  const [showInstructions, setShowInstructions] = useState(false);

  if (mode === "installed" || mode === "unsupported") return null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (mode === "ios-manual") setShowInstructions(true);
          else void promptInstall();
        }}
        className={cn(
          "flex w-full items-center justify-center gap-2 rounded-xl border border-glass-brd px-4 py-3 text-sm font-medium text-text-1 transition hover:text-text-0",
          className,
        )}
      >
        <Download className="h-4 w-4" aria-hidden="true" />
        Установить приложение
      </button>
      {showInstructions && (
        <IosInstallInstructions onClose={() => setShowInstructions(false)} />
      )}
    </>
  );
}
```

- [ ] **Step 3: Write the failing banner test**

Create `apps/web/src/components/pwa/install-banner.spec.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InstallBanner } from "./install-banner";
import { useInstallPrompt } from "./use-install-prompt";

vi.mock("./use-install-prompt", () => ({
  useInstallPrompt: vi.fn(),
}));

const promptInstall = vi.fn();

function mockMode(mode: string) {
  vi.mocked(useInstallPrompt).mockReturnValue({
    mode: mode as never,
    promptInstall,
  });
}

describe("InstallBanner", () => {
  beforeEach(() => {
    localStorage.clear();
    promptInstall.mockReset();
  });

  it("offers the system dialog when the browser supports it", async () => {
    mockMode("can-prompt");
    render(<InstallBanner />);

    await userEvent.click(await screen.findByRole("button", { name: "Установить" }));

    expect(promptInstall).toHaveBeenCalledOnce();
  });

  it("opens manual instructions on iOS instead of a dialog", async () => {
    mockMode("ios-manual");
    render(<InstallBanner />);

    await userEvent.click(await screen.findByRole("button", { name: "Установить" }));

    expect(promptInstall).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("stays away once installed", () => {
    mockMode("installed");
    render(<InstallBanner />);

    expect(screen.queryByRole("button", { name: "Установить" })).toBeNull();
  });

  it("does not come back after the user closes it", async () => {
    mockMode("can-prompt");
    const first = render(<InstallBanner />);
    await userEvent.click(await screen.findByRole("button", { name: "Закрыть" }));
    first.unmount();

    render(<InstallBanner />);

    expect(screen.queryByRole("button", { name: "Установить" })).toBeNull();
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm test -- install-banner`
Expected: FAIL — `Failed to resolve import "./install-banner"`.

- [ ] **Step 5: Write the banner**

Create `apps/web/src/components/pwa/install-banner.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import {
  isInstallBannerDismissed,
  rememberInstallDismissal,
} from "@/lib/pwa/install-dismissal";
import { useInstallPrompt } from "./use-install-prompt";
import { IosInstallInstructions } from "./ios-install-instructions";

export function InstallBanner() {
  const { mode, promptInstall } = useInstallPrompt();
  // Считаем закрытым до проверки хранилища: так баннер не мигает при загрузке.
  const [dismissed, setDismissed] = useState(true);
  const [showInstructions, setShowInstructions] = useState(false);

  useEffect(() => {
    setDismissed(isInstallBannerDismissed(window.localStorage));
  }, []);

  if (dismissed || mode === "installed" || mode === "unsupported") return null;

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-40 p-3 sm:hidden">
        <div className="glass flex items-center gap-3 rounded-2xl border border-glass-brd p-3">
          <Download className="h-5 w-5 shrink-0 text-text-2" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-sm text-text-1">
            Установите VedaMatch на телефон — открывается как приложение.
          </p>
          <button
            type="button"
            onClick={() => {
              if (mode === "ios-manual") setShowInstructions(true);
              else void promptInstall();
            }}
            className="shrink-0 rounded-xl bg-gradient-to-r from-magenta to-[#B23EFF] px-3 py-2 text-sm font-medium text-white"
          >
            Установить
          </button>
          <button
            type="button"
            aria-label="Закрыть"
            onClick={() => {
              rememberInstallDismissal(window.localStorage);
              setDismissed(true);
            }}
            className="shrink-0 text-text-2 transition hover:text-text-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
      {showInstructions && (
        <IosInstallInstructions onClose={() => setShowInstructions(false)} />
      )}
    </>
  );
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm test -- install-banner`
Expected: PASS, 4 tests.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/pwa
git commit -m "feat(pwa): add the install banner, button and iOS instructions"
```

---

### Task 7: Mount the install UI on the dashboard, landing and profile

**Files:**
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/components/landing/LandingPage.tsx`
- Modify: `apps/web/src/app/profile/page.tsx:111-113`

**Interfaces:**
- Consumes: `InstallBanner` and `InstallButton` from Task 6.
- Produces: nothing further.

- [ ] **Step 1: Add the banner to the dashboard**

In `apps/web/src/app/page.tsx`, add the import beside the other component imports:

```tsx
import { InstallBanner } from "@/components/pwa/install-banner";
```

and render it as the last child of the outer `<div>`, after `</main>`:

```tsx
      </main>
      <InstallBanner />
    </div>
```

- [ ] **Step 2: Add the banner to the landing page**

In `apps/web/src/components/landing/LandingPage.tsx`, add the import beside `SilentRefresh`:

```tsx
import { InstallBanner } from "@/components/pwa/install-banner";
```

and render it as the last child of the outer `<div>`, after `</footer>`:

```tsx
      </footer>
      <InstallBanner />
    </div>
```

- [ ] **Step 3: Add the permanent entry to the profile**

In `apps/web/src/app/profile/page.tsx`, add the import beside `LogoutButton`:

```tsx
import { InstallButton } from "@/components/pwa/install-button";
```

and render it between the self-identification link and the logout button (after line 110, before line 111):

```tsx
          <InstallButton className="mt-3" />
```

- [ ] **Step 4: Verify in the browser**

Start the dev server and open the dashboard in a mobile viewport with Chrome DevTools device emulation.
Expected: the banner appears at the bottom; "Установить" opens the browser's install dialog; the close button hides it, and it stays hidden after a reload; the profile page shows "Установить приложение" regardless.

- [ ] **Step 5: Run the full suite and lint**

Run: `pnpm test` then `pnpm lint`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/page.tsx apps/web/src/components/landing/LandingPage.tsx apps/web/src/app/profile/page.tsx
git commit -m "feat(pwa): offer installation on the dashboard, landing and profile"
```

---

### Task 8: End-to-end offline coverage

**Files:**
- Create: `apps/web/e2e/pwa-offline.spec.ts`

**Interfaces:**
- Consumes: the `/offline` route and `public/sw.js` from Task 3.
- Produces: nothing.

This is the regression guard for the merge. The second assertion is the one that proves offline book reading survived.

- [ ] **Step 1: Write the test**

Create `apps/web/e2e/pwa-offline.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("the worker serves a portal shell offline and keeps the reader shell", async ({
  page,
}) => {
  await page.goto("/");
  // Воркер ставит skipWaiting + clients.claim, поэтому контроль приходит
  // без перезагрузки — но не мгновенно.
  await page.waitForFunction(
    () => navigator.serviceWorker.controller !== null,
    undefined,
    { timeout: 30_000 },
  );

  await page.context().setOffline(true);
  try {
    await page.goto("/union");
    await expect(
      page.getByRole("heading", { name: "Нет подключения" }),
    ).toBeVisible();

    await page.goto("/vedabase");
    await expect(page.getByText("Union Vedabase · офлайн")).toBeVisible();
  } finally {
    await page.context().setOffline(false);
  }
});
```

- [ ] **Step 2: Run the e2e test**

With the dev server running and `TEST_ACCESS_TOKEN` / `TEST_USER_ID` set:
Run: `pnpm test:e2e -- pwa-offline`
Expected: PASS.

- [ ] **Step 3: Run the existing Vedabase e2e test to confirm no regression**

Run: `pnpm test:e2e -- vedabase-offline`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/e2e/pwa-offline.spec.ts
git commit -m "test(pwa): cover the offline shells end to end"
```

---

## Manual verification before release

Not automatable, and each one has caught this class of bug before:

- [ ] Install on Android (Chrome): the icon on the home screen shows the mark, not a wordmark smear; the app opens without a browser address bar.
- [ ] Install on iOS (Safari): the "Поделиться → На экран „Домой“" instructions match what the OS actually shows; the home-screen icon has an opaque background, not black.
- [ ] Long-press the Android icon: the "Библиотека" and "Знакомства" shortcuts appear and open the right sections.
- [ ] Icon under both a circular and a squircle mask (Android launcher settings): nothing important is clipped.
- [ ] **Migration:** on a device with the old Vedabase app installed and books downloaded, load the portal once online, then check `chrome://serviceworker-internals` (or DevTools → Application → Service Workers) — only the `/` worker remains, and previously downloaded books still open offline without re-downloading.
