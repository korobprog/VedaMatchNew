import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ContactsDisclosureDto } from "@vedamatch/shared";
import { ContactsDisclosuresView } from "./contacts-disclosures-view";

const active: ContactsDisclosureDto = {
  id: "d1",
  user: {
    userId: "u2",
    name: "Говинда дас",
    headline: "Повар",
    avatarUrl: null,
    city: "Москва",
  },
  grantedAt: "2026-08-10T10:00:00.000Z",
  revokedAt: null,
};

const revoked: ContactsDisclosureDto = {
  ...active,
  id: "d2",
  user: { ...active.user, userId: "u3", name: "Радха дд" },
  revokedAt: "2026-08-12T10:00:00.000Z",
};

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
  });

afterEach(() => vi.unstubAllGlobals());

describe("ContactsDisclosuresView", () => {
  it("keeps revoked rows in the log, dimmed and without a close button", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(json({ items: [active, revoked] })),
    );
    render(<ContactsDisclosuresView />);

    const rows = await screen.findAllByTestId("contacts-disclosure");
    expect(rows).toHaveLength(2);

    const [activeRow, revokedRow] = rows as [HTMLElement, HTMLElement];
    expect(activeRow).toHaveAttribute("data-revoked", "false");
    expect(
      within(activeRow).getByRole("button", { name: "Закрыть доступ" }),
    ).toBeInTheDocument();

    // Журнал, а не список активных: отозванная запись остаётся, но погашена.
    expect(revokedRow).toHaveAttribute("data-revoked", "true");
    expect(revokedRow.className).toContain("opacity-60");
    expect(within(revokedRow).getByText("Радха дд").className).toContain(
      "line-through",
    );
    expect(within(revokedRow).getByText(/Доступ закрыт 12/)).toBeInTheDocument();
    expect(
      within(revokedRow).queryByRole("button", { name: "Закрыть доступ" }),
    ).not.toBeInTheDocument();
  });

  it("revokes a disclosure and redraws the log from the answer", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ items: [active] }))
      .mockResolvedValueOnce(
        json({ items: [{ ...active, revokedAt: "2026-08-13T09:00:00.000Z" }] }),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<ContactsDisclosuresView />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Закрыть доступ" }),
    );

    await waitFor(() =>
      expect(screen.getByTestId("contacts-disclosure")).toHaveAttribute(
        "data-revoked",
        "true",
      ),
    );
    expect(fetchMock.mock.calls[1]).toEqual([
      "http://localhost:4000/contacts/disclosures/d1",
      { credentials: "include", method: "DELETE" },
    ]);
    // Человек из журнала не пропал — видно, что доступ был.
    expect(screen.getByText("Говинда дас")).toBeInTheDocument();
  });

  it("shows the Russian error text the backend sent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ message: "Раскрытие не найдено" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    render(<ContactsDisclosuresView />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Раскрытие не найдено",
    );
  });
});
