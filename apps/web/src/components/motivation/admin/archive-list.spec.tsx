import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { MotivationAdminCandidateDto } from "@vedamatch/shared";
import { ArchiveList } from "./archive-list";

function post(
  over: Partial<MotivationAdminCandidateDto> = {},
): MotivationAdminCandidateDto {
  return {
    id: "post-1",
    slug: "gita-2-13",
    title: "Душа не умирает",
    contentDate: "2026-08-16",
    category: "philosophy",
    imageUrl: "",
    status: "draft",
    reviewStatus: "rejected",
    ...over,
  } as MotivationAdminCandidateDto;
}

function setup(posts: MotivationAdminCandidateDto[]) {
  const run = vi.fn();
  render(<ArchiveList posts={posts} pending={{}} errors={{}} run={run} />);
  return { run, user: userEvent.setup() };
}

describe("ArchiveList", () => {
  // VED-251: у скрытого после публикации reviewStatus так и остаётся
  // 'published' — stageHint() на нём соврал бы «Опубликовано и видно в ленте».
  it("подписывает скрытую карточку верно, а не через stageHint(reviewStatus)", () => {
    setup([post({ status: "hidden", reviewStatus: "published" })]);

    expect(screen.getByText("Скрыто из ленты")).toBeInTheDocument();
    expect(
      screen.queryByText("Опубликовано и видно в ленте."),
    ).not.toBeInTheDocument();
  });

  it("у отклонённого генерацией — обычная подпись по стадии, без кнопки возврата", () => {
    setup([post({ status: "draft", reviewStatus: "rejected" })]);

    expect(screen.getByText("Отклонено.")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Вернуть в ленту" }),
    ).not.toBeInTheDocument();
  });

  it("показывает «Вернуть в ленту» только у скрытого и шлёт верный PATCH", async () => {
    const { run, user } = setup([
      post({ status: "hidden", reviewStatus: "published" }),
    ]);

    const restore = screen.getByRole("button", { name: "Вернуть в ленту" });
    await user.click(restore);

    expect(run).toHaveBeenCalledWith("post-1", "restore", {
      path: "/admin/motivation/posts/post-1",
      method: "PATCH",
      body: { hidden: false },
    });
  });

  it("не показывает кнопку возврата у по-настоящему отклонённого", () => {
    setup([post({ status: "draft", reviewStatus: "rejected" })]);

    expect(
      screen.queryByRole("button", { name: "Вернуть в ленту" }),
    ).not.toBeInTheDocument();
  });

  it("ничего не рендерит для пустого списка", () => {
    const { container } = render(
      <ArchiveList posts={[]} pending={{}} errors={{}} run={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
