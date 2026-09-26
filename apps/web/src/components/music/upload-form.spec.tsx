import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MusicUploadForm } from "./upload-form";

const uploadMusicTrack = vi.fn();
const fetchMusicUploadUsage = vi.fn();

vi.mock("@/lib/music-client-api", () => ({
  uploadMusicTrack: (...args: unknown[]) => uploadMusicTrack(...args),
  fetchMusicUploadUsage: () => fetchMusicUploadUsage(),
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
  // По умолчанию сведений о месте нет — решает сервер, как раньше.
  fetchMusicUploadUsage.mockReset().mockRejectedValue(new Error("offline"));
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
        null,
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
        null,
        null,
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

describe("MusicUploadForm — со страницы исполнителя (VED-114)", () => {
  it("называет исполнителя и отправляет его с каждым файлом", async () => {
    const user = userEvent.setup();
    render(<MusicUploadForm artist={{ id: "a1", name: "Avantika" }} />);

    expect(screen.getByText("Avantika")).toBeInTheDocument();

    await fillForm(user);
    await user.click(screen.getByRole("button", { name: /Загрузить/i }));

    await waitFor(() =>
      expect(uploadMusicTrack).toHaveBeenCalledWith(
        expect.any(File),
        "own_recording",
        expect.any(Function),
        null,
        "a1",
        null,
      ),
    );
  });
});

describe("MusicUploadForm — из редактора книги (VED-297)", () => {
  it("называет книгу и отправляет её с каждым файлом", async () => {
    const user = userEvent.setup();
    render(
      <MusicUploadForm audiobook={{ id: "book-1", title: "Бхагавад-гита" }} />,
    );

    expect(screen.getByText("Бхагавад-гита")).toBeInTheDocument();

    await fillForm(user);
    await user.click(screen.getByRole("button", { name: /Загрузить/i }));

    await waitFor(() =>
      expect(uploadMusicTrack).toHaveBeenCalledWith(
        expect.any(File),
        "own_recording",
        expect.any(Function),
        null,
        null,
        "book-1",
      ),
    );
  });
});

describe("MusicUploadForm — место для загрузок", () => {
  it("не поместившиеся файлы не отправляет и пишет одно сообщение", async () => {
    const user = userEvent.setup();
    // Свободно 10 байт: первый файл (4 байта) влезает, второй (20) — нет.
    fetchMusicUploadUsage.mockResolvedValue({
      usedBytes: 90,
      quotaBytes: 100,
      maxUploadBytes: 1000,
      acceptedMime: ["audio/mpeg"],
    });
    render(<MusicUploadForm />);

    await user.upload(screen.getByLabelText(/Файлы/i), [
      new File(["звук"], "one.mp3", { type: "audio/mpeg" }),
      new File(["a".repeat(20)], "two.mp3", { type: "audio/mpeg" }),
    ]);
    await user.selectOptions(
      screen.getByLabelText(/Основание/i),
      "own_recording",
    );
    await user.click(screen.getByRole("button", { name: /Загрузить/i }));

    await waitFor(() =>
      expect(screen.getByText(/Не поместилось 1 из 2/)).toBeInTheDocument(),
    );
    expect(uploadMusicTrack).toHaveBeenCalledTimes(1);
    expect(screen.getByText("нет места")).toBeInTheDocument();
  });

  it("отказ сервера по квоте останавливает партию", async () => {
    const user = userEvent.setup();
    uploadMusicTrack.mockRejectedValue(
      new Error(
        "Закончилось место. Удалите старые загрузки или напишите в поддержку.",
      ),
    );
    render(<MusicUploadForm />);

    await user.upload(screen.getByLabelText(/Файлы/i), [
      new File(["1"], "a.mp3", { type: "audio/mpeg" }),
      new File(["2"], "b.mp3", { type: "audio/mpeg" }),
      new File(["3"], "c.mp3", { type: "audio/mpeg" }),
    ]);
    await user.selectOptions(
      screen.getByLabelText(/Основание/i),
      "own_recording",
    );
    await user.click(screen.getByRole("button", { name: /Загрузить/i }));

    await waitFor(() =>
      expect(
        screen.getByText(/Ни один файл не поместился/),
      ).toBeInTheDocument(),
    );
    expect(uploadMusicTrack).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText("нет места")).toHaveLength(3);
  });
});
