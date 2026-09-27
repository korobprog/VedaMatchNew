import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EntrySpeakButton } from "./entry-speak-button";
import { stopEntrySpeech } from "./entry-speech";

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
  vi.stubGlobal("speechSynthesis", { speak, cancel });
  vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
});

afterEach(() => {
  stopEntrySpeech();
  vi.unstubAllGlobals();
});

describe("EntrySpeakButton (VED-549)", () => {
  it("озвучить → пауза → продолжить, без «стоп»", async () => {
    const user = userEvent.setup();
    render(
      <EntrySpeakButton locale="ru" entryId="e1" text="Катха. Душа вечна." />,
    );

    await user.click(screen.getByRole("button", { name: "Озвучить" }));
    expect(speak).toHaveBeenCalledTimes(1);
    expect((speak.mock.calls[0][0] as FakeUtterance).text).toBe(
      "Катха. Душа вечна.",
    );

    await user.click(screen.getByRole("button", { name: "Пауза озвучки" }));
    expect(cancel).toHaveBeenCalled();

    speak.mockClear();
    await user.click(
      screen.getByRole("button", { name: "Продолжить озвучку" }),
    );
    expect(speak).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: "Пауза озвучки" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.queryByRole("button", { name: /Остановить/ }),
    ).not.toBeInTheDocument();
  });

  it("английский интерфейс — свои подписи", async () => {
    const user = userEvent.setup();
    render(<EntrySpeakButton locale="en" entryId="e2" text="The soul." />);
    await user.click(screen.getByRole("button", { name: "Read aloud" }));
    await user.click(screen.getByRole("button", { name: "Pause reading" }));
    expect(
      screen.getByRole("button", { name: "Resume reading" }),
    ).toBeInTheDocument();
  });
});
