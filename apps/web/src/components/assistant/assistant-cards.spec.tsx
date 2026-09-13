import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AssistantLinkCard } from "@vedamatch/shared";
import { AssistantLinkCardView } from "./assistant-cards";

const card = {
  service: "library",
  href: "/library/entry/1",
  title: "Киртан на рассвете",
  subtitle: "Лекция о киртанах",
  body: "Как петь киртан вместе с общиной",
  imageUrl: null,
} as unknown as AssistantLinkCard;

describe("AssistantLinkCardView — подсветка (VED-98)", () => {
  it("в выдаче поиска выделяет найденные слова во всех полях", () => {
    const { container } = render(
      <AssistantLinkCardView card={card} highlight="киртаны" />,
    );

    const marks = [...container.querySelectorAll("mark")].map(
      (mark) => mark.textContent,
    );
    expect(marks).toEqual(["Киртан", "киртанах", "киртан"]);
    // Текст не теряется: ссылка читается целиком, как и без подсветки.
    expect(screen.getByRole("link")).toHaveTextContent(
      "Киртан на рассвете",
    );
  });

  it("в чате ассистента ничего не подсвечивает", () => {
    const { container } = render(<AssistantLinkCardView card={card} />);

    expect(container.querySelector("mark")).toBeNull();
    expect(screen.getByText("Киртан на рассвете")).toBeInTheDocument();
  });
});
