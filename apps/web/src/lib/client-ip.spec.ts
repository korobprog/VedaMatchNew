import { describe, expect, it } from "vitest";
import { pickClientIpHeaders } from "./client-ip";

describe("pickClientIpHeaders", () => {
  it("пробрасывает адрес клиента из x-forwarded-for и x-real-ip", () => {
    const source = new Headers({
      "x-forwarded-for": "203.0.113.7, 10.0.1.2",
      "x-real-ip": "203.0.113.7",
      cookie: "access_token=secret",
      host: "vedamatch.ru",
    });
    expect(pickClientIpHeaders((n) => source.get(n))).toEqual({
      "x-forwarded-for": "203.0.113.7, 10.0.1.2",
      "x-real-ip": "203.0.113.7",
    });
  });

  it("без заголовков — пустой объект, а не пустые строки", () => {
    expect(pickClientIpHeaders(() => null)).toEqual({});
    expect(pickClientIpHeaders(() => "   ")).toEqual({});
  });
});
