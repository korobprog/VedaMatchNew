import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PortalSearchField } from "./portal-search-field";

describe("PortalSearchField", () => {
  it("отправляет запрос обычной формой на страницу выдачи", () => {
    render(<PortalSearchField />);

    const form = screen.getByRole("search");
    expect(form).toHaveAttribute("action", "/search");
    expect(form).toHaveAttribute("method", "get");
    expect(screen.getByLabelText("Поиск по VedaMatch")).toHaveAttribute(
      "name",
      "q",
    );
  });

  it("не пускает пустой и однобуквенный запрос — сервер его всё равно не ищет", () => {
    render(<PortalSearchField />);

    const input = screen.getByLabelText("Поиск по VedaMatch");
    expect(input).toBeRequired();
    expect(input).toHaveAttribute("minLength", "2");
  });

  it("над выдачей показывает то, что уже искали", () => {
    render(<PortalSearchField defaultValue="киртан" />);

    expect(screen.getByLabelText("Поиск по VedaMatch")).toHaveValue("киртан");
  });
});
