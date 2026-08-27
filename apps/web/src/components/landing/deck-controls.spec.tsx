import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SwipeCard } from "./SwipeCard";
import { COMPATIBILITY_CRITERIA } from "./deck-controls";
import { demoProfiles } from "./PhoneMockup";

/**
 * Витрина обязана показывать ту же панель решений, что видит участник в
 * колоде Знакомств. Пропажа кнопки здесь незаметна глазом на витрине, но
 * встречает гостя незнакомым экраном сразу после входа.
 */
describe("панель решений витрины", () => {
  function renderCard(compatibility?: number) {
    return render(
      <SwipeCard
        name="Александра"
        age={28}
        imageUrl="/landing/profiles/alexandra.jpg"
        compatibility={compatibility}
      />,
    );
  }

  it("держит все кнопки колоды сервиса", () => {
    const { container } = renderCard();
    const actions = [...container.querySelectorAll("[data-deck-action]")].map(
      (node) => node.getAttribute("data-deck-action"),
    );
    // Порядок значим: он и есть раскладка панели, в которую гость попадёт
    // после входа — кольцо между возвратом и суперлайком. Замыкает список
    // переход к сверке карт: в карточке сервиса он тоже под кнопками.
    expect(actions).toEqual([
      "pass",
      "undo",
      "ring",
      "superlike",
      "like",
      "astro",
    ]);
  });

  it("подписывает кнопки так же, как сервис", () => {
    renderCard();
    expect(screen.getByLabelText("Пропустить")).toBeInTheDocument();
    expect(screen.getByLabelText("Вернуть предыдущую анкету")).toBeInTheDocument();
    expect(screen.getByLabelText("Суперлайк")).toBeInTheDocument();
    expect(screen.getByLabelText("Познакомиться")).toBeInTheDocument();
  });

  it("показывает кольцо совместимости, когда процент посчитан", () => {
    renderCard(94);
    expect(screen.getByText("94%")).toBeInTheDocument();
  });

  it("оставляет кольцо на месте без процента, но с вопросом вместо цифры", () => {
    renderCard();
    // Кольцо — центр панели и в сервисе; убрать его значило бы показать
    // гостю не ту раскладку, в которую он попадёт после входа.
    expect(
      screen.getByLabelText("Показать, из чего складывается совместимость"),
    ).toBeInTheDocument();
    expect(screen.getByText("?")).toBeInTheDocument();
  });
});

describe("разбор совместимости", () => {
  it("без процента показывает веса критериев", () => {
    render(
      <SwipeCard
        name="Александра"
        imageUrl="/landing/profiles/alexandra.jpg"
        breakdownOpen
      />,
    );

    expect(screen.getByText("Как считается совместимость")).toBeInTheDocument();
    for (const row of COMPATIBILITY_CRITERIA) {
      expect(screen.getByText(row.label)).toBeInTheDocument();
    }
  });

  it("с процентом показывает оценки, а не веса", () => {
    render(
      <SwipeCard
        name="Александра"
        imageUrl="/landing/profiles/alexandra.jpg"
        compatibility={94}
        breakdown={COMPATIBILITY_CRITERIA.map((row) => ({ ...row, score: 90 }))}
        breakdownOpen
      />,
    );

    expect(screen.getByText("Почему 94%")).toBeInTheDocument();
  });

  it("всегда предупреждает, что числа — пример", () => {
    // Число рядом с именем живого человека с витрины иначе читалось бы как
    // посчитанный про него результат.
    render(
      <SwipeCard
        name="Александра"
        imageUrl="/landing/profiles/alexandra.jpg"
        compatibility={94}
        breakdown={COMPATIBILITY_CRITERIA.map((row) => ({ ...row, score: 90 }))}
        breakdownOpen
      />,
    );

    expect(screen.getByText(/Числа для примера/)).toBeInTheDocument();
  });

  it("веса критериев в сумме дают 100", () => {
    // Копия WEIGHTS из union-matching.service.ts. Разъедутся — разбор начнёт
    // врать про устройство расчёта.
    const sum = COMPATIBILITY_CRITERIA.reduce((total, row) => total + row.weight, 0);
    expect(sum).toBe(100);
  });
});

describe("демо-разборы витрины", () => {
  it("сходятся со своим процентом по весам, как считает сервер", () => {
    // Люди придуманы, но арифметика обязана быть настоящей: витрина обещает
    // расчёт, и нарисованный «на глаз» процент выдал бы себя первому, кто
    // сложит столбик. Формула — та же, что в union-matching.service.ts.
    for (const profile of demoProfiles) {
      expect(profile.breakdown).toBeDefined();
      const weighted = profile.breakdown!.reduce(
        (total, row) => total + (row.score ?? 0) * row.weight,
        0,
      );
      expect(Math.round(weighted / 100)).toBe(profile.compatibility);
    }
  });

  it("разбирают демо-анкету по всем критериям расчёта", () => {
    for (const profile of demoProfiles) {
      expect(profile.breakdown).toHaveLength(COMPATIBILITY_CRITERIA.length);
    }
  });
});
