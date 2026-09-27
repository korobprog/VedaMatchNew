import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { EntryFilterMenu } from "./entry-filter-menu";

let search = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/library/ari",
  useSearchParams: () => new URLSearchParams(search),
}));

beforeEach(() => {
  search = "";
});

/* VED-546: «Язык» — самим кодом языка, а не значком перевода. */
describe("EntryFilterMenu: язык", () => {
  it("без выбора — «Все»", () => {
    render(<EntryFilterMenu kind="language" locale="ru" />);
    expect(
      screen.getByRole("button", { name: "Язык материала" }),
    ).toHaveTextContent("Все");
  });

  it("выбран русский — «RU»", () => {
    search = "language=ru";
    render(<EntryFilterMenu kind="language" locale="ru" />);
    expect(
      screen.getByRole("button", { name: "Язык материала: RU" }),
    ).toHaveTextContent("RU");
  });
});
