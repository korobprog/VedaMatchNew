import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { BlogMoreButton, BlogPostText, useBlogTextFold } from "./blog-post-text";

function Card({ text, title = null }: { text: string; title?: string | null }) {
  const { fold, attachBody, attachTitle } = useBlogTextFold(text, title);
  return (
    <article>
      {title && (
        <p id={fold.titleId} ref={attachTitle} className={fold.titleClassName}>
          {title}
        </p>
      )}
      <BlogPostText fold={fold} attach={attachBody} />
      <BlogMoreButton fold={fold} />
    </article>
  );
}

const LONG = `${"Слово за словом. ".repeat(40)}Конец поста.`;

describe("BlogPostText + BlogMoreButton (VED-371)", () => {
  it("shows the beginning and expands to the full text on «Далее»", async () => {
    const user = userEvent.setup();
    render(<Card text={LONG} />);

    const more = screen.getByRole("button", { name: "Далее" });
    expect(more).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/Конец поста\./)).toBeNull();

    await user.click(more);
    expect(screen.getByText(/Конец поста\./)).toBeInTheDocument();
    const less = screen.getByRole("button", { name: "Свернуть" });
    expect(less).toHaveAttribute("aria-expanded", "true");

    await user.click(less);
    expect(screen.queryByText(/Конец поста\./)).toBeNull();
  });

  it("points the button at the text it controls", () => {
    render(<Card text={LONG} title="Заголовок" />);
    const more = screen.getByRole("button", { name: "Далее" });
    const ids = (more.getAttribute("aria-controls") ?? "").split(" ");
    expect(ids).toHaveLength(2);
    for (const id of ids) expect(document.getElementById(id)).not.toBeNull();
  });

  it("offers no button when the whole text is already visible", () => {
    render(<Card text="Харе Кришна!" />);
    expect(screen.getByText("Харе Кришна!")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders nothing for an empty text", () => {
    const { container } = render(<Card text="" />);
    expect(container.querySelector("p")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
