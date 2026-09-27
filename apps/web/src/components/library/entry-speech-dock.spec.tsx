import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SpeechDock } from "@/components/speech/speech-dock";
import { EntrySpeakButton } from "./entry-speak-button";
import {
  getEntryPausedId,
  getEntrySpeakingId,
  stopEntrySpeech,
} from "./entry-speech";

class FakeUtterance {
  lang = "";
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public text: string) {}
}

const cancel = vi.fn();

beforeEach(() => {
  cancel.mockClear();
  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    value: { speak: () => undefined, cancel },
  });
  Object.defineProperty(window, "SpeechSynthesisUtterance", {
    configurable: true,
    value: FakeUtterance,
  });
});

afterEach(() => {
  act(() => stopEntrySpeech());
});

describe("озвучка материала и пульт портала (VED-569)", () => {
  it("ушли со страницы материала — пульт ставит паузу и останавливает", async () => {
    const user = userEvent.setup();
    const page = render(
      <EntrySpeakButton
        locale="ru"
        entryId="e1"
        text="Пурушоттама-врата. Во время врата читают катху."
      />,
    );
    render(<SpeechDock />);
    await user.click(screen.getByRole("button"));
    expect(getEntrySpeakingId()).toBe("e1");
    expect(screen.queryByRole("region", { name: "Озвучка" })).toBeNull();

    cancel.mockClear();
    page.unmount();
    expect(cancel).not.toHaveBeenCalled();
    const region = screen.getByRole("region", { name: "Озвучка" });
    expect(region).toHaveTextContent("Образование");
    expect(region).toHaveTextContent("Пурушоттама-врата");

    await user.click(screen.getByRole("button", { name: "Пауза озвучки" }));
    expect(getEntryPausedId()).toBe("e1");
    await user.click(
      screen.getByRole("button", { name: "Остановить озвучку" }),
    );
    expect(getEntryPausedId()).toBeNull();
    expect(screen.queryByRole("region", { name: "Озвучка" })).toBeNull();
  });
});
