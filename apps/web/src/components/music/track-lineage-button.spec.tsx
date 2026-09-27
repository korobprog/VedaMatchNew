import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MusicTrackLineageButton } from "./track-lineage-button";

const refresh = vi.fn();
const updateMusicTrack = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("@/lib/music-admin-client-api", () => ({
  updateMusicTrack: (...args: unknown[]) => updateMusicTrack(...args),
}));

afterEach(() => {
  refresh.mockClear();
  updateMusicTrack.mockReset();
});

describe("MusicTrackLineageButton", () => {
  it("не видна не-редакции Музыки", () => {
    const { container } = render(
      <MusicTrackLineageButton trackId="t1" lineage={null} canEdit={false} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("редакции — видна, выбор пишет линию записи", async () => {
    updateMusicTrack.mockResolvedValue({});
    render(<MusicTrackLineageButton trackId="t1" lineage={null} canEdit />);

    await userEvent.click(
      screen.getByRole("button", { name: "Линия: для всех линий" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Шри Чайтанья Сарасват Матх" }),
    );

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(updateMusicTrack).toHaveBeenCalledWith("t1", {
      lineage: "sri_chaitanya_saraswat_math",
    });
  });
});
