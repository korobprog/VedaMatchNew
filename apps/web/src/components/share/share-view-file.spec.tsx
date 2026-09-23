import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ShareView } from "./share-view";

/**
 * VED-156, дописка заказчика: «кнопка отправить в приложение до сих пор
 * тупит… сделай какой-нибудь индикатор ожидания, чтобы было понятно что надо
 * подождать и человек не тыкал в эту кнопку по 10 раз».
 */
const PROPS = {
  text: "Тот, кто родился, непременно умрёт.",
  source: "Бхагавад-гита 2.27",
  link: "https://vedamatch.ru/m/reel-a",
  previewUrl: null,
  filePath: "/m/reel-33e14d6e-mu376h10/story",
  chatHref: null,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const jpegResponse = () =>
  ({
    ok: true,
    blob: () => Promise.resolve(new Blob(["jpeg"], { type: "image/jpeg" })),
  }) as unknown as Response;

describe("ShareView: картинка в приложение", () => {
  const share = vi.fn();
  const canShare = vi.fn(() => true);

  beforeEach(() => {
    share.mockReset().mockResolvedValue(undefined);
    canShare.mockReset().mockReturnValue(true);
    Object.assign(navigator, { share, canShare });
    URL.createObjectURL = vi.fn(() => "blob:ready");
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("пока картинка готовится — индикатор, нажатие не зовёт шторку, а объясняет", async () => {
    const pending = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn(() => pending.promise));
    render(<ShareView {...PROPS} />);

    const button = screen.getByRole("button", { name: "Готовим картинку…" });
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(screen.getByTestId("share-spinner")).toBeInTheDocument();

    fireEvent.click(button);
    fireEvent.click(button);
    expect(share).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Картинка ещё готовится");

    await act(async () => pending.resolve(jpegResponse()));
    const ready = await screen.findByRole("button", { name: "Отправить в приложение" });
    expect(ready).not.toHaveAttribute("aria-busy");
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("готовая картинка уходит в шторку JPEG-файлом, повторные нажатия не дублируют вызов", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jpegResponse())));
    const sheet = deferred<void>();
    share.mockReturnValue(sheet.promise);
    render(<ShareView {...PROPS} />);

    const button = await screen.findByRole("button", { name: "Отправить в приложение" });
    fireEvent.click(button);
    const busy = await screen.findByRole("button", { name: "Открываем приложения…" });
    fireEvent.click(busy);
    fireEvent.click(busy);

    expect(share).toHaveBeenCalledTimes(1);
    const [{ files }] = share.mock.calls[0] as [{ files: File[] }];
    expect(files[0].name).toBe("vedamatch-reel-33e14d6e-mu376h10.jpg");
    expect(files[0].type).toBe("image/jpeg");

    await act(async () => sheet.resolve());
    await screen.findByRole("button", { name: "Отправить в приложение" });
  });

  it("окно не умеет отдавать файлы — говорит об этом сразу, до нажатия", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jpegResponse())));
    canShare.mockReturnValue(false);
    render(<ShareView {...PROPS} />);

    await waitFor(() =>
      expect(screen.getByText(/не умеет отдавать картинку в приложения/)).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Отправить в приложение" }));
    expect(share).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Сохранить картинку");
  });

  it("«Сохранить картинку» отзывается и говорит, где искать файл", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jpegResponse())));
    render(<ShareView {...PROPS} />);
    const save = await screen.findByRole("link", { name: "Сохранить картинку" });
    await waitFor(() => expect(save).toHaveAttribute("href", "blob:ready"));
    expect(save).toHaveAttribute("download", "vedamatch-reel-33e14d6e-mu376h10.jpg");

    fireEvent.click(save);
    expect(screen.getByRole("link", { name: "✓ Картинка сохранена" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("«Загрузки»");
  });
});
