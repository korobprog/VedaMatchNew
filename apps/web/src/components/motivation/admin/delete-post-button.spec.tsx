import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DeletePostButton } from "./delete-post-button";

function setup(overrides: { isPublished?: boolean; pendingAction?: string } = {}) {
  const run = vi.fn();
  render(
    <DeletePostButton
      postId="post-1"
      title="Смирение выше всего"
      isPublished={overrides.isPublished ?? false}
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

  it("warns that a published motivation disappears from feeds", async () => {
    const { user } = setup({ isPublished: true });

    await user.click(screen.getByRole("button", { name: /Удалить/ }));

    expect(
      screen.getByText(/пропадёт из ленты и из избранного/),
    ).toBeInTheDocument();
  });
});
