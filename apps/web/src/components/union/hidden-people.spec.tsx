import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HiddenPeople } from "./hidden-people";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const archive = [
  {
    archivedAt: "2026-08-20T10:00:00.000Z",
    user: {
      id: "u1",
      name: "Кешава дас",
      avatarUrl: null,
      photos: [],
      city: "Москва",
      country: "Россия",
      spiritualStage: null,
      age: null,
      activity: null,
      lastSeenAt: null,
      isVerifiedDevotee: false,
      isPhotoVerified: false,
      contacts: null,
    },
  },
];

describe("HiddenPeople", () => {
  it("opens on the archive tab and lists archived people", () => {
    render(<HiddenPeople archive={archive} blocked={[]} />);

    expect(screen.getByText("Кешава дас")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Вернуть в выдачу" }),
    ).toBeInTheDocument();
  });

  it("switches to the blocked tab", async () => {
    const user = userEvent.setup();
    render(
      <HiddenPeople
        archive={archive}
        blocked={[
          { userId: "b1", name: "Пётр", createdAt: "2026-08-01T00:00:00.000Z" },
        ]}
      />,
    );

    await user.click(screen.getByRole("tab", { name: /Заблокированные/ }));

    expect(screen.getByText("Пётр")).toBeInTheDocument();
    expect(screen.queryByText("Кешава дас")).not.toBeInTheDocument();
  });

  // Пустая вкладка должна объяснять, чем она наполняется: иначе человек
  // решит, что раздел сломан.
  it("explains an empty archive instead of showing a blank box", () => {
    render(<HiddenPeople archive={[]} blocked={[]} />);

    expect(screen.getByText(/Архив пуст/)).toBeInTheDocument();
  });
});
