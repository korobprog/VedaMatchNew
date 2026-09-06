import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UploadCardImage } from "./upload-card-image";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh }),
}));

function file() {
  return new File(["x"], "otkrytka.webp", { type: "image/webp" });
}

afterEach(() => {
  vi.unstubAllGlobals();
  refresh.mockReset();
});

describe("UploadCardImage", () => {
  it("шлёт файл формой, а не JSON-ом", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, text: async () => "{}" });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const { container } = render(<UploadCardImage postId="post-1" />);

    await user.upload(container.querySelector("input[type=file]")!, file());

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/admin/motivation/posts/post-1/image");
    expect(init.body).toBeInstanceOf(FormData);
    // `content-type` не задаём: браузер сам ставит границу частей.
    expect(init.headers).toBeUndefined();
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("показывает объяснение сервера, а не «ошибка 400»", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => "Файл больше 12 МБ — уменьшите его",
      }),
    );
    const user = userEvent.setup();
    const { container } = render(<UploadCardImage postId="post-1" />);

    await user.upload(container.querySelector("input[type=file]")!, file());

    expect(
      await screen.findByText("Файл больше 12 МБ — уменьшите его"),
    ).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});
