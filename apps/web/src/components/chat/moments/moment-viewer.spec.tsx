import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMomentFeed } from "@vedamatch/shared";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const markViewed = vi.fn(() => Promise.resolve({ ok: true as const }));
const reply = vi.fn(() => Promise.resolve({} as never));
vi.mock("@/lib/chat-moments-api", () => ({
  markChatMomentViewed: (...args: unknown[]) => markViewed(...(args as [])),
  replyToChatMoment: (...args: unknown[]) => reply(...(args as [])),
  deleteChatMoment: vi.fn(() => Promise.resolve({ ok: true })),
}));

import { MomentViewer } from "./moment-viewer";

const author = { id: "u1", name: "Радха деви даси", avatarUrl: null, lastSeenAt: null };

function feed(): ChatMomentFeed {
  return {
    author,
    mine: false,
    moments: [
      {
        id: "m1",
        author,
        mine: false,
        kind: "text",
        caption: "Первый",
        url: null,
        width: null,
        height: null,
        background: 0,
        audience: "contacts",
        viewsCount: 0,
        viewedByMe: false,
        createdAt: "2026-09-06T10:00:00.000Z",
        expiresAt: "2126-09-07T10:00:00.000Z",
      },
      {
        id: "m2",
        author,
        mine: false,
        kind: "text",
        caption: "Второй",
        url: null,
        width: null,
        height: null,
        background: 1,
        audience: "contacts",
        viewsCount: 0,
        viewedByMe: false,
        createdAt: "2026-09-06T11:00:00.000Z",
        expiresAt: "2126-09-07T11:00:00.000Z",
      },
    ],
  };
}

/** По умолчанию считаем, что человек движение не ограничивал. */
function mockMotion(reduce: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: reduce,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onchange: null,
    }),
  });
}

describe("просмотрщик моментов", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMotion(false);
  });

  it("открывается с первого непросмотренного", () => {
    const state = feed();
    state.moments[0]!.viewedByMe = true;
    render(<MomentViewer feed={state} />);
    expect(screen.getByText("Второй")).toBeTruthy();
  });

  it("стрелки переключают моменты", () => {
    render(<MomentViewer feed={feed()} />);
    expect(screen.getByText("Первый")).toBeTruthy();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByText("Второй")).toBeTruthy();
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByText("Первый")).toBeTruthy();
  });

  it("Escape закрывает", () => {
    render(<MomentViewer feed={feed()} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(push).toHaveBeenCalledWith("/chat");
  });

  it("зоны перелистывания доступны с клавиатуры, а не только пальцем", () => {
    render(<MomentViewer feed={feed()} />);
    expect(screen.getByLabelText("Следующий момент")).toBeTruthy();
    expect(screen.getByLabelText("Предыдущий момент")).toBeTruthy();
  });

  it("при ограничении движения автоперехода нет, а кнопка «Дальше» есть", () => {
    mockMotion(true);
    render(<MomentViewer feed={feed()} />);
    expect(screen.getByRole("button", { name: "Дальше" })).toBeTruthy();
  });

  it("без ограничения движения отдельной кнопки «Дальше» не показываем", () => {
    render(<MomentViewer feed={feed()} />);
    expect(screen.queryByRole("button", { name: "Дальше" })).toBeNull();
  });

  it("просмотр отмечается сразу, и повторно за тот же момент не отмечается", () => {
    render(<MomentViewer feed={feed()} />);
    expect(markViewed).toHaveBeenCalledTimes(1);
    expect(markViewed).toHaveBeenCalledWith("m1");
  });

  it("пустой ответ отправить нельзя", () => {
    render(<MomentViewer feed={feed()} />);
    const button = screen.getByRole("button", { name: "Отправить" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });
});
