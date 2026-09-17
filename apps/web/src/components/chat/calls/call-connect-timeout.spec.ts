import { describe, expect, it } from "vitest";
import { decideConnectingTimeout } from "./call-connect-timeout";

function input(over: Partial<Parameters<typeof decideConnectingTimeout>[0]> = {}) {
  return {
    phase: "connecting",
    timeoutCallId: "call-1",
    currentCallId: "call-1",
    madeProgress: false,
    alreadyExtended: false,
    ...over,
  };
}

describe("decideConnectingTimeout", () => {
  it("дочитывание ничего не принесло — fail", () => {
    expect(decideConnectingTimeout(input())).toBe("fail");
  });

  it("дочитывание принесло новый сигнал и продления ещё не было — extend", () => {
    expect(decideConnectingTimeout(input({ madeProgress: true }))).toBe("extend");
  });

  it("прогресс есть, но продление уже потрачено — fail", () => {
    expect(
      decideConnectingTimeout(input({ madeProgress: true, alreadyExtended: true })),
    ).toBe("fail");
  });

  it("фаза уже не connecting (соединились сами до срабатывания таймера) — ignore", () => {
    expect(decideConnectingTimeout(input({ phase: "active" }))).toBe("ignore");
  });

  it("звонок сменился, пока таймер ждал (старый завершился, начался новый) — ignore", () => {
    expect(decideConnectingTimeout(input({ currentCallId: "call-2" }))).toBe("ignore");
  });

  it("звонка вовсе нет (сброшено в idle) — ignore", () => {
    expect(
      decideConnectingTimeout(input({ phase: "idle", currentCallId: null })),
    ).toBe("ignore");
  });
});
