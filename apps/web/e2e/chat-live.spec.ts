import { expect, test } from "@playwright/test";

const CONVERSATION_HREF = /^\/chat\/[0-9a-f-]{36}$/;

/**
 * Живой поток «Общения» целиком: от контроллера `GET /chat/stream` до
 * подписки в браузере. Сообщение, отправленное в одной вкладке, обязано само
 * появиться во второй — без перезагрузки и без опроса.
 *
 * Вторая вкладка открывается в том же контексте: так она делит куки с первой
 * и тесту не нужен второй набор учётных данных. События публикуются всем
 * участникам беседы, включая автора, поэтому подписчик честный.
 */
test("сообщение доезжает во вторую вкладку живым потоком", async ({ page }) => {
  await page.goto("/chat");
  await expect(page.locator('a[href^="/chat/"]').first()).toBeVisible();

  const hrefs = await page.locator('a[href^="/chat/"]').evaluateAll((links) =>
    links.map((link) => link.getAttribute("href") ?? ""),
  );
  const href = hrefs.find((value) => CONVERSATION_HREF.test(value));
  expect(href, "в демо-данных должна быть хотя бы одна беседа").toBeTruthy();

  const listener = await page.context().newPage();
  await listener.goto(href!);
  await expect(
    listener.getByPlaceholder("Сообщение…"),
    "беседа во второй вкладке должна открыться до отправки",
  ).toBeVisible();

  const text = `Playwright живой поток ${Date.now()}`;
  await page.goto(href!);
  await page.getByPlaceholder("Сообщение…").fill(text);
  await page.getByRole("button", { name: "Отправить" }).click();

  await expect(page.getByText(text)).toBeVisible();
  // Ключевая проверка: во второй вкладке текст появился сам.
  await expect(listener.getByText(text)).toBeVisible();

  await listener.close();
});
