import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MusicArtistsFromTagsResult } from "@vedamatch/shared";
import { MusicArtistsFromTags } from "./artists-from-tags";
import { scanMusicArtistsFromTags } from "@/lib/music-admin-client-api";

vi.mock("@/lib/music-admin-client-api", () => ({
  scanMusicArtistsFromTags: vi.fn(),
}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

function result(
  over: Partial<MusicArtistsFromTagsResult> = {},
): MusicArtistsFromTagsResult {
  return {
    scanned: 3,
    withTag: 3,
    artistsCreated: 2,
    artistsMatched: 0,
    tracksLinked: 0,
    remaining: 3,
    fromTitle: 3,
    titlesRenamed: 3,
    nextCursor: null,
    dryRun: true,
    groups: [
      {
        name: "Jahnavi Dasi",
        key: "jahnavi dasi",
        trackCount: 2,
        existed: false,
        fromTitle: 2,
        renameCount: 2,
        renames: [
          { before: "Jahnavi Dasi - Maha Mantra", after: "Maha Mantra" },
          { before: "Jahnavi Dasi - Jugala Milane", after: "Jugala Milane" },
        ],
        skipped: false,
      },
      {
        name: "Maha Mantra",
        key: "maha mantra",
        trackCount: 1,
        existed: false,
        fromTitle: 1,
        renameCount: 1,
        renames: [{ before: "Maha Mantra - Live", after: "Live" }],
        skipped: false,
      },
    ],
    ...over,
  };
}

beforeEach(() => {
  vi.mocked(scanMusicArtistsFromTags).mockReset();
  refresh.mockReset();
});

describe("MusicArtistsFromTags", () => {
  // Заводить вслепую нельзя: галочки появляются только после предпросмотра.
  it("does not let anyone apply before looking at the names", () => {
    render(<MusicArtistsFromTags />);
    expect(screen.getByRole("button", { name: "Завести и привязать" })).toBeDisabled();
  });

  it("shows where a name came from and how the titles will change", async () => {
    vi.mocked(scanMusicArtistsFromTags).mockResolvedValueOnce(result());
    const user = userEvent.setup();
    render(<MusicArtistsFromTags />);

    await user.click(screen.getByRole("button", { name: "Посмотреть, что получится" }));

    const list = screen.getByRole("list", { name: "Найденные исполнители" });
    const jahnavi = within(list).getByText("Jahnavi Dasi").closest("li")!;
    expect(within(jahnavi).getByText("из названия")).toBeInTheDocument();
    expect(
      within(jahnavi).getByText("«Jahnavi Dasi - Maha Mantra» → «Maha Mantra»"),
    ).toBeInTheDocument();
    expect(scanMusicArtistsFromTags).toHaveBeenCalledWith(true, {
      after: undefined,
      skip: [],
    });
  });

  // «Maha Mantra - Live» — не исполнитель: редакция снимает его галочкой.
  it("leaves out the names the editor unchecked", async () => {
    vi.mocked(scanMusicArtistsFromTags)
      .mockResolvedValueOnce(result())
      .mockResolvedValueOnce(result({ dryRun: false, tracksLinked: 2 }));
    const user = userEvent.setup();
    render(<MusicArtistsFromTags />);

    await user.click(screen.getByRole("button", { name: "Посмотреть, что получится" }));
    await user.click(screen.getByRole("checkbox", { name: /Maha Mantra/ }));
    await user.click(screen.getByRole("button", { name: "Завести и привязать" }));

    expect(scanMusicArtistsFromTags).toHaveBeenLastCalledWith(false, {
      after: undefined,
      skip: ["maha mantra"],
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("moves on to the next records with the cursor", async () => {
    vi.mocked(scanMusicArtistsFromTags)
      .mockResolvedValueOnce(result({ nextCursor: "c-1" }))
      .mockResolvedValueOnce(result());
    const user = userEvent.setup();
    render(<MusicArtistsFromTags />);

    await user.click(screen.getByRole("button", { name: "Посмотреть, что получится" }));
    await user.click(screen.getByRole("button", { name: "Следующие записи" }));

    expect(scanMusicArtistsFromTags).toHaveBeenLastCalledWith(true, {
      after: "c-1",
      skip: [],
    });
  });
});
