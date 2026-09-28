import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkTaskDto } from "@vedamatch/shared";
import { attachWorkFile } from "@/lib/work-api";
import { WorkUploadIndicator } from "./upload-indicator";
import { workUploads } from "./work-uploads";

vi.mock("@/lib/work-api", () => ({
  attachWorkFile: vi.fn(),
  createWorkTask: vi.fn(),
}));

const task = { id: "t1", key: "VED-7" } as unknown as WorkTaskDto;
const shot = (name: string) => new File(["x"], name, { type: "image/png" });

function attach() {
  return workUploads.attach({
    boardId: "b1",
    taskId: "t1",
    taskKey: "VED-7",
    title: "Кнопка",
    files: [shot("1.png"), shot("2.png")],
    boardHref: "/work/planner/s1",
  });
}

afterEach(() => {
  for (const job of workUploads.getSnapshot()) workUploads.dismiss(job.id);
});

describe("WorkUploadIndicator (VED-608)", () => {
  afterEach(() => vi.mocked(attachWorkFile).mockReset());

  it("показывает прогресс и держит подтверждение ухода со страницы", async () => {
    let finish: (value: WorkTaskDto) => void = () => {};
    vi.mocked(attachWorkFile).mockImplementation(
      () =>
        new Promise<WorkTaskDto>((resolve) => {
          finish = resolve;
        }),
    );
    render(<WorkUploadIndicator />);
    let done!: Promise<unknown>;
    act(() => {
      done = attach();
    });

    expect(
      screen.getByText("Загружаем 2 файла в задачу VED-7: 1 из 2"),
    ).toBeInTheDocument();
    const leave = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(leave);
    expect(leave.defaultPrevented).toBe(true);

    await waitFor(() => expect(attachWorkFile).toHaveBeenCalledTimes(1));
    act(() => finish(task));
    await waitFor(() => expect(attachWorkFile).toHaveBeenCalledTimes(2));
    expect(
      await screen.findByText("Загружаем 2 файла в задачу VED-7: 2 из 2"),
    ).toBeInTheDocument();
    await act(async () => {
      finish(task);
      await done;
    });

    expect(
      screen.getByText(/Загружено 2 файла в задачу VED-7/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Открыть" })).toHaveAttribute(
      "href",
      "/work/planner/s1?task=VED-7",
    );
    const after = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });

  it("ошибку называет по файлу и держит до закрытия", async () => {
    vi.mocked(attachWorkFile).mockImplementation((_id, file) =>
      file.name === "2.png"
        ? Promise.reject(new Error("Файл больше 10 МБ"))
        : Promise.resolve(task),
    );
    const user = userEvent.setup();
    render(<WorkUploadIndicator />);
    await act(async () => {
      await attach();
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Задача VED-7: «2.png» не приложился: Файл больше 10 МБ",
    );
    await user.click(
      screen.getByRole("button", { name: "Скрыть уведомление" }),
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
