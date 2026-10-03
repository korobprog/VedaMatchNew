import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MusicTrackMarksButtons } from "./track-marks-button";

const refresh = vi.fn();
const updateMusicTrack = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("@/lib/music-admin-client-api", () => ({
  updateMusicTrack: (...args: unknown[]) => updateMusicTrack(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

/* VED-715: «везде, где встречаются эти две кнопки-значка, объедини их в
   один — фильтры как на главной». */
describe("MusicTrackMarksButtons (VED-715)", () => {
  it("участнику — одна кнопка: ступени и линия записи, только показ", async () => {
    render(
      <MusicTrackMarksButtons
        trackId="t1"
        audienceStages={["yogi"]}
        lineage="iskcon"
        artistLineage={null}
        canEdit={false}
      />,
    );
    const trigger = screen.getByRole("button", {
      name: "Самоидентификация: Йог. Запись: ISKCON. Исполнитель: Линия не указана",
    });
    await userEvent.click(trigger);

    expect(screen.getByText("Йог")).toBeDefined();
    expect(screen.getByText("Исполнитель")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Сохранить" })).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("редакция Музыки меняет и ступени, и линию в том же окне", async () => {
    updateMusicTrack.mockResolvedValue({});
    render(
      <MusicTrackMarksButtons
        trackId="t1"
        audienceStages={[]}
        lineage={null}
        canEdit
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: /^Самоидентификация/ }),
    );
    expect(
      screen.getByRole("group", { name: "Ступени самоидентификации" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Духовная линия" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Преданный" }));
    await userEvent.click(screen.getByRole("button", { name: "ISKCON" }));
    await userEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() =>
      expect(updateMusicTrack).toHaveBeenCalledWith("t1", {
        audienceStages: ["devotee"],
      }),
    );
    expect(updateMusicTrack).toHaveBeenCalledWith("t1", { lineage: "iskcon" });
    expect(refresh).toHaveBeenCalled();
  });
});
