import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MusicArtistBioButton } from "./artist-bio-button";

const updateMusicArtist = vi.fn();
const refresh = vi.fn();
vi.mock("@/lib/music-admin-client-api", () => ({
  updateMusicArtist: (...args: unknown[]) => updateMusicArtist(...args),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

beforeEach(() => {
  updateMusicArtist.mockReset().mockResolvedValue({});
  refresh.mockReset();
});

/* VED-661: «Биография» — кнопкой в строке «Записи». */
describe("MusicArtistBioButton", () => {
  it("слушатель видит биографию по кнопке", async () => {
    const user = userEvent.setup();
    render(
      <MusicArtistBioButton
        artistId="a1"
        bio="Поёт с 1998 года"
        canEdit={false}
      />,
    );

    expect(screen.queryByText("Поёт с 1998 года")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Биография" }));
    expect(screen.getByText("Поёт с 1998 года")).toBeInTheDocument();
  });

  it("без биографии слушателю кнопки нет", () => {
    render(<MusicArtistBioButton artistId="a1" bio={null} canEdit={false} />);
    expect(screen.queryByRole("button", { name: "Биография" })).toBeNull();
  });

  it("редакция пишет биографию в поле и сохраняет", async () => {
    const user = userEvent.setup();
    render(<MusicArtistBioButton artistId="a1" bio={null} canEdit />);

    await user.click(screen.getByRole("button", { name: "Биография" }));
    await user.type(
      screen.getByLabelText("Биография исполнителя"),
      "Киртаны Маяпура",
    );
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() =>
      expect(updateMusicArtist).toHaveBeenCalledWith("a1", {
        bio: "Киртаны Маяпура",
      }),
    );
    expect(refresh).toHaveBeenCalled();
  });
});
