// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

/**
 * Обработчик `push` в sw.js (VED-313). Как и в `sw-cache.spec.ts`, исполняем
 * сам файл с подставным `self`: проверяется ровно то, что уедет в браузер.
 */
const SOURCE = readFileSync(
  new URL("../../../public/sw.js", import.meta.url),
  "utf8",
);
const ORIGIN = "https://vedamatch.ru";
const APPLE = "https://web.push.apple.com/QGFwcGxlLWlk";
const FCM = "https://fcm.googleapis.com/fcm/send/abc";

type PushEvent = {
  data: { json: () => unknown } | null;
  waitUntil: (work: Promise<unknown>) => void;
};

function loadWorker(options: {
  endpoint: string | null;
  /** Окно, которое сейчас на экране, и его адрес. */
  visiblePath?: string;
  /** `fetch` для подтверждения показа (VED-327). */
  fetchMock?: ReturnType<typeof vi.fn>;
}) {
  const handlers = new Map<string, (event: unknown) => void>();
  const postMessage = vi.fn();
  const showNotification = vi.fn(async () => undefined);
  const windows = options.visiblePath
    ? [
        {
          url: `${ORIGIN}${options.visiblePath}`,
          visibilityState: "visible",
          postMessage,
        },
      ]
    : [];
  const self = {
    addEventListener: (type: string, handler: (event: unknown) => void) => {
      handlers.set(type, handler);
    },
    location: { origin: ORIGIN },
    skipWaiting: vi.fn(),
    clients: {
      claim: vi.fn(async () => undefined),
      matchAll: vi.fn(async () => windows),
    },
    registration: {
      showNotification,
      pushManager: {
        getSubscription: vi.fn(async () =>
          options.endpoint ? { endpoint: options.endpoint } : null,
        ),
      },
    },
  };
  const fetchMock = options.fetchMock ?? vi.fn(async () => new Response(null));
  new Function("self", "caches", "fetch", SOURCE)(self, {}, fetchMock);

  async function push(data: PushEvent["data"]): Promise<void> {
    let work: Promise<unknown> = Promise.resolve();
    handlers.get("push")?.({
      data,
      waitUntil: (promise: Promise<unknown>) => {
        work = promise;
      },
    } satisfies PushEvent);
    await work;
  }

  return { push, showNotification, postMessage, fetchMock };
}

const message = {
  title: "Новое сообщение",
  body: "Привет",
  url: "/chat/c-1",
  tag: "chat:c-1",
};

describe("sw.js: пуш", () => {
  it("показывает уведомление, когда беседа не открыта", async () => {
    const worker = loadWorker({ endpoint: FCM });
    await worker.push({ json: () => message });
    expect(worker.showNotification).toHaveBeenCalledWith(
      "Новое сообщение",
      expect.objectContaining({ body: "Привет", tag: "chat:c-1" }),
    );
  });

  it("в Chrome гасит уведомление, если та же беседа открыта на экране", async () => {
    const worker = loadWorker({ endpoint: FCM, visiblePath: "/chat/c-1" });
    await worker.push({ json: () => message });
    expect(worker.postMessage).toHaveBeenCalled();
    expect(worker.showNotification).not.toHaveBeenCalled();
  });

  // Пуш без уведомления Safari считает «тихим» и за несколько таких
  // отзывает подписку — айфон перестаёт получать пуши совсем.
  it("у подписки Apple показывает уведомление даже поверх открытой беседы", async () => {
    const worker = loadWorker({ endpoint: APPLE, visiblePath: "/chat/c-1" });
    await worker.push({ json: () => message });
    expect(worker.postMessage).toHaveBeenCalled();
    expect(worker.showNotification).toHaveBeenCalledTimes(1);
  });

  it("пустой или битый пуш не проходит молча", async () => {
    const empty = loadWorker({ endpoint: APPLE });
    await empty.push(null);
    expect(empty.showNotification).toHaveBeenCalledWith(
      "VedaMatch",
      expect.objectContaining({ body: "Новое уведомление" }),
    );

    const broken = loadWorker({ endpoint: APPLE });
    await broken.push({
      json: () => {
        throw new SyntaxError("не JSON");
      },
    });
    expect(broken.showNotification).toHaveBeenCalledTimes(1);
  });
});
