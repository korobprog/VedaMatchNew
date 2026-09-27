import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BlogSpeakButton } from "./blog-speak-button";
import { stopBlogSpeech } from "./blog-speech";

const fetchLibraryEntry = vi.fn();
vi.mock("@/lib/library-client-api", () => ({
  fetchLibraryEntry: (id: string) => fetchLibraryEntry(id),
}));

class FakeUtterance {
  lang = "";
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public text: string) {}
}

const speak = vi.fn();
const cancel = vi.fn();

beforeEach(() => {
  speak.mockReset();
  cancel.mockReset();
  fetchLibraryEntry.mockReset();
  vi.stubGlobal("speechSynthesis", { speak, cancel });
  vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
});

afterEach(() => {
  stopBlogSpeech();
  vi.unstubAllGlobals();
});

function spokenText(): string {
  return speak.mock.calls
    .map(([utterance]) => (utterance as FakeUtterance).text)
    .join(" ");
}

describe("BlogSpeakButton (VED-549)", () => {
  it("первое нажатие — слушать, во время чтения — пауза, после паузы — продолжить", async () => {
    const user = userEvent.setup();
    render(
      <BlogSpeakButton
        postId="p1"
        source={{ title: "Экадаши", text: "Пост без ссылок." }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Слушать пост" }));
    expect(spokenText()).toBe("Экадаши. Пост без ссылок.");

    const pause = screen.getByRole("button", { name: "Пауза озвучки" });
    expect(pause).toHaveAttribute("aria-pressed", "true");
    await user.click(pause);
    expect(cancel).toHaveBeenCalled();

    speak.mockClear();
    const resume = screen.getByRole("button", { name: "Продолжить озвучку" });
    expect(resume).toHaveAttribute("aria-pressed", "false");
    await user.click(resume);
    expect(speak).toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Пауза озвучки" }),
    ).toBeInTheDocument();
  });

  it("пост из Образования читает текст материала, а не ссылку (VED-550)", async () => {
    fetchLibraryEntry.mockResolvedValue({
      titleRu: "Катха о Гите",
      descriptionRu: "Коротко",
      body: "Душа вечна.",
    });
    const user = userEvent.setup();
    render(
      <BlogSpeakButton
        postId="p2"
        source={{
          title: "Катха о Гите",
          text: "https://vedamatch.ru/library/entry/e1",
          link: { url: "/library/entry/e1" },
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Слушать пост" }));
    await waitFor(() => expect(speak).toHaveBeenCalled());
    expect(fetchLibraryEntry).toHaveBeenCalledWith("e1");
    expect(spokenText()).toBe("Катха о Гите. Душа вечна.");
    expect(spokenText()).not.toContain("vedamatch");
  });

  it("материал не загрузился — читает пост без ссылки", async () => {
    fetchLibraryEntry.mockResolvedValue(null);
    const user = userEvent.setup();
    render(
      <BlogSpeakButton
        postId="p3"
        source={{
          title: "Лекция",
          text: "vedamatch.ru/library/entry/e2",
          link: { url: "/library/entry/e2" },
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Слушать пост" }));
    await waitFor(() => expect(speak).toHaveBeenCalled());
    expect(spokenText()).toBe("Лекция");
  });

  it("без синтеза речи кнопки нет", () => {
    vi.unstubAllGlobals();
    render(<BlogSpeakButton postId="p4" source={{ title: "Пост" }} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
