import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MusicUploadForm } from "./upload-form";

const uploadMusicTrack = vi.fn();

vi.mock("@/lib/music-client-api", () => ({
  uploadMusicTrack: (...args: unknown[]) => uploadMusicTrack(...args),
}));

vi.mock("@/lib/music-playback-api", () => ({ getTrack: vi.fn() }));
vi.mock("@/lib/music/offline-manager", () => ({
  keepUploadedTrackOffline: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
// Плеер нужен форме только ради офлайн-хранилища; без него копия не кладётся.
vi.mock("./player/player-provider", () => ({
  useMusicPlayer: () => null,
}));

async function fillForm(user: ReturnType<typeof userEvent.setup>) {
  const file = new File(["звук"], "gaura.mp3", { type: "audio/mpeg" });
  await user.upload(screen.getByLabelText(/Файлы/i), file);
  await user.selectOptions(screen.getByLabelText(/Основание/i), "own_recording");
}

beforeEach(() => {
  uploadMusicTrack.mockReset().mockResolvedValue({
    trackId: "t1",
    status: "published",
    title: "Gaura",
    durationSeconds: 100,
  });
});

describe("MusicUploadForm — матх записи", () => {
  it("не выбран — запись уходит «для всех»", async () => {
    const user = userEvent.setup();
    render(<MusicUploadForm />);

    await fillForm(user);
    await user.click(screen.getByRole("button", { name: /Загрузить/i }));

    // `null`, а не линия из профиля: сервер её больше не подставляет, и
    // подставлять её здесь означало бы вернуть ту же ошибку на фронт.
    await waitFor(() =>
      expect(uploadMusicTrack).toHaveBeenCalledWith(
        expect.any(File),
        "own_recording",
        expect.any(Function),
        null,
      ),
    );
  });

  it("выбранный матх уходит с записью", async () => {
    const user = userEvent.setup();
    render(<MusicUploadForm />);

    await fillForm(user);
    await user.selectOptions(
      screen.getByLabelText(/Матх или линия записи/i),
      "sri_chaitanya_saraswat_math",
    );
    await user.click(screen.getByRole("button", { name: /Загрузить/i }));

    await waitFor(() =>
      expect(uploadMusicTrack).toHaveBeenCalledWith(
        expect.any(File),
        "own_recording",
        expect.any(Function),
        "sri_chaitanya_saraswat_math",
      ),
    );
  });

  it("пустой вариант стоит первым: это умолчание, а не «не знаю»", () => {
    render(<MusicUploadForm />);

    const select = screen.getByLabelText(/Матх или линия записи/i);
    expect(select).toHaveValue("");
    expect(select.querySelector("option")).toHaveTextContent("Слышат все");
  });
});
