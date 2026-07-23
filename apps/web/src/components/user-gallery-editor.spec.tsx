import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  UserGalleryState,
  UserPhotoDto,
  UserPhotoUploadResponse,
} from "@vedamatch/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UserGalleryEditor } from "./user-gallery-editor";

const API_URL = "http://localhost:4000";

function photo(overrides: Partial<UserPhotoDto> = {}): UserPhotoDto {
  return {
    id: "photo-1",
    url: "https://signed.test/photo-1",
    sizeBytes: 1024,
    width: 1200,
    height: 800,
    isPublic: false,
    sortOrder: 0,
    createdAt: "2026-07-23T00:00:00.000Z",
    updatedAt: "2026-07-23T00:00:00.000Z",
    ...overrides,
  };
}

function gallery(photos: UserPhotoDto[] = []): UserGalleryState {
  return {
    photos,
    usedBytes: photos.reduce((sum, item) => sum + item.sizeBytes, 0),
    quotaBytes: 250 * 1024 * 1024,
  };
}

function jsonResponse<T>(body: T, ok = true): Response {
  return {
    ok,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(ok ? "" : "request failed"),
  } as unknown as Response;
}

const dataTransfer = {
  effectAllowed: "uninitialized",
  dropEffect: "none",
  setData: vi.fn(),
  getData: vi.fn(),
};

describe("UserGalleryEditor", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const createObjectURL = vi.fn(() => "blob:preview");
  const revokeObjectURL = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    createObjectURL.mockReset();
    createObjectURL.mockReturnValue("blob:preview");
    revokeObjectURL.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("confirm", vi.fn(() => true));
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL,
    });
    fetchMock.mockResolvedValue(jsonResponse(gallery()));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("loads the gallery with credentials and renders quota and API order", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        gallery([
          photo({ id: "second", url: "https://signed.test/second", sortOrder: 1 }),
          photo({ id: "first", url: "https://signed.test/first", sortOrder: 0 }),
        ]),
      ),
    );

    render(<UserGalleryEditor />);

    expect(fetchMock).toHaveBeenCalledWith(`${API_URL}/profile/photos`, {
      credentials: "include",
      signal: expect.any(AbortSignal),
    });
    expect(await screen.findByText(/Занято 2.0 КБ/)).toBeInTheDocument();
    expect(screen.getByText(/Доступно 250.0 МБ/)).toBeInTheDocument();
    expect(
      screen.getAllByAltText("Фото галереи профиля").map((image) => image.getAttribute("src")),
    ).toEqual(["https://signed.test/second", "https://signed.test/first"]);
  });

  it("configures the picker for supported multiple images", async () => {
    render(<UserGalleryEditor />);
    await screen.findByText("В галерее пока нет фотографий.");

    const input = screen.getByLabelText("Выберите несколько фото");
    expect(input).toHaveAttribute("multiple");
    expect(input).toHaveAttribute(
      "accept",
      "image/jpeg,image/png,image/webp",
    );
  });

  it("rejects invalid local files individually and uploads remaining files together", async () => {
    const user = userEvent.setup({ applyAccept: false });
    const validJpeg = new File(["jpeg"], "valid.jpg", { type: "image/jpeg" });
    const validPng = new File(["png"], "valid.png", { type: "image/png" });
    const unsupported = new File(["gif"], "bad.gif", { type: "image/gif" });
    const tooLarge = new File(["large"], "large.webp", { type: "image/webp" });
    Object.defineProperty(tooLarge, "size", { value: 20 * 1024 * 1024 + 1 });

    const result: UserPhotoUploadResponse = {
      uploaded: [
        { fileName: "valid.jpg", photo: photo({ id: "uploaded-1" }) },
        {
          fileName: "valid.png",
          photo: photo({ id: "uploaded-2", sortOrder: 1 }),
        },
      ],
      failed: [],
      usedBytes: 2048,
      quotaBytes: 250 * 1024 * 1024,
    };
    fetchMock
      .mockResolvedValueOnce(jsonResponse(gallery()))
      .mockResolvedValueOnce(jsonResponse(result));

    render(<UserGalleryEditor />);
    await screen.findByText("В галерее пока нет фотографий.");

    await user.upload(screen.getByLabelText("Выберите несколько фото"), [
      validJpeg,
      unsupported,
      tooLarge,
      validPng,
    ]);

    expect(screen.getByText(/bad\.gif: разрешены только/)).toBeInTheDocument();
    expect(screen.getByText(/large\.webp: размер файла превышает 20 МБ/)).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Загрузить выбранные фото" }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [, request] = fetchMock.mock.calls[1];
    expect(request).toMatchObject({ method: "POST", credentials: "include" });
    const formData = request?.body as FormData;
    expect(formData.getAll("files")).toEqual([validJpeg, validPng]);
    expect(await screen.findByText(/valid\.jpg: фото загружено как приватное/)).toBeInTheDocument();
    expect(screen.getByText(/valid\.png: фото загружено как приватное/)).toBeInTheDocument();
    expect(screen.getAllByText("Приватное")).toHaveLength(2);
  });

  it("renders every server upload success and failure without suppressing successes", async () => {
    const user = userEvent.setup();
    const first = new File(["one"], "one.jpg", { type: "image/jpeg" });
    const second = new File(["two"], "two.png", { type: "image/png" });
    const result: UserPhotoUploadResponse = {
      uploaded: [{ fileName: "one.jpg", photo: photo({ id: "new-photo" }) }],
      failed: [
        {
          fileName: "two.png",
          code: "quota_exceeded",
          message: "Недостаточно места",
        },
      ],
      usedBytes: 1024,
      quotaBytes: 2048,
    };
    fetchMock
      .mockResolvedValueOnce(jsonResponse(gallery()))
      .mockResolvedValueOnce(jsonResponse(result));

    render(<UserGalleryEditor />);
    await screen.findByText("В галерее пока нет фотографий.");
    await user.upload(screen.getByLabelText("Выберите несколько фото"), [
      first,
      second,
    ]);
    await user.click(screen.getByRole("button", { name: /Загрузить выбранные/ }));

    expect(await screen.findByText(/one\.jpg: фото загружено как приватное/)).toBeInTheDocument();
    expect(screen.getByText("two.png: Недостаточно места")).toBeInTheDocument();
    expect(screen.getByAltText("Фото галереи профиля")).toHaveAttribute(
      "src",
      "https://signed.test/photo-1",
    );
  });

  it("shows per-file progress while a multi-file upload is pending", async () => {
    const user = userEvent.setup();
    let finishUpload!: (response: Response) => void;
    const pendingUpload = new Promise<Response>((resolve) => {
      finishUpload = resolve;
    });
    fetchMock
      .mockResolvedValueOnce(jsonResponse(gallery()))
      .mockReturnValueOnce(pendingUpload);
    render(<UserGalleryEditor />);
    await screen.findByText("В галерее пока нет фотографий.");

    await user.upload(screen.getByLabelText("Выберите несколько фото"), [
      new File(["one"], "one.jpg", { type: "image/jpeg" }),
      new File(["two"], "two.png", { type: "image/png" }),
    ]);
    await user.click(screen.getByRole("button", { name: /Загрузить выбранные/ }));

    expect(screen.getByLabelText("Загрузка one.jpg")).toBeInTheDocument();
    expect(screen.getByLabelText("Загрузка two.png")).toBeInTheDocument();
    finishUpload(
      jsonResponse({
        uploaded: [],
        failed: [],
        usedBytes: 0,
        quotaBytes: 250 * 1024 * 1024,
      } satisfies UserPhotoUploadResponse),
    );
    await waitFor(() =>
      expect(screen.queryByLabelText("Загрузка one.jpg")).not.toBeInTheDocument(),
    );
  });

  it("optimistically toggles visibility and sends the requested state", async () => {
    const user = userEvent.setup();
    const initial = gallery([photo()]);
    const updated = photo({ isPublic: true });
    fetchMock
      .mockResolvedValueOnce(jsonResponse(initial))
      .mockResolvedValueOnce(jsonResponse(updated));
    render(<UserGalleryEditor />);

    const toggle = await screen.findByRole("switch", {
      name: "Показывать фото photo-1 в Union",
    });
    await user.click(toggle);

    expect(fetchMock).toHaveBeenLastCalledWith(
      `${API_URL}/profile/photos/photo-1`,
      {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isPublic: true }),
      },
    );
    expect(await screen.findByText("Публичное")).toBeInTheDocument();
  });

  it("restores visibility when the request fails", async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(gallery([photo()])))
      .mockResolvedValueOnce(jsonResponse({}, false));
    render(<UserGalleryEditor />);

    const toggle = await screen.findByRole("switch");
    await user.click(toggle);

    await waitFor(() => expect(toggle).not.toBeChecked());
    expect(screen.getByText("Приватное")).toBeInTheDocument();
    expect(screen.getByText("Не удалось изменить видимость фото")).toBeInTheDocument();
  });

  it("deletes only after confirmation", async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(gallery([photo()])))
      .mockResolvedValueOnce(jsonResponse(undefined));
    render(<UserGalleryEditor />);

    await user.click(
      await screen.findByRole("button", { name: "Удалить фото photo-1" }),
    );

    expect(window.confirm).toHaveBeenCalledWith(
      "Удалить это фото без возможности восстановления?",
    );
    expect(fetchMock).toHaveBeenLastCalledWith(
      `${API_URL}/profile/photos/photo-1`,
      { method: "DELETE", credentials: "include" },
    );
    expect(await screen.findByText("В галерее пока нет фотографий.")).toBeInTheDocument();
  });

  it("does not delete when confirmation is declined", async () => {
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(jsonResponse(gallery([photo()])));
    render(<UserGalleryEditor />);

    await user.click(
      await screen.findByRole("button", { name: "Удалить фото photo-1" }),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends all current IDs after native drag-and-drop reorder", async () => {
    const photos = [
      photo({ id: "one", url: "https://signed.test/one" }),
      photo({ id: "two", url: "https://signed.test/two", sortOrder: 1 }),
      photo({ id: "three", url: "https://signed.test/three", sortOrder: 2 }),
    ];
    const reordered = gallery([photos[1], photos[0], photos[2]]);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(gallery(photos)))
      .mockResolvedValueOnce(jsonResponse(reordered));
    render(<UserGalleryEditor />);

    const first = await screen.findByLabelText(
      "Фото one. Перетащите для изменения порядка",
    );
    const second = screen.getByLabelText(
      "Фото two. Перетащите для изменения порядка",
    );
    fireEvent.dragStart(first, { dataTransfer });
    fireEvent.dragOver(second, { dataTransfer });
    fireEvent.drop(second, { dataTransfer });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenLastCalledWith(
      `${API_URL}/profile/photos/order`,
      {
        method: "PUT",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ photoIds: ["two", "one", "three"] }),
      },
    );
  });

  it("restores the previous order when reorder fails", async () => {
    const photos = [
      photo({ id: "one", url: "https://signed.test/one" }),
      photo({ id: "two", url: "https://signed.test/two", sortOrder: 1 }),
    ];
    fetchMock
      .mockResolvedValueOnce(jsonResponse(gallery(photos)))
      .mockResolvedValueOnce(jsonResponse({}, false));
    render(<UserGalleryEditor />);

    const first = await screen.findByLabelText(
      "Фото one. Перетащите для изменения порядка",
    );
    const second = screen.getByLabelText(
      "Фото two. Перетащите для изменения порядка",
    );
    fireEvent.dragStart(first, { dataTransfer });
    fireEvent.drop(second, { dataTransfer });

    await screen.findByText("Не удалось сохранить порядок фото");
    expect(
      screen.getAllByAltText("Фото галереи профиля").map((image) => image.getAttribute("src")),
    ).toEqual(["https://signed.test/one", "https://signed.test/two"]);
  });

  it("disables all gallery mutation controls while a reorder is pending", async () => {
    let finishReorder!: (response: Response) => void;
    const pendingReorder = new Promise<Response>((resolve) => {
      finishReorder = resolve;
    });
    const photos = [
      photo({ id: "one", url: "https://signed.test/one" }),
      photo({ id: "two", url: "https://signed.test/two", sortOrder: 1 }),
    ];
    fetchMock
      .mockResolvedValueOnce(jsonResponse(gallery(photos)))
      .mockReturnValueOnce(pendingReorder);
    render(<UserGalleryEditor />);

    const first = await screen.findByLabelText(
      "Фото one. Перетащите для изменения порядка",
    );
    const second = screen.getByLabelText(
      "Фото two. Перетащите для изменения порядка",
    );
    fireEvent.dragStart(first, { dataTransfer });
    fireEvent.drop(second, { dataTransfer });

    expect(screen.getByRole("switch", { name: "Показывать фото one в Union" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Удалить фото one" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Переместить фото one влево" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Переместить фото one вправо" })).toBeDisabled();
    expect(second).toHaveAttribute("draggable", "false");

    finishReorder(jsonResponse(gallery([photos[1], photos[0]])));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Удалить фото one" })).not.toBeDisabled(),
    );
  });

  it("moves photos with touch-friendly buttons using complete ordered IDs", async () => {
    const user = userEvent.setup();
    const photos = [
      photo({ id: "one", url: "https://signed.test/one" }),
      photo({ id: "two", url: "https://signed.test/two", sortOrder: 1 }),
      photo({ id: "three", url: "https://signed.test/three", sortOrder: 2 }),
    ];
    fetchMock
      .mockResolvedValueOnce(jsonResponse(gallery(photos)))
      .mockResolvedValueOnce(jsonResponse(gallery([photos[0], photos[2], photos[1]])));
    render(<UserGalleryEditor />);

    expect(
      await screen.findByRole("button", { name: "Переместить фото one влево" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Переместить фото three вправо" })).toBeDisabled();

    await user.click(
      screen.getByRole("button", { name: "Переместить фото two вправо" }),
    );

    expect(fetchMock).toHaveBeenLastCalledWith(
      `${API_URL}/profile/photos/order`,
      {
        method: "PUT",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ photoIds: ["one", "three", "two"] }),
      },
    );
  });

  it("revokes replaced preview object URLs and remaining URLs on unmount", async () => {
    createObjectURL
      .mockReturnValueOnce("blob:first")
      .mockReturnValueOnce("blob:second");
    const user = userEvent.setup();
    const { unmount } = render(<UserGalleryEditor />);
    await screen.findByText("В галерее пока нет фотографий.");
    const input = screen.getByLabelText("Выберите несколько фото");

    await user.upload(input, new File(["one"], "one.jpg", { type: "image/jpeg" }));
    expect(within(screen.getByRole("list")).getByAltText("Предпросмотр one.jpg")).toHaveAttribute(
      "src",
      "blob:first",
    );
    await user.upload(input, new File(["two"], "two.jpg", { type: "image/jpeg" }));
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:first");

    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:second");
  });
});
