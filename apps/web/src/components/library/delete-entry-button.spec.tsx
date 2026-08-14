import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeleteEntryButton } from "./delete-entry-button";

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

afterEach(() => {
  vi.restoreAllMocks();
  push.mockClear();
  refresh.mockClear();
});

describe("DeleteEntryButton", () => {
  it("asks for confirmation before sending the request", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<DeleteEntryButton locale="ru" entryId="entry-1" />);
    fireEvent.click(screen.getByRole("button", { name: /удалить/i }));

    expect(screen.getByText(/удалить ссылку из библиотеки/i)).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("deletes the entry and reports it to the list", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal("fetch", fetchMock);
    const onDeleted = vi.fn();

    render(
      <DeleteEntryButton locale="ru" entryId="entry-1" onDeleted={onDeleted} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /удалить/i }));
    fireEvent.click(screen.getByRole("button", { name: /да, удалить/i }));

    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toContain("/library/entries/entry-1");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "DELETE" });
  });

  it("shows an error and keeps the entry when the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );
    const onDeleted = vi.fn();

    render(
      <DeleteEntryButton locale="ru" entryId="entry-1" onDeleted={onDeleted} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /удалить/i }));
    fireEvent.click(screen.getByRole("button", { name: /да, удалить/i }));

    await waitFor(() =>
      expect(screen.getByText(/не удалось удалить ссылку/i)).toBeDefined(),
    );
    expect(onDeleted).not.toHaveBeenCalled();
  });
});
