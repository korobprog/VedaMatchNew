import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { CoverField } from "./cover-field";

/** Обёртка с состоянием: поле управляемое, а проверяем мы именно выбор. */
function Host({ hasLink = false }: { hasLink?: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  return (
    <CoverField
      locale="ru"
      file={file}
      onChange={setFile}
      hasLink={hasLink}
      idPrefix="test"
    />
  );
}

const revoke = vi.fn();

beforeEach(() => {
  // jsdom не умеет createObjectURL — без заглушки падает выбор файла.
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn(() => "blob:cover"),
    revokeObjectURL: revoke,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  revoke.mockClear();
});

function picture(name = "cover.jpg", type = "image/jpeg"): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type });
}

describe("CoverField", () => {
  it("показывает выбранную картинку целиком, а не обрезанной", async () => {
    // Заказчик просил «сразу сделай, чтобы помещалась полностью» (VED-344):
    // увидеть это надо до публикации, а не на готовой карточке.
    render(<Host />);

    await userEvent.upload(
      screen.getByLabelText(/Картинка/),
      picture(),
    );

    const preview = await screen.findByAltText(
      "Так картинка будет выглядеть в карточке",
    );
    expect(preview.className).toContain("object-contain");
    expect(preview.className).not.toContain("object-cover");
    // Тем же CoverPicture, что в карточке: рамка в пропорциях картинки,
    // без полей и размытой подложки (VED-138).
    expect(preview.getAttribute("src")).toBe("blob:cover");
    expect(document.querySelectorAll("img")).toHaveLength(1);
  });

  it("обещает, что картинку не обрежут", () => {
    render(<Host />);
    expect(
      screen.getByText(/Картинку покажем целиком — её не обрежут/),
    ).toBeDefined();
  });

  it("у материала со ссылкой подсказка другая — картинку возьмут сами", () => {
    render(<Host hasLink />);
    expect(
      screen.getByText(/Со страницы по ссылке картинку возьмём сами/),
    ).toBeDefined();
  });

  it("не-картинку отбивает до отправки и не запоминает", async () => {
    // Через файловый менеджер на Android выбрать можно что угодно (VED-134).
    render(<Host />);

    await userEvent.upload(
      screen.getByLabelText(/Картинка/),
      new File(["%PDF"], "book.pdf", { type: "application/pdf" }),
      // `accept` в поле стоит ради выбора файла на Android, а не ради
      // проверки: реальный файловый менеджер отдаёт что угодно, и отбить
      // это обязан сам компонент.
      { applyAccept: false },
    );

    expect(screen.getByRole("alert").textContent).toContain(
      "Подойдут jpg, png или webp",
    );
    expect(screen.queryByAltText("Так картинка будет выглядеть в карточке")).toBe(
      null,
    );
  });

  it("выбранную картинку можно убрать, и её адрес отзывается", async () => {
    render(<Host />);

    await userEvent.upload(screen.getByLabelText(/Картинка/), picture());
    await screen.findByAltText("Так картинка будет выглядеть в карточке");

    await userEvent.click(
      screen.getByRole("button", { name: "Убрать картинку" }),
    );

    await waitFor(() => {
      expect(
        screen.queryByAltText("Так картинка будет выглядеть в карточке"),
      ).toBe(null);
    });
    expect(revoke).toHaveBeenCalledWith("blob:cover");
  });
});
