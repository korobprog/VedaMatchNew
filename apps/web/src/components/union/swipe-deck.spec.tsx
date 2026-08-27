import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { UnionRecommendation } from "@vedamatch/shared";
import { SwipeDeck } from "./swipe-deck";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {} }),
}));

vi.mock("./union-boost-button", () => ({
  UnionBoostButton: () => <div data-testid="boost-button" />,
}));

function recommendation(
  overrides: {
    user?: Partial<UnionRecommendation["user"]>;
    profile?: Partial<UnionRecommendation["profile"]>;
  } = {},
): UnionRecommendation {
  return {
    user: {
      id: "user-1",
      name: "Радха",
      avatarUrl: null,
      photos: [],
      city: "Москва",
      country: "Россия",
      spiritualStage: "seeker",
      age: 28,
      activity: "online",
      lastSeenAt: null,
      isVerifiedDevotee: false,
      isPhotoVerified: false,
      contacts: null,
      ...overrides.user,
    },
    profile: {
      about: "Рассказ о себе",
      format: "any",
      relocationReady: false,
      languages: [],
      skills: [],
      interests: [],
      values: [],
      status: null,
      heightCm: null,
      diet: null,
      regulativePrinciples: [],
      childrenStatus: null,
      education: null,
      spiritualEducation: null,
      housing: null,
      income: null,
      pets: [],
      ageRangeMin: null,
      ageRangeMax: null,
      intentions: [],
      ...overrides.profile,
    },
    compatibility: { total: 85, breakdown: [] },
    connection: null,
  myDecision: null,
  };
}

describe("SwipeDeck card", () => {
  it("shows interest chips with icons and hides the rest until expanded", async () => {
    const user = userEvent.setup();
    render(
      <SwipeDeck
        items={[
          recommendation({
            profile: {
              interests: [
                "психология",
                "путешествия",
                "музыка",
                "йога",
                "своё увлечение",
              ],
            },
          }),
        ]}
      />,
    );

    // Значок интереса — нарисованный, поэтому проверяется не по символу, а по
    // `data-interest-icon`: он называет подобранную иконку.
    expect(screen.getByText("Интересы")).toBeInTheDocument();
    expect(
      screen
        .getByText("психология")
        .querySelector("[data-interest-icon]"),
    ).toHaveAttribute("data-interest-icon", "психология");
    expect(screen.queryByText("своё увлечение")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Развернуть анкету" }));

    // Свой вариант интереса не из справочника получает «искру».
    expect(
      screen
        .getByText("своё увлечение")
        .querySelector("[data-interest-icon]"),
    ).toHaveAttribute("data-interest-icon", "spark");
    expect(screen.getByText("Рассказ о себе")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Свернуть анкету" }),
    ).toBeInTheDocument();
  });

  it("renders the photo carousel when the person has public photos", () => {
    render(
      <SwipeDeck
        items={[
          recommendation({
            user: {
              photos: [
                { id: "photo-1", url: "one.webp", width: 800, height: 1200 },
                { id: "photo-2", url: "two.webp", width: 800, height: 1200 },
              ],
            },
          }),
        ]}
      />,
    );

    expect(screen.getByTestId("recommendation-carousel")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Показать фото 2 из 2" }),
    ).toBeInTheDocument();
  });

  // Список открывает колоду на выбранном человеке, а не на первом: иначе
  // тап по четвёртой плитке показал бы первую анкету.
  it("opens at the requested profile", () => {
    render(
      <SwipeDeck
        initialIndex={1}
        items={[
          recommendation(),
          recommendation({ user: { id: "user-2", name: "Сита" } }),
        ]}
      />,
    );

    expect(screen.getByText("2 из 2")).toBeInTheDocument();
  });

  it("survives an out-of-range initial index instead of showing an empty deck", () => {
    render(<SwipeDeck initialIndex={99} items={[recommendation()]} />);

    expect(screen.getByText("1 из 1")).toBeInTheDocument();
  });

  it("offers a new cycle and the escape hatch when the deck runs out", () => {
    render(<SwipeDeck items={[]} />);

    expect(
      screen.getByRole("button", { name: "Показать заново" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Показать вообще всех" }),
    ).toHaveAttribute("href", "/union/recommendations?showAll=true");
  });

  it("offers archiving from the deck", () => {
    render(<SwipeDeck items={[recommendation()]} />);

    expect(
      screen.getByRole("button", { name: "Убрать в архив" }),
    ).toBeInTheDocument();
  });

  // Листание — это просмотр, а не решение: на сервер ничего уходить не должно,
  // иначе стрелка молча тратила бы анкеты так же, как крестик.
  it("browses to the next profile without recording a decision", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}"));
    render(
      <SwipeDeck
        items={[
          recommendation(),
          recommendation({ user: { id: "user-2", name: "Сита" } }),
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Следующая анкета" }));

    expect(screen.getByText("2 из 2")).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("после решения обновлённая выдача не проматывает следующего", async () => {
    /*
      Настоящая потеря людей, а не косметика. Решение уходит на сервер, следом
      идёт router.refresh(), и выдача возвращается уже без решённой анкеты.
      Пока колода помнила позицию по счёту, список съезжал на единицу под
      неподвижным указателем: одно нажатие «познакомиться» съедало двоих, и
      второй пролетал вообще без решения.
    */
    const user = userEvent.setup();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}"));
    const first = recommendation();
    const second = recommendation({ user: { id: "user-2", name: "Сита" } });
    const third = recommendation({ user: { id: "user-3", name: "Лалита" } });

    const { rerender } = render(
      <SwipeDeck items={[first, second, third]} />,
    );
    await user.click(screen.getByRole("button", { name: "Познакомиться" }));

    // Ровно то, что делает refresh: решённая анкета из выдачи исчезла.
    rerender(<SwipeDeck items={[second, third]} />);

    expect(screen.getByRole("link", { name: /Сита/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Лалита/ })).toBeNull();
    fetchSpy.mockRestore();
  });

  it("решённая анкета не возвращается, даже если выдача принесла её снова", async () => {
    // Режим «показать всех» приносит отсмотренных обратно — но ту, по которой
    // решение принято только что, колода показывать второй раз не должна.
    const user = userEvent.setup();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}"));
    const first = recommendation();
    const second = recommendation({ user: { id: "user-2", name: "Сита" } });

    const { rerender } = render(<SwipeDeck items={[first, second]} />);
    await user.click(screen.getByRole("button", { name: "Пропустить" }));
    rerender(<SwipeDeck items={[first, second]} />);

    expect(screen.getByRole("link", { name: /Сита/ })).toBeInTheDocument();
    expect(screen.getByText("1 из 1")).toBeInTheDocument();
    fetchSpy.mockRestore();
  });

  it("disables browsing at both ends of the deck", () => {
    render(<SwipeDeck items={[recommendation()]} />);

    expect(
      screen.getByRole("button", { name: "Предыдущая анкета" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Следующая анкета" }),
    ).toBeDisabled();
  });

  // Порядок согласован с продуктом: крестик и лайк по краям под большие
  // пальцы, между ними — вспомогательные действия. `getAllByRole` отдаёт
  // узлы в порядке DOM, поэтому фильтр по known-подписям и есть проверка
  // порядка: кольцо совместимости и стрелки листания в список не попадают.
  it("keeps the agreed action order in the decision row", () => {
    render(<SwipeDeck items={[recommendation()]} />);

    const order = [
      "Пропустить",
      "Вернуть предыдущую анкету",
      "Суперлайк",
      "Познакомиться",
    ];
    const rendered = screen
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-label"))
      .filter((label): label is string => order.includes(label ?? ""));

    expect(rendered).toEqual(order);
  });

  it("offers pass, superlike and like actions", () => {
    render(<SwipeDeck items={[recommendation()]} />);

    for (const label of ["Пропустить", "Суперлайк", "Познакомиться"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    expect(
      screen.getByRole("button", { name: "Вернуть предыдущую анкету" }),
    ).toBeDisabled();
  });
});
