import { expect, test } from "@playwright/test";
import { authStatePath } from "./auth-state";
import {
  downloadBook,
  expectSyncedState,
  selectReaderText,
} from "./vedabase-helpers";

test("downloaded reading state survives offline use and syncs to a second context", async ({
  baseURL,
  browser,
  page,
}) => {
  const userId = process.env.TEST_USER_ID!;
  const noteText = `Playwright offline note ${Date.now()}`;

  await page.goto("/vedabase");
  await expect(page.locator("[data-vedabase-user]")).toHaveAttribute(
    "data-vedabase-user",
    userId,
  );

  const bookCard = page.locator('[data-testid^="book-card-"]').first();
  const bookSlug = await downloadBook(bookCard);
  await bookCard.getByRole("link", { name: "Читать", exact: true }).click();

  const firstUnit = page.locator("[data-unit-id]").first();
  await expect(firstUnit).toBeVisible();
  const unitTitle = (await firstUnit.locator("h2").innerText()).trim();
  const searchTerm = unitTitle.match(/[\p{L}\p{N}]+/u)?.[0];
  expect(searchTerm, "Downloaded unit title must contain a searchable token").toBeTruthy();
  await firstUnit.click();
  await page.getByRole("button", { name: "Add bookmark" }).click();

  await selectReaderText(page);
  await page.getByRole("button", { name: "Highlight selection" }).click();
  await selectReaderText(page);
  await page.getByRole("button", { name: "Add note to selection" }).click();
  await page.getByRole("textbox", { name: "Note text" }).fill(noteText);
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(page.getByText(noteText, { exact: true })).toBeVisible();

  await page.context().setOffline(true);
  await page.reload();
  await expect(page.locator("[data-unit-id]").first()).toBeVisible();
  await page.getByRole("button", { name: "Search downloaded books" }).click();
  await page.getByRole("searchbox", { name: "Search query" }).fill(searchTerm!);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("dialog").getByText(unitTitle, { exact: true })).toBeVisible();

  await page.context().setOffline(false);
  await expect(page.getByRole("status")).toContainText("Синхронизировано", {
    timeout: 60_000,
  });

  const secondContext = await browser.newContext({
    baseURL,
    storageState: authStatePath,
  });
  const secondPage = await secondContext.newPage();
  try {
    await secondPage.goto("/vedabase");
    await expect(secondPage.getByRole("status")).toContainText("Синхронизировано", {
      timeout: 60_000,
    });
    const secondBookCard = secondPage.locator(`[data-testid="book-card-${bookSlug}"]`);
    await downloadBook(secondBookCard);
    await secondBookCard.getByRole("link", { name: "Читать", exact: true }).click();
    await expect(secondPage.getByText(noteText, { exact: true })).toBeVisible();
    await expectSyncedState(secondPage, userId, noteText);
  } finally {
    await secondContext.close();
  }
});
