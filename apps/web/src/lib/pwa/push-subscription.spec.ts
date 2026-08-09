import { describe, expect, it, vi } from "vitest";
import {
  detectPushSupport,
  toSubscriptionRequest,
  urlBase64ToUint8Array,
} from "./push-subscription";

describe("urlBase64ToUint8Array", () => {
  it("декодирует url-safe base64 без паддинга", () => {
    // "hi" в url-safe base64 — "aGk", без символа "=" на конце.
    expect(Array.from(urlBase64ToUint8Array("aGk"))).toEqual([104, 105]);
  });

  it("переводит url-safe алфавит в обычный", () => {
    const decoded = urlBase64ToUint8Array("-_8");

    expect(Array.from(decoded)).toEqual([251, 255]);
  });
});

describe("toSubscriptionRequest", () => {
  it("раскладывает подписку в форму, которую ждёт API", () => {
    const subscription = {
      endpoint: "https://push.example/a",
      toJSON: () => ({
        endpoint: "https://push.example/a",
        keys: { p256dh: "p-key", auth: "a-key" },
      }),
    } as unknown as PushSubscription;

    expect(toSubscriptionRequest(subscription)).toEqual({
      endpoint: "https://push.example/a",
      keys: { p256dh: "p-key", auth: "a-key" },
    });
  });
});

describe("detectPushSupport", () => {
  it("сообщает об отсутствии поддержки, когда нет PushManager", () => {
    vi.stubGlobal("window", {});

    expect(detectPushSupport()).toBe("unsupported");

    vi.unstubAllGlobals();
  });
});
