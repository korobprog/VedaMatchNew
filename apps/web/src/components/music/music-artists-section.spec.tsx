import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import type { MusicArtistDto } from "@vedamatch/shared";
import { MusicArtistsSection } from "./music-artists-section";

function artist(over: Partial<MusicArtistDto> = {}): MusicArtistDto {
  return {
    id: "a1",
    slug: "shanti-people",
    name: "Shanti people",
    kind: "group",
    bio: null,
    coverUrl: null,
    isVerified: false,
    trackCount: 3,
    rootCategoryId: null,
    isAudiobook: false,
    ...over,
  };
}

const artists = [
  artist(),
  artist({ id: "a2", slug: "vrindavan", name: "Vrindavan", trackCount: 1 }),
];

beforeEach(() => {
  localStorage.clear();
});

describe("MusicArtistsSection", () => {
  it("по умолчанию рисует сетку кружков", () => {
    render(<MusicArtistsSection artists={artists} />);

    expect(
      screen.getByRole("button", { name: /Списком/ }),
    ).toHaveAttribute("aria-pressed", "false");
    // Имя — под кружком, число записей — в самом кружке (VED-516); словами
    // оно остаётся в имени ссылки для скринридера.
    expect(
      screen.getByRole("link", { name: /Shanti people, 3 записи/ }),
    ).toBeInTheDocument();
  });

  it("переключает на список компактных строк с именем и числом записей", async () => {
    const user = userEvent.setup();
    render(<MusicArtistsSection artists={artists} />);

    await user.click(screen.getByRole("button", { name: /Списком/ }));

    // Две кнопки вида (VED-516): нажатая — «Списком», «Плиткой» отжата.
    expect(
      screen.getByRole("button", { name: /Списком/ }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: /Плиткой/ }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("3 записи")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Vrindavan/ }),
    ).toHaveAttribute("href", "/music/artists/vrindavan");
  });

  it("запоминает выбор в localStorage под своим ключом и не трогает ключ записей", async () => {
    const user = userEvent.setup();
    const first = render(<MusicArtistsSection artists={artists} />);

    await user.click(screen.getByRole("button", { name: /Списком/ }));

    expect(localStorage.getItem("vm.music.artistsView")).toBe("list");
    expect(localStorage.getItem("vm.music.view")).toBeNull();
    first.unmount();

    // Повторный монтаж — режим уже сохранён и открывается сразу списком.
    render(<MusicArtistsSection artists={artists} />);
    expect(
      await screen.findByRole("button", { name: /Списком/, pressed: true }),
    ).toBeInTheDocument();
  });
});
