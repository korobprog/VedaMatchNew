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

const completeness: UnionProfileCompleteness = {
  percent: 30,
  items: [],
  missing: ["about"],
  next: "about",
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
  disableFamilyGenderFilter: false,
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

  it("сохраняет отключение фильтра по полу", async () => {
    const user = userEvent.setup();
    render(<UnionProfileForm profile={profile} completeness={completeness} />);

    await user.click(
      screen.getByRole("checkbox", {
        name: "Показывать анкеты всех полов",
      }),
    );

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(bodyOf(0).disableFamilyGenderFilter).toBe(true);
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
    expect(bodyOf(0).intentions).toEqual([
      { type: "family", weight: 40 },
      { type: "business", weight: 20 },
      { type: "friendship", weight: 20 },
      { type: "service", weight: 20 },
    ]);
    // После создания вместо кнопки появляется переход к рекомендациям.
    await waitFor(() =>
      expect(
        screen.getByRole("link", { name: "Смотреть рекомендации" }),
      ).toBeInTheDocument(),
    );
  });
});
