import { describe, expect, it } from "vitest";
import {
  buildWorkInviteShareHref,
  inviteToken,
  shareTitle,
} from "./work-share";

const invite = {
  spaceId: "space-1",
  spaceName: "Veda Match",
  roleTitle: "участник",
  url: "https://vedamatch.ru/work/join/TOKEN",
};

describe("buildWorkInviteShareHref", () => {
  const params = new URLSearchParams(
    buildWorkInviteShareHref(invite).split("?")[1],
  );

  it("ведёт на общий экран отправки портала", () => {
    expect(buildWorkInviteShareHref(invite).startsWith("/chat/share?")).toBe(
      true,
    );
  });

  it("представляется своим видом карточки", () => {
    expect(params.get("kind")).toBe("work");
    expect(params.get("sourceService")).toBe("work");
  });

  it("токен едет отдельным полем — по нему карточка соберёт кнопку", () => {
    expect(params.get("sourceId")).toBe("TOKEN");
  });

  it("полного адреса в карточке нет нигде", () => {
    expect(params.get("url")).toBeNull();
    expect(params.get("body")).not.toContain(invite.url);
    expect(params.get("title")).not.toContain(invite.url);
  });

  it("называет роль: без неё человек не знает, куда его зовут", () => {
    expect(params.get("subtitle")).toBe("Роль: участник");
  });

  it("экранирует название среды", () => {
    const href = buildWorkInviteShareHref({
      ...invite,
      spaceName: "Ремонт & кухня?",
    });
    expect(href).not.toContain("&кухня");
    expect(new URLSearchParams(href.split("?")[1]).get("title")).toContain(
      "Ремонт & кухня?",
    );
  });
});

describe("inviteToken", () => {
  it("вынимает токен из полного адреса", () => {
    expect(inviteToken("https://vedamatch.ru/work/join/ABC")).toBe("ABC");
  });

  it("порт и http тоже", () => {
    expect(inviteToken("http://localhost:3000/work/join/ABC")).toBe("ABC");
  });

  it("неожиданный формат отдаём как есть, а не пустоту", () => {
    expect(inviteToken("ABC")).toBe("ABC");
  });
});

describe("shareTitle", () => {
  it("обычное название целиком", () => {
    expect(shareTitle("Veda Match")).toBe("Приглашение в «Veda Match»");
  });

  it("длинное укорачивает, но кавычку не теряет", () => {
    const title = shareTitle("а".repeat(200));
    expect(title.length).toBeLessThanOrEqual(80);
    expect(title.endsWith("…»")).toBe(true);
  });

  it("пустое название не даёт пустых кавычек", () => {
    expect(shareTitle("   ")).toBe("Приглашение в «рабочая среда»");
  });
});
