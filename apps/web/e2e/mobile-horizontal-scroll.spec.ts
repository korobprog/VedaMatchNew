import { devices, expect, test } from "@playwright/test";

// Публичные страницы открывает гость с телефона: вход не нужен.
test.use({
  ...devices["Pixel 7"],
  storageState: { cookies: [], origins: [] },
});

// Что-то шире экрана (однострочный текст в элементе сетки, длинное слово
// крупным шрифтом) раздвигает layout viewport мобильного браузера, и за ним
// растягиваются `fixed inset-0` слои — сферы фона, шапка. Страница ездит
// вбок, хотя виноватым выглядит фон. Проверяем итог, а не конкретный
// элемент: ширина документа обязана совпадать с шириной экрана.
const PAGES = ["/radio", "/tour", "/", "/vaishnava", "/legal/privacy", "/legal/terms"];

for (const path of PAGES) {
  for (const width of [360, 390]) {
    test(`${path} не прокручивается вбок на ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(path, { waitUntil: "networkidle" });

      const size = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
        inner: window.innerWidth,
      }));

      expect(size.scroll).toBe(size.client);
      expect(size.inner).toBe(width);
    });
  }
}
