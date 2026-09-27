import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProfileAvatarButton } from "./profile-avatar-button";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }),
}));

const apiFetch = vi.fn();
vi.mock("@/lib/http-client", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

function fileInput(container: HTMLElement) {
  return container.querySelector('input[type="file"]') as HTMLInputElement;
}

afterEach(() => {
  apiFetch.mockReset();
  refresh.mockReset();
});

/* VED-479: выбор фото — компактной кнопкой рядом с аватаркой, а не карточкой. */
describe("ProfileAvatarButton", () => {
  it("без фото предлагает «Установить фото», с фото — «Сменить фото»", () => {
    const { rerender } = render(<ProfileAvatarButton hasAvatar={false} />);
    expect(
      screen.getByRole("button", { name: "Установить фото" }),
    ).toHaveAccessibleDescription(/JPG, PNG или WebP до 5 MB/);
    rerender(<ProfileAvatarButton hasAvatar />);
    expect(screen.getByRole("button", { name: "Сменить фото" })).toBeVisible();
  });

  it("кнопка открывает выбор файла, а само поле не ловит Tab", () => {
    const { container } = render(<ProfileAvatarButton hasAvatar={false} />);
    const input = fileInput(container);
    const click = vi.spyOn(input, "click");
    fireEvent.click(screen.getByRole("button", { name: "Установить фото" }));
    expect(click).toHaveBeenCalled();
    expect(input.tabIndex).toBe(-1);
  });

  it("не отправляет файл неподходящего вида", () => {
    const { container } = render(<ProfileAvatarButton hasAvatar={false} />);
    fireEvent.change(fileInput(container), {
      target: { files: [new File(["x"], "a.gif", { type: "image/gif" })] },
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Разрешены только jpg, jpeg, png и webp",
    );
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("сразу загружает выбранное фото и обновляет страницу", async () => {
    apiFetch.mockResolvedValue(new Response("{}", { status: 200 }));
    const { container } = render(<ProfileAvatarButton hasAvatar={false} />);
    fireEvent.change(fileInput(container), {
      target: { files: [new File(["x"], "a.png", { type: "image/png" })] },
    });
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Фото сохранено"),
    );
    expect(apiFetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/profile\/avatar$/),
      expect.objectContaining({ method: "POST" }),
    );
    expect(refresh).toHaveBeenCalled();
  });
});
