import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnionPageSizeSelect } from "./page-size-select";

const push = vi.fn();
let search = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(search),
}));

beforeEach(() => {
  push.mockReset();
  search = "";
});

describe("UnionPageSizeSelect", () => {
  it("показывает выбранный размер", () => {
    render(<UnionPageSizeSelect params={{ pageSize: "48" }} />);

    expect(screen.getByLabelText("Показывать по")).toHaveValue("48");
  });

  it("мусор в адресе не показывает как выбор", () => {
    render(<UnionPageSizeSelect params={{ pageSize: "5000" }} />);

    expect(screen.getByLabelText("Показывать по")).toHaveValue("12");
  });

  it("возвращает на первую страницу: «страница 4 по 12» и «по 48» — разные места", async () => {
    const user = userEvent.setup();
    search = "page=4&gender=female";
    render(<UnionPageSizeSelect params={{ page: "4", gender: "female" }} />);

    await user.selectOptions(screen.getByLabelText("Показывать по"), "48");

    const url = new URL(push.mock.calls[0][0] as string, "https://vedamatch.ru");
    expect(url.searchParams.get("pageSize")).toBe("48");
    expect(url.searchParams.get("page")).toBe("1");
  });

  it("не теряет остальные фильтры", async () => {
    const user = userEvent.setup();
    search = "gender=female&city=Москва";
    render(<UnionPageSizeSelect params={{ gender: "female" }} />);

    await user.selectOptions(screen.getByLabelText("Показывать по"), "24");

    const url = new URL(push.mock.calls[0][0] as string, "https://vedamatch.ru");
    expect(url.searchParams.get("gender")).toBe("female");
    expect(url.searchParams.get("city")).toBe("Москва");
  });
});
