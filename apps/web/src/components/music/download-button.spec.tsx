import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MusicDownloadButton } from "./download-button";

const fetchTrackDownloadUrl = vi.fn();

vi.mock("@/lib/music-playback-api", () => ({
  fetchTrackDownloadUrl: (...args: unknown[]) => fetchTrackDownloadUrl(...args),
}));

const assign = vi.fn();
const realLocation = window.location;

beforeEach(() => {
  fetchTrackDownloadUrl.mockReset();
  assign.mockReset();
  // jsdom переход по адресу не умеет — подменяем только `assign`.
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...realLocation, assign },
  });
});

afterEach(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: realLocation,
  });
});

describe("MusicDownloadButton (VED-107)", () => {
  it("берёт свежую ссылку и уводит браузер на неё — файл сохраняется", async () => {
    fetchTrackDownloadUrl.mockResolvedValue({
      url: "https://s3.example/t1?disposition",
      expiresInSeconds: 21600,
    });
    const user = userEvent.setup();
    render(<MusicDownloadButton trackId="t1" />);

    await user.click(screen.getByRole("button", { name: "Скачать файл" }));

    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith("https://s3.example/t1?disposition"),
    );
    expect(fetchTrackDownloadUrl).toHaveBeenCalledWith("t1");
  });

  it("запись сняли — говорит об этом, а не молчит", async () => {
    fetchTrackDownloadUrl.mockRejectedValue(
      new Error("Запись больше не доступна"),
    );
    const user = userEvent.setup();
    render(<MusicDownloadButton trackId="t1" />);

    await user.click(screen.getByRole("button", { name: "Скачать файл" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Запись больше не доступна",
    );
    expect(assign).not.toHaveBeenCalled();
  });
});
