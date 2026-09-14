// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

/**
 * sw.js не проходит через сборку и не импортируется, поэтому исполняем сам
 * файл с подставными `self`, `caches` и `fetch` — проверяется ровно то, что
 * уедет в браузер.
 */
const SOURCE = readFileSync(
  new URL("../../../public/sw.js", import.meta.url),
  "utf8",
);
const ORIGIN = "https://vedamatch.ru";

type FetchRequest = { method: string; url: string; mode: string };
type FetchEvent = {
  request: FetchRequest;
  respondWith: (response: Promise<Response>) => void;
};
type ActivateEvent = { waitUntil: (work: Promise<unknown>) => void };

function loadWorker(options: {
  cached?: Record<string, string>;
  cacheNames?: string[];
  network: (url: string) => Promise<Response>;
}) {
  const stored = new Map(Object.entries(options.cached ?? {}));
  const handlers = new Map<string, (event: unknown) => void>();
  const cache = {
    put: vi.fn(async (request: FetchRequest, response: Response) => {
      stored.set(request.url, await response.text());
    }),
    addAll: vi.fn(async () => undefined),
  };
  const caches = {
    match: vi.fn(async (request: FetchRequest | string) => {
      const url = typeof request === "string" ? request : request.url;
      const body = stored.get(url);
      return body === undefined ? undefined : new Response(body);
    }),
    open: vi.fn(async () => cache),
    keys: vi.fn(async () => options.cacheNames ?? []),
    delete: vi.fn(async () => true),
  };
  const fetchMock = vi.fn((request: FetchRequest) => options.network(request.url));
  const self = {
    addEventListener: (type: string, handler: (event: unknown) => void) => {
      handlers.set(type, handler);
    },
    location: { origin: ORIGIN },
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn(async () => undefined) },
  };

  new Function("self", "caches", "fetch", SOURCE)(self, caches, fetchMock);

  async function get(path: string): Promise<Response | undefined> {
    let responded: Promise<Response> | undefined;
    const event: FetchEvent = {
      request: { method: "GET", url: `${ORIGIN}${path}`, mode: "no-cors" },
      respondWith: (response) => {
        responded = response;
      },
    };
    handlers.get("fetch")?.(event);
    return responded;
  }

  async function activate(): Promise<void> {
    let work: Promise<unknown> = Promise.resolve();
    const event: ActivateEvent = {
      waitUntil: (promise) => {
        work = promise;
      },
    };
    handlers.get("activate")?.(event);
    await work;
  }

  return { get, activate, caches, cache, fetchMock };
}

const MANIFEST = `${ORIGIN}/manifest.webmanifest`;

describe("sw.js: кэш", () => {
  // VED-78: быстрое меню значка оставалось старым и после переустановки.
  it("манифест берёт из сети, даже когда старый лежит в кэше", async () => {
    const worker = loadWorker({
      cached: { [MANIFEST]: "старый" },
      network: async () => new Response("новый"),
    });

    const response = await worker.get("/manifest.webmanifest");

    expect(await response?.text()).toBe("новый");
    expect(worker.cache.put).toHaveBeenCalled();
  });

  it("без сети отдаёт манифест из кэша", async () => {
    const worker = loadWorker({
      cached: { [MANIFEST]: "сохранённый" },
      network: () => Promise.reject(new TypeError("offline")),
    });

    const response = await worker.get("/manifest.webmanifest");

    expect(await response?.text()).toBe("сохранённый");
  });

  it("значки тоже сначала из сети", async () => {
    const icon = `${ORIGIN}/icons/shortcut-music.png`;
    const worker = loadWorker({
      cached: { [icon]: "старый" },
      network: async () => new Response("новый"),
    });

    const response = await worker.get("/icons/shortcut-music.png");

    expect(await response?.text()).toBe("новый");
  });

  it("чанки сборки по-прежнему из кэша, без похода в сеть", async () => {
    const chunk = `${ORIGIN}/_next/static/chunks/app-abc123.js`;
    const worker = loadWorker({
      cached: { [chunk]: "чанк" },
      network: async () => new Response("не должен"),
    });

    const response = await worker.get("/_next/static/chunks/app-abc123.js");

    expect(await response?.text()).toBe("чанк");
    expect(worker.fetchMock).not.toHaveBeenCalled();
  });

  it("при активации удаляет прежний кэш оболочки вместе со старым манифестом", async () => {
    const worker = loadWorker({
      cacheNames: ["vedamatch-shell-v2", "vedamatch-shell-v3", "чужой"],
      network: async () => new Response(""),
    });

    await worker.activate();

    expect(worker.caches.delete).toHaveBeenCalledWith("vedamatch-shell-v2");
    expect(worker.caches.delete).not.toHaveBeenCalledWith("vedamatch-shell-v3");
    expect(worker.caches.delete).not.toHaveBeenCalledWith("чужой");
  });
});
