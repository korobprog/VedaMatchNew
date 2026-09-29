import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MusicShareTrackButton } from "./share-track-button";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const track = {
  id: "t 1",
  title: "Маха-мантра 7",
  artist: { name: "Судеви и Кишори Мохан" },
};

function setShare(value: unknown) {
  Object.defineProperty(navigator, "share", {
    configurable: true,
    writable: true,
    value,
  });
}

afterEach(() => {
  push.mockReset();
  setShare(undefined);
});

describe("MusicShareTrackButton", () => {
  it("зовёт системное окно со ссылкой на запись", async () => {
    const share = vi.fn(async () => {});
    setShare(share);
    render(<MusicShareTrackButton track={track} />);

    await userEvent.click(
      screen.getByRole("button", { name: "Поделиться: Маха-мантра 7" }),
    );

    expect(share).toHaveBeenCalledWith({
      title: "Маха-мантра 7 — Судеви и Кишори Мохан",
      url: `${window.location.origin}/radio?track=t%201`,
    });
    expect(push).not.toHaveBeenCalled();
  });

  it("закрытое окно — не повод открывать экран выбора", async () => {
    setShare(
      vi.fn(async () => {
        throw new DOMException("closed", "AbortError");
      }),
    );
    render(<MusicShareTrackButton track={track} />);

    await userEvent.click(screen.getByRole("button", { name: /Поделиться/ }));

    expect(push).not.toHaveBeenCalled();
  });

  it("без системного окна открывает портальный экран «Поделиться»", async () => {
    setShare(undefined);
    render(<MusicShareTrackButton track={track} />);

    await userEvent.click(screen.getByRole("button", { name: /Поделиться/ }));

    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    const href = new URL(push.mock.calls[0][0] as string, "https://x.test");
    expect(href.pathname).toBe("/share");
    expect(href.searchParams.get("link")).toBe("/radio?track=t%201");
    expect(href.searchParams.get("text")).toBe(
      "Маха-мантра 7 — Судеви и Кишори Мохан",
    );
    // Ключи карточки для чата увели бы в `/chat/share` без вида «запись».
    expect(href.searchParams.has("kind")).toBe(false);
  });
});
