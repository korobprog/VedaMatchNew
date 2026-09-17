import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { ChatVoicePlayer } from "./chat-voice-player";
import { VOICE_SPEED_KEY } from "./voice-speed";

function renderPlayers(count = 1) {
  return render(
    <>
      {Array.from({ length: count }, (_, index) => (
        <ChatVoicePlayer
          key={index}
          url={`https://example.test/${index}.webm`}
          waveform={[]}
          duration="0:05"
        />
      ))}
    </>,
  );
}

describe("ChatVoicePlayer — скорость", () => {
  beforeEach(() => window.localStorage.clear());

  it("переключает скорость по кругу и запоминает её", async () => {
    const { container } = renderPlayers();
    const button = screen.getByRole("button", { name: /Скорость 1×/ });
    const audio = container.querySelector("audio")!;

    await userEvent.click(button);
    expect(button).toHaveTextContent("1.5×");
    expect(audio.playbackRate).toBe(1.5);
    expect(window.localStorage.getItem(VOICE_SPEED_KEY)).toBe("1.5");

    for (const label of ["2×", "2.5×", "3×", "1×"]) {
      await userEvent.click(button);
      expect(button).toHaveTextContent(label);
    }
  });

  it("берёт сохранённую скорость и меняет её у всех голосовых сразу", async () => {
    window.localStorage.setItem(VOICE_SPEED_KEY, "2");
    renderPlayers(2);
    const buttons = screen.getAllByRole("button", { name: /Скорость/ });
    expect(buttons.map((b) => b.textContent)).toEqual(["2×", "2×"]);

    await userEvent.click(buttons[0]);
    expect(buttons.map((b) => b.textContent)).toEqual(["2.5×", "2.5×"]);
  });
});
