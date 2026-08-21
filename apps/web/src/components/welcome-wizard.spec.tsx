import { render as renderRaw, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UserProfile } from "@vedamatch/shared";
import { WelcomeWizard } from "./welcome-wizard";
import ru from "../../messages/ru.json";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));

// Галерея ходит в сеть сама и покрыта своими тестами; здесь проверяется
// порядок шагов, и её запросы только мешали бы считать вызовы fetch.
vi.mock("./user-gallery-editor", () => ({
  UserGalleryEditor: () => null,
}));

const render = (ui: ReactElement) =>
  renderRaw(
    <NextIntlClientProvider locale="ru" messages={ru}>
      {ui}
    </NextIntlClientProvider>,
  );

const profile = {
  id: "u1",
  email: "user@example.com",
  name: "Гаура Прия",
  spiritualName: null,
  displayName: "Гаура Прия",
  avatarUrl: null,
  avatarKey: null,
  birthDate: null,
  age: null,
  gender: null,
  photoVerification: { status: "none", requestedAt: null, verifiedAt: null },
  homeLocation: null,
  socialLinks: {},
  messengers: {},
  role: "user",
  adminServices: [],
  spiritualStage: null,
  devoteeVerificationStatus: null,
  lastSelfIdentificationAt: null,
  subscription: {
    status: "trial",
    trialEndsAt: "2026-09-01T00:00:00.000Z",
    paidUntil: null,
    accessUntil: "2026-09-01T00:00:00.000Z",
    daysLeft: 16,
    note: null,
  },
  accountStatus: "active",
  pendingDeletionAt: null,
  deletionEligibleAt: null,
} as UserProfile;

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

beforeEach(() => {
  push.mockReset();
  fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify({}), {
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Раньше регистрация обрывалась в анкету самоидентификации: имя и город
 * человек узнавал из плашек на главной, поштучно и без прогресса. Мастер
 * держит порядок — эти тесты про то, что порядок не разъезжается.
 */
describe("WelcomeWizard", () => {
  it("начинает с первого шага и называет, сколько всего", () => {
    render(<WelcomeWizard user={profile} />);

    expect(screen.getByText("Шаг 1 из 4 · Знакомство")).toBeInTheDocument();
    expect(screen.getByText("Как вас называть")).toBeInTheDocument();
  });

  it("предпросмотр имени показывает духовное, как только его ввели", async () => {
    const user = userEvent.setup();
    render(<WelcomeWizard user={profile} />);

    await user.type(screen.getByLabelText("Духовное имя"), "Мадхава дас");

    expect(screen.getByText("Мадхава дас")).toBeInTheDocument();
  });

  it("ведёт по шагам вперёд и назад, не теряя введённое", async () => {
    const user = userEvent.setup();
    render(<WelcomeWizard user={profile} />);

    await user.type(screen.getByLabelText("Духовное имя"), "Мадхава дас");
    await user.click(screen.getByRole("button", { name: "Дальше" }));
    expect(screen.getByText("Шаг 2 из 4 · Город")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Назад" }));
    expect(screen.getByLabelText("Духовное имя")).toHaveValue("Мадхава дас");
  });

  it("на первом шаге назад некуда", () => {
    render(<WelcomeWizard user={profile} />);

    expect(
      screen.queryByRole("button", { name: "Назад" }),
    ).not.toBeInTheDocument();
  });

  // Промежуточных сохранений нет намеренно: до последнего шага человек ходит
  // назад и правит ответы, и записанное на полпути пришлось бы догонять.
  it("до последнего шага ничего не сохраняет", async () => {
    const user = userEvent.setup();
    render(<WelcomeWizard user={profile} />);

    await user.click(screen.getByRole("button", { name: "Дальше" }));
    await user.click(screen.getByRole("button", { name: "Дальше" }));
    await user.click(screen.getByRole("button", { name: "Дальше" }));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("в конце сохраняет профиль и анкету и уводит на главную", async () => {
    const user = userEvent.setup();
    render(<WelcomeWizard user={profile} />);

    await user.type(screen.getByLabelText("Духовное имя"), "Мадхава дас");
    await user.click(screen.getByRole("button", { name: "Дальше" }));
    await user.click(screen.getByRole("button", { name: "Дальше" }));
    await user.click(screen.getByRole("button", { name: "Дальше" }));
    await user.click(
      screen.getByRole("button", { name: "Готово, к сервисам портала" }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [profileUrl, profileInit] = fetchMock.mock.calls[0];
    expect(String(profileUrl)).toContain("/profile");
    expect(JSON.parse(String(profileInit?.body))).toMatchObject({
      name: "Гаура Прия",
      spiritualName: "Мадхава дас",
    });
    expect(String(fetchMock.mock.calls[1][0])).toContain(
      "/self-identification/submit",
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
  });

  // Ошибку сети мастер обязан показать на месте: увести на главную с
  // несохранённой анкетой значит потерять всё, что человек только что ввёл.
  it("при ошибке остаётся на шаге и называет её", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(new Response("Сервис недоступен", { status: 503 }));
    render(<WelcomeWizard user={profile} />);

    await user.click(screen.getByRole("button", { name: "Дальше" }));
    await user.click(screen.getByRole("button", { name: "Дальше" }));
    await user.click(screen.getByRole("button", { name: "Дальше" }));
    await user.click(
      screen.getByRole("button", { name: "Готово, к сервисам портала" }),
    );

    expect(await screen.findByText("Сервис недоступен")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("шаг города можно пропустить", async () => {
    const user = userEvent.setup();
    render(<WelcomeWizard user={profile} />);

    await user.click(screen.getByRole("button", { name: "Дальше" }));
    await user.click(screen.getByRole("button", { name: "Пропустить шаг" }));
    await user.click(screen.getByRole("button", { name: "Пропустить шаг" }));

    expect(screen.getByText("Шаг 4 из 4 · Этап пути")).toBeInTheDocument();
  });

  /**
   * Фото просят в мастере, а не «когда-нибудь потом в профиле»: это
   * единственная минута, когда человек настроен заполнять анкету. Причина
   * названа последствием, а не процентом заполнения.
   */
  it("просит фото отдельным шагом и объясняет зачем", async () => {
    const user = userEvent.setup();
    render(<WelcomeWizard user={profile} />);

    await user.click(screen.getByRole("button", { name: "Дальше" }));
    await user.click(screen.getByRole("button", { name: "Дальше" }));

    expect(screen.getByText("Шаг 3 из 4 · Фото")).toBeInTheDocument();
    expect(
      screen.getByText(/показываются в Знакомствах выше/),
    ).toBeInTheDocument();
  });

  it("шаг фото можно пропустить — он не обязателен", async () => {
    const user = userEvent.setup();
    render(<WelcomeWizard user={profile} />);

    await user.click(screen.getByRole("button", { name: "Дальше" }));
    await user.click(screen.getByRole("button", { name: "Дальше" }));
    await user.click(screen.getByRole("button", { name: "Пропустить шаг" }));

    expect(screen.getByText("Шаг 4 из 4 · Этап пути")).toBeInTheDocument();
  });

  // Анкета — единственный обязательный шаг: по ней считается этап, без
  // которого портал не знает, что показывать.
  it("последний шаг пропустить нельзя", async () => {
    const user = userEvent.setup();
    render(<WelcomeWizard user={profile} />);

    await user.click(screen.getByRole("button", { name: "Дальше" }));
    await user.click(screen.getByRole("button", { name: "Дальше" }));
    await user.click(screen.getByRole("button", { name: "Дальше" }));

    expect(
      screen.queryByRole("button", { name: "Пропустить шаг" }),
    ).not.toBeInTheDocument();
  });
});
