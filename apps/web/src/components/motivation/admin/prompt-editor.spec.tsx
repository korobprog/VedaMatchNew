import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PromptEditor } from "./prompt-editor";

function setup(
  overrides: Partial<React.ComponentProps<typeof PromptEditor>> = {},
) {
  const run = vi.fn();
  const view = render(
    <PromptEditor
      postId="post-1"
      postTitle="Смирение выше всего"
      field="imagePrompt"
      hint="Черновик собран автоматически."
      value="Рассвет над рекой"
      disabled={false}
      pendingAction={undefined}
      run={run}
      {...overrides}
    />,
  );
  return { run, view, user: userEvent.setup() };
}

describe("PromptEditor", () => {
  it("отправляет отредактированный промпт, а не черновик", async () => {
    const { run, user } = setup();
    const field = screen.getByRole("textbox");

    await user.clear(field);
    await user.type(field, "Тёплый закат над Ямуной");
    await user.click(screen.getByRole("button", { name: "Сохранить промпт" }));

    expect(run).toHaveBeenCalledWith("post-1", "save-imagePrompt", {
      path: "/admin/motivation/posts/post-1/prompts",
      body: { imagePrompt: "Тёплый закат над Ямуной" },
    });
  });

  it("шлёт промпт видео своим полем — оно про движение, а не про сцену", async () => {
    const { run, user } = setup({ field: "videoPrompt", value: null });

    await user.type(screen.getByRole("textbox"), "Soft breeze. Camera still.");
    await user.click(screen.getByRole("button", { name: "Сохранить промпт" }));

    expect(run).toHaveBeenCalledWith("post-1", "save-videoPrompt", {
      path: "/admin/motivation/posts/post-1/prompts",
      body: { videoPrompt: "Soft breeze. Camera still." },
    });
  });

  it("не даёт сохранить нетронутый текст", async () => {
    // Каждое сохранение пишется в аудит; пустая правка засоряла бы его.
    const { user } = setup();

    await user.click(screen.getByRole("button", { name: "Сохранить промпт" }));

    expect(
      screen.getByRole("button", { name: "Сохранить промпт" }),
    ).toBeDisabled();
  });

  it("подхватывает промпт, пересобранный на сервере", async () => {
    // Смена стиля собирает черновик заново: поле обязано показать новый текст,
    // а не тот, что редактор помнит с прошлого рендера.
    const { view } = setup();

    view.rerender(
      <PromptEditor
        postId="post-1"
        postTitle="Смирение выше всего"
        field="imagePrompt"
        hint="Черновик собран автоматически."
        value="Индийская миниатюра, рассвет"
        disabled={false}
        pendingAction={undefined}
        run={vi.fn()}
      />,
    );

    expect(screen.getByRole("textbox")).toHaveValue(
      "Индийская миниатюра, рассвет",
    );
  });

  it("показывает подсказку о том, что описывает поле", () => {
    setup({ hint: "Здесь описывается движение, а не сцена." });

    expect(
      screen.getByText("Здесь описывается движение, а не сцена."),
    ).toBeInTheDocument();
  });
});
