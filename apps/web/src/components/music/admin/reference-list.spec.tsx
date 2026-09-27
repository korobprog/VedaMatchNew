import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MusicReferenceList,
  type MusicReferenceRow,
} from "./reference-list";
import {
  deleteMusicArtist,
  setMusicArtistLineage,
  updateMusicArtist,
} from "@/lib/music-admin-client-api";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/music-admin-client-api", () => ({
  deleteMusicAlbum: vi.fn(),
  deleteMusicArtist: vi.fn(),
  deleteMusicCategory: vi.fn(),
  setMusicArtistLineage: vi.fn(),
  updateMusicAlbum: vi.fn(),
  updateMusicArtist: vi.fn(),
  updateMusicCategory: vi.fn(),
}));
// Настоящее поле обложки тянет заливку в бакет: здесь важно, что уходит на
// сервер, а не как выбирается файл.
vi.mock("@/components/music/cover-field", () => ({
  MusicCoverField: ({
    onChange,
  }: {
    onChange: (key: string | null) => void;
  }) => (
    <div>
      <button type="button" onClick={() => onChange("music/covers/artist/u/1.jpg")}>
        Выбрать файл
      </button>
      <button type="button" onClick={() => onChange(null)}>
        Снять
      </button>
    </div>
  ),
}));

const artist: MusicReferenceRow = {
  id: "a1",
  primary: "Avantika devi dasi",
  secondary: "19 записей",
  badge: null,
  coverUrl: null,
};

function renderList(rows: MusicReferenceRow[] = [artist]) {
  render(
    <MusicReferenceList
      kind="artist"
      title="Исполнители"
      empty="Пока никого."
      rows={rows}
    />,
  );
}

beforeEach(() => vi.mocked(updateMusicArtist).mockReset());

describe("MusicReferenceList — обложка (VED-19)", () => {
  it("сохраняет выбранную обложку у заведённого исполнителя", async () => {
    vi.mocked(updateMusicArtist).mockResolvedValue({} as never);
    const user = userEvent.setup();
    renderList();

    await user.click(
      screen.getByRole("button", { name: "Обложка «Avantika devi dasi»" }),
    );
    await user.click(screen.getByRole("button", { name: "Выбрать файл" }));
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(updateMusicArtist).toHaveBeenCalledWith("a1", {
      coverKey: "music/covers/artist/u/1.jpg",
    });
  });

  // Нажатие сразу после открытия сняло бы обложку, которая уже стоит.
  it("пока обложку не трогали, сохранять нечего", async () => {
    const user = userEvent.setup();
    renderList([{ ...artist, coverUrl: "https://api.test/cover.jpg" }]);

    await user.click(
      screen.getByRole("button", { name: "Обложка «Avantika devi dasi»" }),
    );

    expect(screen.getByRole("button", { name: "Сохранить" })).toBeDisabled();
    expect(updateMusicArtist).not.toHaveBeenCalled();
  });

  it("«Снять» и сохранение убирают обложку", async () => {
    vi.mocked(updateMusicArtist).mockResolvedValue({} as never);
    const user = userEvent.setup();
    renderList([{ ...artist, coverUrl: "https://api.test/cover.jpg" }]);

    await user.click(
      screen.getByRole("button", { name: "Обложка «Avantika devi dasi»" }),
    );
    await user.click(screen.getByRole("button", { name: "Снять" }));
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(updateMusicArtist).toHaveBeenCalledWith("a1", { coverKey: null });
  });

  it("у раздела каталога обложки нет", () => {
    render(
      <MusicReferenceList
        kind="category"
        title="Разделы"
        empty="Пусто."
        rows={[{ id: "c1", primary: "Киртан", secondary: "0 записей", badge: null }]}
      />,
    );

    expect(screen.queryByRole("button", { name: /Обложка/ })).toBeNull();
  });
});

// VED-165: переключатель «Корневая»/«Стиль» — без него узнать и поправить
// вид раздела можно было бы только запросом в базу.
describe("MusicReferenceList — вид раздела (VED-165)", () => {
  it("нажатие переключает style → root и обратно", async () => {
    const { updateMusicCategory } = await import("@/lib/music-admin-client-api");
    vi.mocked(updateMusicCategory).mockResolvedValue({} as never);
    const user = userEvent.setup();
    render(
      <MusicReferenceList
        kind="category"
        title="Разделы"
        empty="Пусто."
        rows={[
          {
            id: "c1",
            primary: "Мантра",
            secondary: "3 записи",
            badge: null,
            categoryKind: "style",
          },
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /сейчас: стиль/ }));

    expect(updateMusicCategory).toHaveBeenCalledWith("c1", { kind: "root" });
  });

  it("без categoryKind переключатель не показывается", () => {
    render(
      <MusicReferenceList
        kind="category"
        title="Разделы"
        empty="Пусто."
        rows={[{ id: "c1", primary: "Мантра", secondary: "3 записи", badge: null }]}
      />,
    );

    expect(screen.queryByRole("button", { name: /сейчас:/ })).toBeNull();
  });
});

describe("MusicReferenceList — линия исполнителя (VED-566)", () => {
  // В скобках: стрелка, вернувшая мок, стала бы для vitest уборкой после
  // теста — и он позвал бы отказывающий мок ещё раз, уже без обработчика.
  beforeEach(() => {
    vi.mocked(setMusicArtistLineage).mockReset();
  });

  it("показывает текущую линию исполнителя в селекте с именем в подписи", () => {
    renderList([{ ...artist, lineage: "iskcon" }]);

    const select = screen.getByRole("combobox", {
      name: "Линия: Avantika devi dasi",
    });
    expect(select).toHaveValue("iskcon");
    // «Без линии» — первой строкой, дальше линии без строк-заголовков
    // групп (VED-288).
    expect(select.querySelector("option")).toHaveTextContent("Без линии");
    expect(select.querySelector("optgroup")).toBeNull();
  });

  it("без линии у исполнителя стоит «Без линии»", () => {
    renderList([{ ...artist, lineage: null }]);

    expect(
      screen.getByRole("combobox", { name: "Линия: Avantika devi dasi" }),
    ).toHaveValue("");
  });

  it("выбор уходит на сервер и говорит, скольким записям проставлена линия", async () => {
    vi.mocked(setMusicArtistLineage).mockResolvedValue({
      artist: {
        id: "a1",
        name: "Avantika devi dasi",
        lineage: "sri_chaitanya_saraswat_math",
      },
      updatedTracks: 19,
    });
    const user = userEvent.setup();
    renderList([{ ...artist, lineage: null }]);

    const select = screen.getByRole("combobox", {
      name: "Линия: Avantika devi dasi",
    });
    // Два шага (VED-568): группа, затем матх — сохраняется только он.
    await user.selectOptions(select, "gaudiya_math");
    expect(setMusicArtistLineage).not.toHaveBeenCalled();
    const detail = screen.getByRole("combobox", {
      name: "Линия: Avantika devi dasi: какой именно матх",
    });
    await user.selectOptions(detail, "sri_chaitanya_saraswat_math");

    expect(setMusicArtistLineage).toHaveBeenCalledWith("a1", {
      lineage: "sri_chaitanya_saraswat_math",
    });
    expect(select).toHaveValue("gaudiya_math");
    expect(detail).toHaveValue("sri_chaitanya_saraswat_math");
    expect(await screen.findByRole("status")).toHaveTextContent(
      "проставлена записям исполнителя: 19",
    );
    // Общая правка исполнителя этим выбором не зовётся.
    expect(updateMusicArtist).not.toHaveBeenCalled();
  });

  it("«Без линии» уходит как null", async () => {
    vi.mocked(setMusicArtistLineage).mockResolvedValue({
      artist: { id: "a1", name: "Avantika devi dasi", lineage: null },
      updatedTracks: 7,
    });
    const user = userEvent.setup();
    renderList([{ ...artist, lineage: "iskcon" }]);

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Линия: Avantika devi dasi" }),
      "",
    );

    expect(setMusicArtistLineage).toHaveBeenCalledWith("a1", { lineage: null });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Линия снята у исполнителя и его записей: 7",
    );
  });

  it("сервер отказал — селект возвращается к прежней линии и показана ошибка", async () => {
    vi.mocked(setMusicArtistLineage).mockRejectedValue(
      new Error("Доступ только для администратора сервиса"),
    );
    const user = userEvent.setup();
    renderList([{ ...artist, lineage: "iskcon" }]);

    const select = screen.getByRole("combobox", {
      name: "Линия: Avantika devi dasi",
    });
    await user.selectOptions(select, "gaudiya_math");
    await user.selectOptions(
      screen.getByRole("combobox", {
        name: "Линия: Avantika devi dasi: какой именно матх",
      }),
      "ipbys",
    );

    expect(
      await screen.findByText("Доступ только для администратора сервиса"),
    ).toBeInTheDocument();
    expect(select).toHaveValue("iskcon");
  });

  it("без поля lineage у строки селекта нет", () => {
    renderList();

    expect(
      screen.queryByRole("combobox", { name: "Линия: Avantika devi dasi" }),
    ).toBeNull();
  });
});

describe("MusicReferenceList — имя исполнителя вместо «медиатека» (VED-572)", () => {
  it("у исполнителя в каталоге Медиатеки подписи «медиатека» нет", () => {
    renderList([{ ...artist, isAudiobook: false }]);

    expect(screen.queryByText("медиатека")).toBeNull();
    expect(screen.queryByRole("button", { name: /Медиатеки/ })).toBeNull();
  });

  it("имя не обрезается в одну строку, полное — в подсказке", () => {
    renderList([{ ...artist, isAudiobook: false }]);

    const name = screen.getByText("Avantika devi dasi");
    expect(name).toHaveAttribute("title", "Avantika devi dasi");
    expect(name).not.toHaveClass("truncate");
    expect(name).toHaveClass("line-clamp-2");
  });

  it("чтеца видно, и нажатие возвращает его в каталог", async () => {
    vi.mocked(updateMusicArtist).mockResolvedValue(
      {} as Awaited<ReturnType<typeof updateMusicArtist>>,
    );
    renderList([{ ...artist, isAudiobook: true }]);

    await userEvent.click(
      screen.getByRole("button", { name: /Avantika devi dasi».*чтец/ }),
    );
    expect(updateMusicArtist).toHaveBeenCalledWith("a1", {
      isAudiobook: false,
    });
  });
});

describe("MusicReferenceList — удаление исполнителя с записями (VED-576)", () => {
  beforeEach(() => vi.mocked(deleteMusicArtist).mockReset());

  it("исполнителя с записями удаляет вместе с ними, назвав их число", async () => {
    vi.mocked(deleteMusicArtist).mockResolvedValue({});
    const user = userEvent.setup();
    renderList([{ ...artist, trackCount: 19 }]);

    await user.click(
      screen.getByRole("button", { name: "Удалить «Avantika devi dasi»" }),
    );
    expect(
      screen.getByText(/вместе с записями \(19\) безвозвратно/),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Удалить с записями" }),
    );

    expect(deleteMusicArtist).toHaveBeenCalledWith("a1", { withTracks: true });
  });

  it("пустого исполнителя удаляет без записей", async () => {
    vi.mocked(deleteMusicArtist).mockResolvedValue({});
    const user = userEvent.setup();
    renderList([{ ...artist, trackCount: 0 }]);

    await user.click(
      screen.getByRole("button", { name: "Удалить «Avantika devi dasi»" }),
    );
    await user.click(screen.getByRole("button", { name: "Удалить" }));

    expect(deleteMusicArtist).toHaveBeenCalledWith("a1", { withTracks: false });
  });
});
