import { expect, test } from "@playwright/test";

// Оболочка обязана работать до входа: воркер и офлайн-страницы отдаются гостю.
// Заодно тест не зависит от поднятого API.
test.use({ storageState: { cookies: [], origins: [] } });

test("the worker serves a portal shell offline and keeps the reader shell", async ({
  page,
}) => {
  await page.goto("/");
  // Воркер ставит skipWaiting + clients.claim, поэтому контроль приходит
  // без перезагрузки — но не мгновенно.
  await page.waitForFunction(
    () => navigator.serviceWorker.controller !== null,
    undefined,
    { timeout: 30_000 },
  );

  await page.context().setOffline(true);
  try {
    await page.goto("/union");
    await expect(
      page.getByRole("heading", { name: "Нет подключения" }),
    ).toBeVisible();

    // Страховка от слияния воркеров: навигация внутри /vedabase обязана
    // получать свою оболочку, иначе офлайн-чтение книг умрёт. Что книги
    // действительно читаются, проверяет vedabase-offline.spec.ts.
    await page.goto("/vedabase");
    await expect(page.getByText("Union Vedabase · офлайн")).toBeVisible();
  } finally {
    await page.context().setOffline(false);
  }
});
