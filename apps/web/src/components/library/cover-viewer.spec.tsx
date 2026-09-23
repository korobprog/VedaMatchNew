import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/http-client";
import { CoverViewer } from "./cover-viewer";

vi.mock("@/lib/http-client", () => ({ apiFetch: vi.fn() }));

const SRC = "https://cdn.vedamatch.ru/library/previews/katha.webp";
const SIGNED = "https://s3.example.ru/bucket/katha.webp?X-Amz-Signature=abc";

// jsdom не реализует showModal и ResizeObserver: без заглушек диалог не
// открывается, а область просмотра не узнаёт своего размера.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close() {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
});

function renderViewer() {
  return render(
    <CoverViewer locale="ru" entryId="entry-1" src={SRC} alt="Обложка материала">
      <span>обложка в ленте</span>
    </CoverViewer>,
  );
}

describe("CoverViewer (VED-138)", () => {
  it("нажатие на обложку открывает её во весь экран", async () => {
    vi.mocked(apiFetch).mockResolvedValue(
      new Response(JSON.stringify({ url: SIGNED }), { status: 200 }),
    );
    const user = userEvent.setup();
    renderViewer();

    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Увеличить картинку" }));

    const dialog = screen.getByRole("dialog", { name: "Картинка материала" });
    expect(within(dialog).getByAltText("Обложка материала")).toHaveAttribute(
      "src",
      SRC,
    );
    expect(
      within(dialog).getByText("Нажмите на картинку, чтобы приблизить"),
    ).toBeInTheDocument();
  });

  it("«Скачать» ведёт на подписанную ссылку — хранилище отдаёт файл", async () => {
    vi.mocked(apiFetch).mockResolvedValue(
      new Response(JSON.stringify({ url: SIGNED }), { status: 200 }),
    );
    const user = userEvent.setup();
    renderViewer();
    await user.click(screen.getByRole("button", { name: "Увеличить картинку" }));

    const link = screen.getByRole("link", { name: "Скачать" });
    await waitFor(() => expect(link).toHaveAttribute("href", SIGNED));
    expect(link).not.toHaveAttribute("target");
    expect(vi.mocked(apiFetch).mock.calls[0][0]).toMatch(
      /\/library\/entries\/entry-1\/preview\/download$/,
    );
  });

  it("без копии в бакете «Скачать» открывает саму картинку в новой вкладке", async () => {
    vi.mocked(apiFetch).mockResolvedValue(new Response("", { status: 404 }));
    const user = userEvent.setup();
    renderViewer();
    await user.click(screen.getByRole("button", { name: "Увеличить картинку" }));

    const link = screen.getByRole("link", { name: "Скачать" });
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    expect(link).toHaveAttribute("href", SRC);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("крестик закрывает просмотр", async () => {
    vi.mocked(apiFetch).mockResolvedValue(new Response("", { status: 404 }));
    const user = userEvent.setup();
    renderViewer();
    await user.click(screen.getByRole("button", { name: "Увеличить картинку" }));

    await user.click(screen.getByRole("button", { name: "Закрыть" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
