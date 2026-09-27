import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryCategoryDto } from "@vedamatch/shared";
import { CategoryInfoButton } from "./category-info-dialog";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  refresh.mockReset();
});

function category(overrides: Partial<LibraryCategoryDto>): LibraryCategoryDto {
  return {
    id: "author-1",
    parentId: "preachers",
    slug: "ari-mardan",
    titleRu: "Ари Мардан Прабху",
    titleEn: null,
    descriptionRu: null,
    descriptionEn: null,
    iconKey: null,
    position: 0,
    depth: 1,
    entriesCount: 3,
    subtreeEntriesCount: 3,
    childrenCount: 0,
    createdAt: "2026-09-01T00:00:00.000Z",
    canEdit: false,
    canMove: false,
    canDelete: false,
    infoContacts: null,
    infoBio: null,
    infoResources: null,
    infoSchedule: null,
    ...overrides,
  };
}

const LABEL = "Информация: Ари Мардан Прабху";

describe("CategoryInfoButton", () => {
  it("читателю без заполненных разделов кнопки нет", () => {
    render(<CategoryInfoButton locale="ru" category={category({})} />);

    expect(screen.queryByRole("button", { name: LABEL })).toBeNull();
  });

  it("показывает читателю все четыре раздела, пустые — «Пока не заполнено», ссылки кликабельны", async () => {
    render(
      <CategoryInfoButton
        locale="ru"
        category={category({
          infoContacts: "Сайт: https://example.org\nТелеграм: t.me/prabhu",
          infoSchedule: "Пн 19:00",
        })}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: LABEL }));

    const dialog = screen.getByRole("dialog", { name: "Ари Мардан Прабху" });
    expect(dialog).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Контакты" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Расписание" }),
    ).toBeInTheDocument();
    // Незаполненные тоже видны (VED-553): иначе казалось, что их нет.
    expect(
      screen.getByRole("heading", { name: "Биография" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Ресурсы" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Пока не заполнено")).toHaveLength(2);

    const link = screen.getByRole("link", { name: "https://example.org" });
    expect(link.getAttribute("href")).toBe("https://example.org");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(screen.queryByRole("button", { name: "Изменить" })).toBeNull();
  });

  it("окно — в body, а не в плитке, и на сплошном фоне (VED-553)", async () => {
    const { container } = render(
      <div className="glass">
        <CategoryInfoButton
          locale="ru"
          category={category({ infoBio: "Текст" })}
        />
      </div>,
    );

    await userEvent.click(screen.getByRole("button", { name: LABEL }));

    const dialog = screen.getByRole("dialog");
    // `.glass` с backdrop-filter держит `position: fixed` внутри себя —
    // окно обязано жить вне плитки.
    expect(container).not.toContainElement(dialog);
    expect(document.body).toContainElement(dialog);
    expect(dialog.className).toContain("bg-bg-1");
    expect(dialog.classList.contains("glass")).toBe(false);
  });

  it("Esc закрывает окно и возвращает фокус на «i»", async () => {
    render(
      <CategoryInfoButton
        locale="ru"
        category={category({ infoBio: "Текст" })}
      />,
    );
    const trigger = screen.getByRole("button", { name: LABEL });

    await userEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("тот, кто правит рубрику, видит «i» всегда и сохраняет четыре раздела", async () => {
    const fetchMock = vi.fn().mockImplementation((_url, init: RequestInit) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve(
            category({
              canEdit: true,
              ...JSON.parse(String(init.body)),
              infoResources: null,
            }),
          ),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <CategoryInfoButton locale="ru" category={category({ canEdit: true })} />,
    );

    await userEvent.click(screen.getByRole("button", { name: LABEL }));
    expect(screen.getAllByText("Пока не заполнено")).toHaveLength(4);
    await userEvent.click(screen.getByRole("button", { name: "Изменить" }));

    const bio = screen.getByRole("textbox", { name: /Биография/ });
    expect(screen.getAllByRole("textbox")).toHaveLength(4);
    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: /Контакты/ }),
    );
    await userEvent.type(bio, "Родился в Москве");
    await userEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Биография" }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("Родился в Москве")).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/library\/categories\/author-1$/);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({
      infoContacts: "",
      infoBio: "Родился в Москве",
      infoResources: "",
      infoSchedule: "",
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("«Отмена» не отправляет правку", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(
      <CategoryInfoButton
        locale="ru"
        category={category({ canEdit: true, infoBio: "Было" })}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: LABEL }));
    await userEvent.click(screen.getByRole("button", { name: "Изменить" }));
    await userEvent.clear(screen.getByRole("textbox", { name: /Биография/ }));
    await userEvent.click(screen.getByRole("button", { name: "Отмена" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("Было")).toBeInTheDocument();
  });
});
