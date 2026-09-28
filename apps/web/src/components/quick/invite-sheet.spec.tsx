import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { InviteSheet } from "./invite-sheet";
import { inviteCopyLabel, useInviteCopy } from "./quick-action-hooks";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

// jsdom не реализует showModal: без заглушки окно не открывается.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close() {
    this.open = false;
  };
});

function Harness() {
  const invite = useInviteCopy();
  return (
    <>
      <button type="button" onClick={() => void invite.copy()}>
        {inviteCopyLabel(invite.state)}
      </button>
      <InviteSheet invite={invite} />
    </>
  );
}

const LINK = "https://vedamatch.ru/?ref=abc";

function mockApi({ canEdit }: { canEdit: boolean }) {
  let template = "Привет! Заходи: vedamatch.ru";
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const path = String(url);
    if (path.includes("/admin/rewards/invite-text")) {
      if (init?.method === "PUT") {
        template = (JSON.parse(String(init.body)) as { text: string }).text;
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          text: template,
          isDefault: false,
          maxLength: 3500,
        }),
      });
    }
    if (path.includes("/rewards/me")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          link: LINK,
          inviteMessage: template.replace("vedamatch.ru", LINK),
          canEditInviteText: canEdit,
        }),
      });
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("окно «Пригласить» (VED-618)", () => {
  it("копирует полный текст с личной ссылкой и показывает его", async () => {
    mockApi({ canEdit: false });
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Пригласить" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(`Привет! Заходи: ${LINK}`);
    expect(dialog).toHaveTextContent("Текст скопирован");
    await waitFor(async () =>
      expect(await navigator.clipboard.readText()).toBe(
        `Привет! Заходи: ${LINK}`,
      ),
    );
    // Не админ — править нечего.
    expect(
      screen.queryByRole("button", { name: "Изменить текст" }),
    ).not.toBeInTheDocument();
  });

  it("администратор правит текст прямо в окне", async () => {
    const fetchMock = mockApi({ canEdit: true });
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Пригласить" }));
    await user.click(
      await screen.findByRole("button", { name: "Изменить текст" }),
    );

    const field = await screen.findByRole("textbox");
    expect(field).toHaveValue("Привет! Заходи: vedamatch.ru");
    await user.clear(field);
    await user.type(field, "Новый текст vedamatch.ru");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() =>
      expect(screen.getByRole("dialog")).toHaveTextContent(
        `Новый текст ${LINK}`,
      ),
    );
    const put = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === "PUT",
    );
    expect(JSON.parse(String((put?.[1] as RequestInit).body))).toEqual({
      text: "Новый текст vedamatch.ru",
    });
  });
});
