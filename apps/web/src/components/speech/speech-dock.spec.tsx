import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearSpeech,
  getSpeechSession,
  holdSpeechAnchor,
  reportSpeech,
  speechTitle,
  stopDockSpeech,
  type SpeechStatus,
} from "@/lib/speech-dock";
import { SpeechDock } from "./speech-dock";

/** Диктор-заглушка: как сервисный, сообщает пульту факт и свои команды. */
function fakeDictor(source = "blog", id = "p1") {
  const controls = {
    pause: vi.fn(() => report("paused")),
    resume: vi.fn(() => report("speaking")),
    stop: vi.fn(() => clearSpeech(source)),
  };
  function report(status: SpeechStatus) {
    reportSpeech({
      source,
      id,
      service: "Блог-лента",
      title: "Принятие санньясы",
      status,
      controls,
    });
  }
  return { controls, report };
}

afterEach(() => {
  act(() => stopDockSpeech());
});

describe("пульт озвучки (VED-569)", () => {
  it("виден, пока речь идёт и её кнопки нет на экране", () => {
    render(<SpeechDock />);
    expect(screen.queryByRole("region", { name: "Озвучка" })).toBeNull();

    const dictor = fakeDictor();
    let anchor: ReturnType<typeof holdSpeechAnchor> | undefined;
    act(() => {
      anchor = holdSpeechAnchor("blog", "p1");
      dictor.report("speaking");
    });
    // Кнопка на странице — второй пульт рядом не нужен.
    expect(screen.queryByRole("region", { name: "Озвучка" })).toBeNull();

    // Ушли со страницы — пульт всплыл.
    act(() => anchor?.release());
    const region = screen.getByRole("region", { name: "Озвучка" });
    expect(region).toHaveTextContent("Блог-лента");
    expect(region).toHaveTextContent("Принятие санньясы");
  });

  it("якорь чужого чтения пульт не прячет", () => {
    render(<SpeechDock />);
    act(() => {
      holdSpeechAnchor("blog", "другой-пост");
      fakeDictor().report("speaking");
    });
    expect(screen.getByRole("region", { name: "Озвучка" })).toBeVisible();
  });

  it("пауза, продолжить и стоп", async () => {
    const user = userEvent.setup();
    render(<SpeechDock />);
    const dictor = fakeDictor();
    act(() => dictor.report("speaking"));

    await user.click(screen.getByRole("button", { name: "Пауза озвучки" }));
    expect(dictor.controls.pause).toHaveBeenCalledOnce();
    expect(screen.getByRole("region")).toHaveTextContent("пауза");

    await user.click(
      screen.getByRole("button", { name: "Продолжить озвучку" }),
    );
    expect(dictor.controls.resume).toHaveBeenCalledOnce();

    await user.click(
      screen.getByRole("button", { name: "Остановить озвучку" }),
    );
    expect(dictor.controls.stop).toHaveBeenCalledOnce();
    expect(screen.queryByRole("region", { name: "Озвучка" })).toBeNull();
    expect(getSpeechSession()).toBeNull();
  });

  it("стоп прячет пульт, даже если диктор не ответил", async () => {
    const user = userEvent.setup();
    render(<SpeechDock />);
    const controls = { pause: vi.fn(), resume: vi.fn(), stop: vi.fn() };
    act(() =>
      reportSpeech({
        source: "library",
        id: "e1",
        service: "Образование",
        title: "Катха",
        status: "paused",
        controls,
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Остановить озвучку" }),
    );
    expect(controls.stop).toHaveBeenCalledOnce();
    expect(screen.queryByRole("region", { name: "Озвучка" })).toBeNull();
  });

  it("запоздалая отмена прежнего сервиса не прячет новое чтение", () => {
    render(<SpeechDock />);
    act(() => {
      fakeDictor("blog", "p1").report("speaking");
      fakeDictor("library", "e1").report("speaking");
      clearSpeech("blog");
    });
    expect(getSpeechSession()?.source).toBe("library");
    expect(screen.getByRole("region", { name: "Озвучка" })).toBeVisible();
  });

  it("название — первая фраза, коротко", () => {
    expect(speechTitle("Принятие санньясы. В сентябре 1959 года…")).toBe(
      "Принятие санньясы",
    );
    const long = speechTitle("слово ".repeat(40), 30);
    expect(long.length).toBeLessThanOrEqual(30);
    expect(long.endsWith("…")).toBe(true);
  });
});
