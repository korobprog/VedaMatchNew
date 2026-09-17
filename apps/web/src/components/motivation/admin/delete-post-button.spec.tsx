import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { MotivationPostStatus } from "@vedamatch/shared";
import { DeletePostButton } from "./delete-post-button";

function setup(
  overrides: { status?: MotivationPostStatus; pendingAction?: string } = {},
) {
  const run = vi.fn();
  render(
    <DeletePostButton
      postId="post-1"
      title="Смирение выше всего"
      status={overrides.status ?? "draft"}
      pendingAction={overrides.pendingAction}
      run={run}
    />,
  );
  return { run, user: userEvent.setup() };
}

describe("DeletePostButton", () => {
  it("does not delete on the first press", async () => {
    const { run, user } = setup();

    await user.click(screen.getByRole("button", { name: /Удалить/ }));

    expect(run).not.toHaveBeenCalled();
    expect(screen.getByText(/Удалить вдохновение вместе с цитатой/)).toBeInTheDocument();
  });

  it("sends the delete request after confirmation", async () => {
    const { run, user } = setup();

    await user.click(screen.getByRole("button", { name: /Удалить/ }));
    await user.click(screen.getByRole("button", { name: "Да, удалить" }));

    expect(run).toHaveBeenCalledWith("post-1", "delete", {
      path: "/admin/motivation/posts/post-1",
      method: "DELETE",
    });
  });

  it("backs out without deleting", async () => {
    const { run, user } = setup();

    await user.click(screen.getByRole("button", { name: /Удалить/ }));
    await user.click(screen.getByRole("button", { name: "Отмена" }));

    expect(run).not.toHaveBeenCalled();
    expect(screen.queryByText(/Отменить нельзя/)).toBeNull();
  });

  it("warns that a published motivation disappears from feeds and favorites", async () => {
    const { user } = setup({ status: "published" });

    await user.click(screen.getByRole("button", { name: /Удалить/ }));

    expect(
      screen.getByText(/пропадёт из ленты и из избранного/),
    ).toBeInTheDocument();
  });

  // VED-251, круг 2: до правки скрытый после публикации пост считался «не
  // опубликован» и предупреждение про избранное молчало, хотя люди успели
  // его сохранить, пока он был на виду.
  it("у скрытого после публикации — предупреждение про избранное, но не про ленту", async () => {
    const { user } = setup({ status: "hidden" });

    await user.click(screen.getByRole("button", { name: /Удалить/ }));

    expect(
      screen.getByText(/пропадёт из избранного у тех, кто успел её сохранить/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/пропадёт из ленты/)).not.toBeInTheDocument();
  });

  it("у черновика/отклонённого — предупреждения про избранное нет: он никогда не был на виду", async () => {
    const { user } = setup({ status: "draft" });

    await user.click(screen.getByRole("button", { name: /Удалить/ }));

    expect(screen.queryByText(/избранного/)).not.toBeInTheDocument();
  });
});
