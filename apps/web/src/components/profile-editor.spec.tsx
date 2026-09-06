import { render as renderRaw, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UserProfile } from "@vedamatch/shared";
import { ProfileEditor } from "./profile-editor";
import ru from "../../messages/ru.json";

/** Редактор берёт локаль из next-intl: она уезжает в геокодер как `lang`. */
const render = (ui: ReactElement) =>
  renderRaw(
    <NextIntlClientProvider locale="ru" messages={ru}>
      {ui}
    </NextIntlClientProvider>,
  );

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

// Галерея и панель проверки фото ходят в сеть сами — здесь важна только
// секция имени, поэтому обе заглушены.
vi.mock("./user-gallery-editor", () => ({
  UserGalleryEditor: () => null,
}));
vi.mock("./photo-verification-panel", () => ({
  PhotoVerificationPanel: () => null,
}));

const profile: UserProfile = {
  id: "u1",
  email: "user@example.com",
  name: "Максим Коробков",
  spiritualName: null,
  about: null,
    statusLine: null,
  languages: [],
  displayName: "Максим Коробков",
  avatarUrl: null,
  avatarKey: null,
  birthDate: null,
  age: null,
  // Пол обязателен: без него форма не отправится, см. `NameHints` и
  // проверку в `UsersService.updateProfile`.
  gender: "male",
  photoVerification: { status: "none", requestedAt: null, verifiedAt: null },
  homeLocation: null,
  socialLinks: {},
  messengers: {},
  role: "user",
  adminServices: [],
  spiritualStage: null,
  devoteeVerificationStatus: null,
  lastSelfIdentificationAt: null,
  lineage: null,
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
  createdAt: "2026-01-01T00:00:00.000Z",
};

afterEach(() => {
  vi.restoreAllMocks();
});

function stubFetch(updated: UserProfile) {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify(updated), {
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("ProfileEditor — имя", () => {
  it("показывает оба имени из профиля", () => {
    render(
      <ProfileEditor
        user={{
          ...profile,
          spiritualName: "Мадхава дас",
          displayName: "Мадхава дас",
        }}
      />,
    );

    expect(screen.getByLabelText("Обычное имя")).toHaveValue(
      "Максим Коробков",
    );
    expect(screen.getByLabelText("Духовное имя")).toHaveValue("Мадхава дас");
  });

  it("предпросмотр показывает духовное имя, как только его ввели", async () => {
    const user = userEvent.setup();
    render(<ProfileEditor user={profile} />);

    expect(screen.getByText("Максим Коробков")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Духовное имя"), "Мадхава дас");

    expect(screen.getByText("Мадхава дас")).toBeInTheDocument();
  });

  it("объясняет, куда делось обычное имя, когда заполнены оба", async () => {
    const user = userEvent.setup();
    render(<ProfileEditor user={profile} />);

    await user.type(screen.getByLabelText("Духовное имя"), "Мадхава дас");

    // Заполнив духовное, человек переставал понимать, видит ли кто-нибудь
    // обычное. Ответ теперь стоит прямо под полями.
    expect(
      screen.getByText(/остаётся в вашем профиле и видно администрации/),
    ).toBeInTheDocument();
  });

  it("без духовного имени про второе не говорит: говорить не о чем", () => {
    render(<ProfileEditor user={profile} />);

    expect(
      screen.queryByText(/остаётся в вашем профиле/),
    ).not.toBeInTheDocument();
  });

  it("сохраняет оба имени в PATCH /profile", async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch({
      ...profile,
      name: "Максим",
      spiritualName: "Мадхава дас",
      displayName: "Мадхава дас",
    });
    render(<ProfileEditor user={profile} />);

    const name = screen.getByLabelText("Обычное имя");
    await user.clear(name);
    await user.type(name, "Максим");
    await user.type(screen.getByLabelText("Духовное имя"), "Мадхава дас");
    await user.click(
      screen.getByRole("button", { name: "Сохранить изменения профиля" }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(init?.body))).toMatchObject({
      name: "Максим",
      spiritualName: "Мадхава дас",
    });
  });

  it("очищенное духовное имя уходит как null", async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch(profile);
    render(
      <ProfileEditor
        user={{
          ...profile,
          spiritualName: "Мадхава дас",
          displayName: "Мадхава дас",
        }}
      />,
    );

    await user.clear(screen.getByLabelText("Духовное имя"));
    await user.click(
      screen.getByRole("button", { name: "Сохранить изменения профиля" }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(init?.body)).spiritualName).toBeNull();
  });

  it("сохраняет статус вместе с профилем", async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch({ ...profile, statusLine: "В Маяпуре до марта" });
    render(<ProfileEditor user={profile} />);

    await user.type(
      screen.getByLabelText(/Статус/),
      "В Маяпуре до марта",
    );
    await user.click(
      screen.getByRole("button", { name: "Сохранить изменения профиля" }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(init?.body))).toMatchObject({
      statusLine: "В Маяпуре до марта",
    });
  });

  it("пустой статус уезжает как null: пусто значит убрать", async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch(profile);
    render(<ProfileEditor user={{ ...profile, statusLine: "Старый" }} />);

    await user.clear(screen.getByLabelText(/Статус/));
    await user.click(
      screen.getByRole("button", { name: "Сохранить изменения профиля" }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0];
    // Пусто — значит убрать, как у духовного имени и рассказа о себе.
    expect(JSON.parse(String(init?.body)).statusLine).toBeNull();
  });
});
