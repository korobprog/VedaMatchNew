import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SpeechDock } from "@/components/speech/speech-dock";
import { BlogSpeakButton } from "./blog-speak-button";
import {
  getBlogPausedId,
  getBlogSpeakingId,
  stopBlogSpeech,
} from "./blog-speech";

vi.mock("@/lib/library-client-api", () => ({
  fetchLibraryEntry: vi.fn(async () => null),
}));

class FakeUtterance {
  lang = "";
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public text: string) {}
}

const cancel = vi.fn();
const spoken: FakeUtterance[] = [];

/** Наблюдатель видимости: тест сам говорит, на экране ли кнопка. */
let reportVisible: ((visible: boolean) => void) | null = null;
class FakeIntersectionObserver {
  constructor(
    private callback: (entries: Array<{ isIntersecting: boolean }>) => void,
  ) {}
  observe() {
    reportVisible = (visible) => this.callback([{ isIntersecting: visible }]);
  }
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  spoken.length = 0;
  cancel.mockClear();
  reportVisible = null;
  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    value: {
      speak: (utterance: FakeUtterance) => spoken.push(utterance),
      cancel,
    },
  });
  Object.defineProperty(window, "SpeechSynthesisUtterance", {
    configurable: true,
    value: FakeUtterance,
  });
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
});

afterEach(() => {
  act(() => stopBlogSpeech());
  vi.unstubAllGlobals();
});

const post = {
  title: "Принятие санньясы Шрилы Прабхупады",
  text: "В сентябре 1959 года, в Матхуре, Шрила Прабхупада принял посвящение.",
};

describe("озвучка Блог-ленты и пульт портала (VED-569)", () => {
  it("уход со страницы не обрывает чтение, пульт ставит паузу и останавливает", async () => {
    const user = userEvent.setup();
    const page = render(<BlogSpeakButton postId="p1" source={post} />);
    render(<SpeechDock />);

    await user.click(screen.getByRole("button", { name: "Слушать пост" }));
    expect(getBlogSpeakingId()).toBe("p1");
    // Кнопка на экране — пульта нет.
    expect(screen.queryByRole("region", { name: "Озвучка" })).toBeNull();

    // Ушли со страницы: карточка размонтирована, голос читает дальше.
    cancel.mockClear();
    page.unmount();
    expect(cancel).not.toHaveBeenCalled();
    expect(getBlogSpeakingId()).toBe("p1");
    const region = screen.getByRole("region", { name: "Озвучка" });
    expect(region).toHaveTextContent("Блог-лента");
    expect(region).toHaveTextContent("Принятие санньясы Шрилы Прабхупады");

    await user.click(screen.getByRole("button", { name: "Пауза озвучки" }));
    expect(cancel).toHaveBeenCalled();
    expect(getBlogPausedId()).toBe("p1");

    spoken.length = 0;
    await user.click(
      screen.getByRole("button", { name: "Продолжить озвучку" }),
    );
    expect(getBlogSpeakingId()).toBe("p1");
    expect(spoken.length).toBeGreaterThan(0);

    await user.click(
      screen.getByRole("button", { name: "Остановить озвучку" }),
    );
    expect(getBlogSpeakingId()).toBeNull();
    expect(getBlogPausedId()).toBeNull();
    expect(screen.queryByRole("region", { name: "Озвучка" })).toBeNull();
  });

  it("кнопка поста и пульт показывают одно и то же", async () => {
    const user = userEvent.setup();
    render(
      <>
        <BlogSpeakButton postId="p1" source={post} />
        <SpeechDock />
      </>,
    );
    await user.click(screen.getByRole("button", { name: "Слушать пост" }));

    // Пост уехал за край экрана — пульт всплыл.
    act(() => reportVisible?.(false));
    const dock = within(screen.getByRole("region", { name: "Озвучка" }));
    await user.click(dock.getByRole("button", { name: "Пауза озвучки" }));
    // Кнопка у поста тоже на паузе.
    expect(
      screen.getAllByRole("button", { name: "Продолжить озвучку" }),
    ).toHaveLength(2);

    // Продолжили кнопкой поста — пульт снова показывает «Пауза».
    const [postButton] = screen.getAllByRole("button", {
      name: "Продолжить озвучку",
    });
    await user.click(postButton);
    expect(
      screen.getAllByRole("button", { name: "Пауза озвучки" }),
    ).toHaveLength(2);

    // Пост вернулся на экран — пульт спрятан.
    act(() => reportVisible?.(true));
    expect(screen.queryByRole("region", { name: "Озвучка" })).toBeNull();
  });

  it("чтение дочитано — пульт исчез сам", async () => {
    const user = userEvent.setup();
    const page = render(<BlogSpeakButton postId="p1" source={post} />);
    render(<SpeechDock />);
    await user.click(screen.getByRole("button", { name: "Слушать пост" }));
    page.unmount();
    expect(screen.getByRole("region", { name: "Озвучка" })).toBeVisible();
    act(() => spoken[spoken.length - 1].onend?.());
    expect(screen.queryByRole("region", { name: "Озвучка" })).toBeNull();
  });
});
