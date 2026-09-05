import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UserAvatar } from "./user-avatar";

describe("UserAvatar", () => {
  it("не растягивает непрямоугольное фото", () => {
    const { container } = render(
      <UserAvatar name="Мадхава" avatarUrl="https://cdn/a.jpg" />,
    );

    // Без object-cover портрет в квадратной рамке плющился.
    expect(container.querySelector("img")!.className).toContain("object-cover");
  });

  it("просит браузер не слать Referer: иначе Google отдаёт 403", () => {
    const { container } = render(
      <UserAvatar name="Мадхава" avatarUrl="https://lh3.googleusercontent.com/a" />,
    );

    expect(container.querySelector("img")).toHaveAttribute(
      "referrerpolicy",
      "no-referrer",
    );
  });

  it("без фото показывает букву имени, а не пустоту", () => {
    render(<UserAvatar name="мадхава" avatarUrl={null} />);

    expect(screen.getByText("М")).toBeInTheDocument();
  });

  it("на пустом имени не ломается", () => {
    render(<UserAvatar name="   " avatarUrl={null} />);

    expect(screen.getByText("?")).toBeInTheDocument();
  });

  it("картинка не подписывается именем: оно всегда стоит рядом текстом", () => {
    const { container } = render(
      <UserAvatar name="Мадхава" avatarUrl="https://cdn/a.jpg" />,
    );

    expect(container.querySelector("img")).toHaveAttribute("alt", "");
  });

  it("держит заданный размер и форму", () => {
    const { container } = render(
      <UserAvatar
        name="Мадхава"
        avatarUrl="https://cdn/a.jpg"
        size={30}
        rounded="rounded-xl"
      />,
    );

    const img = container.querySelector("img")!;
    expect(img.style.width).toBe("30px");
    expect(img.className).toContain("rounded-xl");
  });
});
