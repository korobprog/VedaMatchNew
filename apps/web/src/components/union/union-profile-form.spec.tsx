import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  UnionProfileCompleteness,
  UnionProfileDto,
} from "@vedamatch/shared";
import { UnionProfileForm } from "./union-profile-form";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

// `items` заполнен намеренно: подсказка про фото смотрит именно в него, а не
// в `next`, и с пустым списком считала бы галерею пустой у всех подряд.
const completeness: UnionProfileCompleteness = {
  percent: 30,
  items: [
    { key: "photos", weight: 12, filled: true },
    { key: "about", weight: 12, filled: false },
  ],
  missing: ["about"],
  next: "about",
};

const withoutPhotos: UnionProfileCompleteness = {
  ...completeness,
  items: [
    { key: "photos", weight: 12, filled: false },
    { key: "about", weight: 12, filled: false },
  ],
  missing: ["photos", "about"],
  next: "photos",
};

const profile: UnionProfileDto = {
  id: "profile-1",
  userId: "user-1",
  about: null,
  status: null,
  relocationReady: false,
  format: "any",
  languages: [],
  skills: [],
  interests: [],
  values: [],
  familyStatus: null,
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
  privacy: null,
  isActive: true,
  requestsFromVerifiedOnly: false,
  contactMode: "requests",
  familySeeksGender: null,
  intentions: [{ type: "family", weight: 100 }],
  createdAt: "2026-08-05T00:00:00.000Z",
  updatedAt: "2026-08-05T00:00:00.000Z",
};

function mockFetch() {
  const json = vi.fn().mockResolvedValue({ profile, completeness });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json }));
}

describe("UnionProfileForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch();
  });

  function bodyOf(call: number): Record<string, unknown> {
    const mock = fetch as unknown as { mock: { calls: unknown[][] } };
    const init = mock.mock.calls[call][1] as { body: string };
    return JSON.parse(init.body) as Record<string, unknown>;
  }

  it("показывает прогресс заполнения и подсказку", () => {
    render(<UnionProfileForm profile={profile} completeness={completeness} />);

    expect(screen.getByText("Заполнен на 30%")).toBeInTheDocument();
    expect(screen.getByText("Дальше: О себе")).toBeInTheDocument();
  });

  // Процент заполнения ничего не обещает, поэтому вместо него названо
  // последствие — и оно настоящее: лента ставит анкеты с фото выше.
  it("пустая галерея объясняется последствием, а не процентом", () => {
    render(
      <UnionProfileForm profile={profile} completeness={withoutPhotos} />,
    );

    expect(
      screen.getByText(/Анкеты с фото показываются выше/),
    ).toBeInTheDocument();
  });

  it("сохраняет отдельное поле, не трогая соседние", async () => {
    const user = userEvent.setup();
    render(<UnionProfileForm profile={profile} completeness={completeness} />);

    await user.click(screen.getByRole("button", { name: /Питание/ }));
    await user.click(screen.getByRole("button", { name: "вегетарианство" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const body = bodyOf(0);
    expect(body.diet).toBe("vegetarian");
    // Соседние поля в запрос не попадают — их значения на сервере не меняются.
    expect(body).not.toHaveProperty("about");
    expect(body).not.toHaveProperty("interests");
    // Намерения бэкенд требует в каждом запросе.
    expect(body.intentions).toEqual([{ type: "family", weight: 100 }]);
  });

  it("сохраняет видимость профиля в рекомендациях", async () => {
    const user = userEvent.setup();
    render(<UnionProfileForm profile={profile} completeness={completeness} />);

    await user.click(
      screen.getByRole("checkbox", {
        name: "Показывать профиль в рекомендациях",
      }),
    );

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(bodyOf(0).isActive).toBe(false);
  });

  it("сохраняет выбор пола рядом с целью «Создание семьи»", async () => {
    const user = userEvent.setup();
    render(
      <UnionProfileForm
        profile={profile}
        completeness={completeness}
        viewerGender="male"
      />,
    );

    await user.click(
      screen.getByRole("checkbox", { name: "Искать только женщин" }),
    );

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(bodyOf(0).familySeeksGender).toBe("female");
  });

  it("обновляет прогресс ответом сервера", async () => {
    const user = userEvent.setup();
    render(
      <UnionProfileForm
        profile={profile}
        completeness={{ percent: 0, items: [], missing: [], next: "photos" }}
      />,
    );

    await user.click(
      screen.getByRole("checkbox", {
        name: "Показывать профиль в рекомендациях",
      }),
    );

    await waitFor(() =>
      expect(screen.getByText("Заполнен на 30%")).toBeInTheDocument(),
    );
  });

  it("создаёт профиль явной кнопкой, если его ещё нет", async () => {
    const user = userEvent.setup();
    render(<UnionProfileForm profile={null} completeness={completeness} />);

    await user.click(
      screen.getByRole("button", { name: "Создать профиль Union" }),
    );

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    // Новая анкета создаётся с ровными весами — это режим галочек.
    expect(bodyOf(0).intentions).toEqual([
      { type: "family", weight: 25 },
      { type: "business", weight: 25 },
      { type: "friendship", weight: 25 },
      { type: "service", weight: 25 },
    ]);
    // После создания вместо кнопки появляется переход к рекомендациям.
    await waitFor(() =>
      expect(
        screen.getByRole("link", { name: "Смотреть рекомендации" }),
      ).toBeInTheDocument(),
    );
  });
});
