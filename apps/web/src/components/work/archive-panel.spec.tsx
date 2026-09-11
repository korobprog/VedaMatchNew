import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkArchiveDto, WorkArchiveItemDto } from "@vedamatch/shared";
import { WorkArchivePanel } from "./archive-panel";
import { archiveDateLabel, archivePlaceLabel } from "./archive-labels";
import { getWorkBoardArchive, restoreWorkTask } from "@/lib/work-api";

vi.mock("@/lib/work-api", () => ({
  getWorkBoardArchive: vi.fn(),
  restoreWorkTask: vi.fn(),
}));

function item(over: Partial<WorkArchiveItemDto> = {}): WorkArchiveItemDto {
  return {
    id: "t1",
    key: "VED-61",
    number: 61,
    columnId: "c-done",
    title: "Кнопка архива",
    position: 0,
    priority: "normal",
    dueAt: null,
    completedAt: "2026-09-10T12:00:00.000Z",
    assignee: null,
    labels: [],
    checklistDone: 0,
    checklistTotal: 0,
    commentCount: 0,
    attachmentCount: 0,
    hasDescription: false,
    columnName: "Выполнено",
    archivedAt: null,
    ...over,
  };
}

const archive = (
  view: WorkArchiveDto["view"],
  items: WorkArchiveItemDto[],
): WorkArchiveDto => ({ view, items, hasMore: false });

function renderPanel(
  over: Partial<Parameters<typeof WorkArchivePanel>[0]> = {},
) {
  const props = {
    boardId: "b1",
    canEdit: true,
    covered: false,
    onOpenTask: vi.fn(),
    onRestored: vi.fn(),
    onClose: vi.fn(),
    ...over,
  };
  render(<WorkArchivePanel {...props} />);
  return props;
}

beforeEach(() => {
  vi.mocked(getWorkBoardArchive).mockReset();
  vi.mocked(restoreWorkTask).mockReset();
});

describe("archive labels", () => {
  it("shows the date of the tab being looked at", () => {
    const task = item({ archivedAt: "2026-09-11T08:00:00.000Z" });
    expect(archiveDateLabel(task, "done")).toMatch(/^выполнена 10 сент/);
    expect(archiveDateLabel(task, "removed")).toMatch(/^убрана 11 сент/);
    expect(archiveDateLabel(item({ completedAt: null }), "done")).toBeNull();
  });

  // Выполненная может ещё стоять в колонке с галочкой — архив не «уносит» её.
  it("says where the card is now", () => {
    expect(archivePlaceLabel(item())).toBe("на доске, в «Выполнено»");
    expect(
      archivePlaceLabel(item({ archivedAt: "2026-09-11T08:00:00.000Z" })),
    ).toBe("убрана с доски, была в «Выполнено»");
  });
});

describe("WorkArchivePanel", () => {
  it("lists the completed tasks and opens one in the task window", async () => {
    vi.mocked(getWorkBoardArchive).mockResolvedValue(archive("done", [item()]));
    const user = userEvent.setup();
    const props = renderPanel();

    await user.click(await screen.findByText("Кнопка архива"));

    expect(getWorkBoardArchive).toHaveBeenCalledWith("b1", "done");
    expect(props.onOpenTask).toHaveBeenCalledWith("t1");
  });

  it("brings a removed card back to the board", async () => {
    const removed = item({
      id: "t2",
      title: "Старая задача",
      archivedAt: "2026-09-11T08:00:00.000Z",
    });
    vi.mocked(getWorkBoardArchive).mockImplementation((_board, view) =>
      Promise.resolve(archive(view, view === "removed" ? [removed] : [])),
    );
    vi.mocked(restoreWorkTask).mockResolvedValue({} as never);
    const user = userEvent.setup();
    const props = renderPanel();

    await user.click(screen.getByRole("tab", { name: "Убранные с доски" }));
    const list = await screen.findByRole("list", { name: "Убранные с доски" });
    await user.click(
      within(list).getByRole("button", {
        name: "Вернуть на доску: Старая задача",
      }),
    );

    expect(restoreWorkTask).toHaveBeenCalledWith("t2");
    expect(props.onRestored).toHaveBeenCalledTimes(1);
  });

  it("does not offer to restore without the right to edit", async () => {
    vi.mocked(getWorkBoardArchive).mockImplementation((_board, view) =>
      Promise.resolve(
        archive(view, [item({ archivedAt: "2026-09-11T08:00:00.000Z" })]),
      ),
    );
    renderPanel({ canEdit: false });

    await screen.findByText("Кнопка архива");
    expect(
      screen.queryByRole("button", { name: /Вернуть на доску/ }),
    ).toBeNull();
  });

  // Поверх открыта карточка: Escape закрывает её, а не архив под ней.
  it("leaves Escape to the task window opened on top", async () => {
    vi.mocked(getWorkBoardArchive).mockResolvedValue(archive("done", []));
    const user = userEvent.setup();
    const props = renderPanel({ covered: true });
    await user.keyboard("{Escape}");
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("explains an empty «done» tab", async () => {
    vi.mocked(getWorkBoardArchive).mockResolvedValue(archive("done", []));
    renderPanel();
    expect(
      await screen.findByText(/переносят в раздел с галочкой/),
    ).toBeInTheDocument();
  });
});
