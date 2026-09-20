import { describe, expect, it } from "vitest";
import {
  buildVpnProbeUrl,
  classifyVpnProbe,
  INITIAL_VPN_HINT_STATE,
  reduceVpnHint,
  VPN_FAILURE_THRESHOLD,
  type VpnHintState,
} from "./vpn-hint";

describe("classifyVpnProbe", () => {
  it("treats any HTTP answer as proof that the portal is reachable", () => {
    // 503 отдаёт живой API с упавшим Postgres: запрос дошёл, туннель ни при чём.
    for (const status of [200, 401, 429, 500, 503]) {
      expect(classifyVpnProbe({ online: true, status })).toBe("reachable");
    }
  });

  it("believes a received answer even when the browser claims to be offline", () => {
    expect(classifyVpnProbe({ online: false, status: 200 })).toBe("reachable");
  });

  it("calls a failure without network an offline, not a VPN", () => {
    expect(classifyVpnProbe({ online: false })).toBe("offline");
    expect(classifyVpnProbe({ online: false, status: null })).toBe("offline");
  });

  it("calls a failure with network unreachable", () => {
    expect(classifyVpnProbe({ online: true })).toBe("unreachable");
    expect(classifyVpnProbe({ online: true, status: null })).toBe("unreachable");
  });
});

describe("reduceVpnHint", () => {
  it("stays quiet after a single failure", () => {
    const state = reduceVpnHint(INITIAL_VPN_HINT_STATE, "unreachable");

    expect(state).toEqual({ failures: 1, warn: false });
  });

  it("warns once failures reach the threshold", () => {
    let state: VpnHintState = INITIAL_VPN_HINT_STATE;
    for (let i = 0; i < VPN_FAILURE_THRESHOLD; i += 1) {
      state = reduceVpnHint(state, "unreachable");
    }

    expect(state.warn).toBe(true);
    expect(state.failures).toBe(VPN_FAILURE_THRESHOLD);
  });

  it("drops the warning as soon as the portal answers", () => {
    const warned = reduceVpnHint({ failures: 5, warn: true }, "reachable");

    expect(warned).toEqual(INITIAL_VPN_HINT_STATE);
  });

  it("does not let an offline device collect failures", () => {
    const state = reduceVpnHint({ failures: 1, warn: false }, "offline");

    expect(state).toEqual({ failures: 0, warn: false });
  });

  it("keeps an already shown warning while the device is offline", () => {
    // Убрать плашку по офлайну значило бы мигать ей на каждом лифте: снимает
    // её только дошедший ответ.
    expect(reduceVpnHint({ failures: 2, warn: true }, "offline")).toEqual({
      failures: 0,
      warn: true,
    });
  });

  it("honours a custom threshold", () => {
    expect(reduceVpnHint(INITIAL_VPN_HINT_STATE, "unreachable", 1)).toEqual({
      failures: 1,
      warn: true,
    });
  });
});

describe("buildVpnProbeUrl", () => {
  it("appends the health path and a cache buster", () => {
    expect(buildVpnProbeUrl("https://api.vedamatch.ru", 17)).toBe(
      "https://api.vedamatch.ru/health?probe=17",
    );
  });

  it("does not double the slash on a base with a trailing one", () => {
    expect(buildVpnProbeUrl("http://localhost:4000//", 1)).toBe(
      "http://localhost:4000/health?probe=1",
    );
  });

  it("escapes the nonce", () => {
    expect(buildVpnProbeUrl("http://localhost:4000", "a b&c")).toBe(
      "http://localhost:4000/health?probe=a%20b%26c",
    );
  });
});
