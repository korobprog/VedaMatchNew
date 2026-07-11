import { expect, type Locator, type Page } from "@playwright/test";

export async function downloadBook(bookCard: Locator): Promise<string> {
  const testId = await bookCard.getAttribute("data-testid");
  expect(testId).toMatch(/^book-card-.+/);
  const bookSlug = testId!.slice("book-card-".length);

  await bookCard.getByRole("button", { name: "Скачать", exact: true }).click();
  await expect(bookCard.getByText("Доступна офлайн", { exact: true })).toBeVisible({
    timeout: 120_000,
  });
  return bookSlug;
}

export async function selectReaderText(page: Page): Promise<void> {
  const block = page.locator("[data-vedabase-block]").filter({ hasText: /\S/ }).first();
  await expect(block).toBeVisible();
  await block.evaluate((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let textNode = walker.nextNode();
    while (textNode && !(textNode.textContent ?? "").trim()) {
      textNode = walker.nextNode();
    }
    if (!textNode?.textContent) throw new Error("Reader block has no selectable text");
    const start = textNode.textContent.search(/\S/);
    const end = Math.min(textNode.textContent.length, start + 24);
    const range = document.createRange();
    range.setStart(textNode, start);
    range.setEnd(textNode, end);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
}

export async function expectSyncedState(
  page: Page,
  userId: string,
  noteText: string,
): Promise<void> {
  const state = await page.evaluate(
    ({ databaseName, expectedNote }) =>
      new Promise<{ bookmarkCount: number; kinds: string[]; noteFound: boolean }>(
        (resolve, reject) => {
          const request = indexedDB.open(databaseName);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const database = request.result;
            const transaction = database.transaction(
              ["bookmarks", "annotations"],
              "readonly",
            );
            const bookmarks = transaction.objectStore("bookmarks").getAll();
            const annotations = transaction.objectStore("annotations").getAll();
            transaction.onerror = () => reject(transaction.error);
            transaction.oncomplete = () => {
              const annotationRecords = annotations.result as Array<{
                payload?: { kind?: string; noteText?: string | null; deletedAt?: string | null };
              }>;
              resolve({
                bookmarkCount: (bookmarks.result as unknown[]).length,
                kinds: annotationRecords
                  .filter((record) => record.payload?.deletedAt == null)
                  .map((record) => record.payload?.kind ?? ""),
                noteFound: annotationRecords.some(
                  (record) => record.payload?.noteText === expectedNote,
                ),
              });
              database.close();
            };
          };
        },
      ),
    {
      databaseName: `vedabase:${userId}`,
      expectedNote: noteText,
    },
  );

  expect(state.bookmarkCount).toBeGreaterThan(0);
  expect(state.kinds).toEqual(expect.arrayContaining(["highlight", "note"]));
  expect(state.noteFound).toBe(true);
}
