import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  UnionConnectionRequestDto,
  UnionConnectionRequestsState,
} from "@vedamatch/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildAcceptedConnections,
  ConnectionsPanel,
} from "./connections-panel";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

function request(
  id: string,
  name: string,
  status: UnionConnectionRequestDto["status"],
  direction: UnionConnectionRequestDto["direction"],
  createdAt: string,
  respondedAt: string | null = null,
): UnionConnectionRequestDto {
  return {
    id,
    status,
    direction,
    message: `${name}: сообщение`,
    createdAt,
    respondedAt,
    user: {
      id: `${id}-user`,
      name,
      avatarUrl: null,
      city: "Москва",
      country: "Россия",
      spiritualStage: null,
      contacts: null,
    },
  };
}

const pendingIncoming = request(
  "incoming-pending",
  "Анна",
  "pending",
  "incoming",
  "2026-07-10T10:00:00.000Z",
);
const pendingOutgoing = request(
  "outgoing-pending",
  "Борис",
  "pending",
  "outgoing",
  "2026-07-09T10:00:00.000Z",
);
const acceptedOld = request(
  "accepted-old",
  "Вера",
  "accepted",
  "incoming",
  "2026-07-01T10:00:00.000Z",
  "2026-07-02T10:00:00.000Z",
);
const acceptedNew = request(
  "accepted-new",
  "Глеб",
  "accepted",
  "outgoing",
  "2026-07-03T10:00:00.000Z",
  "2026-07-08T10:00:00.000Z",
);

const requests: UnionConnectionRequestsState = {
  incoming: [acceptedOld, pendingIncoming, acceptedNew],
  outgoing: [pendingOutgoing, acceptedNew],
};

describe("buildAcceptedConnections", () => {
  it("deduplicates and sorts accepted connections by response date", () => {
    expect(buildAcceptedConnections(requests).map((item) => item.id)).toEqual([
      "accepted-new",
      "accepted-old",
    ]);
  });
});

describe("ConnectionsPanel", () => {
  beforeEach(() => {
    refresh.mockReset();
    vi.unstubAllGlobals();
  });

  it("switches between incoming, outgoing and accepted lists", async () => {
    const user = userEvent.setup();
    render(<ConnectionsPanel requests={requests} />);

    expect(screen.getByRole("link", { name: "Анна" })).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Исходящие" }));
    expect(screen.getByRole("link", { name: "Борис" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Анна" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Принятые" }));
    expect(screen.getByRole("link", { name: "Глеб" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Вера" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Борис" })).not.toBeInTheDocument();
  });

  it("accepts an incoming request, disables actions and refreshes", async () => {
    const user = userEvent.setup();
    let resolveFetch: ((value: { ok: boolean; text: () => Promise<string> }) => void) | undefined;
    const fetchMock = vi.fn(
      () =>
        new Promise<{ ok: boolean; text: () => Promise<string> }>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<ConnectionsPanel requests={{ incoming: [pendingIncoming], outgoing: [] }} />);

    await user.click(screen.getByRole("button", { name: "Принять" }));

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(
        /\/union\/connection-requests\/incoming-pending\/accept$/,
      ),
      { method: "PATCH", credentials: "include" },
    );
    expect(screen.getByRole("button", { name: "Принять" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Отклонить" })).toBeDisabled();

    resolveFetch?.({ ok: true, text: async () => "" });
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it("declines an incoming request and refreshes", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "",
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ConnectionsPanel requests={{ incoming: [pendingIncoming], outgoing: [] }} />);

    await user.click(screen.getByRole("button", { name: "Отклонить" }));

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(
        /\/union\/connection-requests\/incoming-pending\/decline$/,
      ),
      { method: "PATCH", credentials: "include" },
    );
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it("keeps the selected tab and displays an action error", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Сеть недоступна")));
    render(<ConnectionsPanel requests={{ incoming: [pendingIncoming], outgoing: [] }} />);

    const incomingTab = screen.getByRole("tab", { name: "Входящие" });
    await user.click(incomingTab);
    await user.click(screen.getByRole("button", { name: "Принять" }));

    expect(incomingTab).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByText("Сеть недоступна")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("shows a safe load error without stale actions", () => {
    render(<ConnectionsPanel requests={null} />);

    expect(
      screen.getByText(
        "Не удалось загрузить связи. Обновите страницу и попробуйте снова.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Принять" })).not.toBeInTheDocument();
  });
});
