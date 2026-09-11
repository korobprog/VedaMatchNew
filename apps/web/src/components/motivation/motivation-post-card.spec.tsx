import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { MotivationPostDto } from "@vedamatch/shared";
import { MotivationPostCard } from "./motivation-post-card";

// jsdom не реализует showModal — та же заглушка, что в спеке самого окна.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close() {
    this.open = false;
  };
});

function post(over: Partial<MotivationPostDto> = {}): MotivationPostDto {
  return {
    id: "p1",
    slug: "post-1",
    title: "Бхагавад-гита 2.47",
    text: "Ты имеешь право лишь на действие.",
    imageUrl: "https://example.test/i.jpg",
    storyImageUrl: null,
    audienceTrack: "universal",
    category: "Долг",
    origin: "editorial",
    isFavorite: false,
    explanationAuthor: null,
    attributionSpeaker: null,
    attributionWork: null,
    attributionLocator: null,
    ...over,
  } as unknown as MotivationPostDto;
}

describe("MotivationPostCard — «Добавить пояснение» (VED-48, VED-49)", () => {
  it("предлагает написать трактовку, когда её ещё нет", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        explanation: "О долге без расчёта на плоды.",
        explanationAuthor: { id: "u1", name: "Мадхава" },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<MotivationPostCard post={post()} />);

    await user.click(screen.getByRole("button", { name: "Добавить пояснение" }));
    await user.type(
      screen.getByLabelText("Текст пояснения"),
      "О долге без расчёта на плоды.",
    );
    await user.click(screen.getByRole("button", { name: "Опубликовать" }));

    // Своё пояснение видно сразу, не дожидаясь перезагрузки ленты, и сразу
    // подписано: спрашивать за трактовку надо с того, кто её написал.
    await waitFor(() =>
      expect(
        screen.getByText("О долге без расчёта на плоды."),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByText(/Пояснение написал\(а\) Мадхава/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Добавить пояснение" }),
    ).toBeNull();
  });

  // Пояснение у афоризма одно: второй человек спорит с ним жалобой, а не
  // переписывает поверх.
  it("где пояснение уже есть — писать не предлагает", () => {
    render(
      <MotivationPostCard
        post={post({
          text: "Ты имеешь право лишь на действие.\n\nУже объяснили.",
          explanationAuthor: { id: "u2", name: "Говинда" },
        })}
      />,
    );

    expect(screen.getByText("Уже объяснили.")).toBeInTheDocument();
    expect(
      screen.getByText(/Пояснение написал\(а\) Говинда/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Добавить пояснение" }),
    ).toBeNull();
  });
});
