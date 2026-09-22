import { describe, expect, it } from "vitest";
import type { NotificationDeliveryStatusDto } from "@vedamatch/shared";
import { deliveryWarning } from "./delivery-warning";

const nothing: NotificationDeliveryStatusDto = {
  web: 0,
  app: 0,
  telegram: 0,
  stale: 0,
  reachable: false,
};

describe("deliveryWarning", () => {
  it("статус не загружен — молчим: пугать нечем", () => {
    expect(
      deliveryWarning({ enabled: true, status: null, support: "default" }),
    ).toBeNull();
  });

  it("есть живая точка — предупреждения нет", () => {
    expect(
      deliveryWarning({
        enabled: true,
        status: { ...nothing, web: 1, reachable: true },
        support: "granted",
      }),
    ).toBeNull();
  });

  it("человек выключил уведомления сам — про это сказано отдельно", () => {
    expect(
      deliveryWarning({ enabled: false, status: nothing, support: "default" }),
    ).toBeNull();
  });

  it("включено, а доставлять некуда — говорим прямо", () => {
    const warning = deliveryWarning({
      enabled: true,
      status: nothing,
      support: "default",
    });

    expect(warning?.title).toBe("Уведомления включены, но доставлять их некуда");
    expect(warning?.hint).toContain("кнопкой ниже");
  });

  it("разрешение выдано, а подписки нет — самый неочевидный случай", () => {
    const warning = deliveryWarning({
      enabled: true,
      status: nothing,
      support: "granted",
    });

    expect(warning?.hint).toContain("до сервера не дошла");
  });

  it("браузер запретил — путь через настройки браузера и приложение", () => {
    const warning = deliveryWarning({
      enabled: true,
      status: nothing,
      support: "denied",
    });

    expect(warning?.hint).toContain("в его настройках");
  });

  it("браузер не умеет пушей — предлагаем другой браузер и приложение", () => {
    const warning = deliveryWarning({
      enabled: true,
      status: nothing,
      support: "unsupported",
    });

    expect(warning?.hint).toContain("не умеет присылать уведомления");
  });

  it("помеченные мёртвыми подписки упоминаются: иначе «некуда» звучит загадкой", () => {
    const warning = deliveryWarning({
      enabled: true,
      status: { ...nothing, stale: 2 },
      support: "granted",
    });

    expect(warning?.hint).toContain("помечены мёртвыми");
  });

  it("телефон с приложением считается доставкой наравне с браузером", () => {
    expect(
      deliveryWarning({
        enabled: true,
        status: { ...nothing, app: 1, reachable: true },
        support: "denied",
      }),
    ).toBeNull();
  });
});
