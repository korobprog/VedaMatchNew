import { describe, expect, it } from "vitest";
import { buildWorkInviteShareHref, shareTitle } from "./work-share";

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
    expect(params.get("sourceId")).toBe("space-1");
  });

  it("ссылка едет в тексте, а не в заголовке", () => {
    expect(params.get("body")).toContain(invite.url);
    expect(params.get("title")).not.toContain(invite.url);
  });

  it("в поле url ссылку не кладёт: чат принимает туда только своё хранилище", () => {
    expect(params.get("url")).toBeNull();
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
