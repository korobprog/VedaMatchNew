import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { BlogFeed } from "./blog-feed";

/* VED-633: «Кнопку-надпись „Свернуть“ сделай кнопкой-значком классической
   стрелочкой вниз и втисни её в кнопочный ряд выше». */
describe("BlogFeed: сворачивание формы", () => {
  it("открытая форма сворачивается значком в том же ряду, фокус на месте", async () => {
    const user = userEvent.setup();
    render(<BlogFeed initial={{ posts: [], nextCursor: null }} />);

    const toggle = screen.getByRole("button", { name: /Новый пост/ });
    await user.click(toggle);

    // Та же кнопка, только теперь значок: подписи «Свернуть» на экране нет.
    expect(toggle).toHaveAccessibleName("Свернуть форму поста");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).not.toHaveTextContent("Свернуть");
    expect(document.getElementById("blog-compose")).not.toBeNull();

    await user.click(toggle);
    expect(toggle).toHaveFocus();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById("blog-compose")).toBeNull();
  });
});
