import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

describe("next.config — метатеги превью", () => {
  it("стриминг метатегов выключен для любого User-Agent", () => {
    // VED-718: Next.js по умолчанию отдаёт <head> потоково и дописывает og-теги
    // в конец HTML, когда generateMetadata отвечает дольше отрисовки оболочки.
    // Замерено: для User-Agent вне списка ботов теги уезжали на 28–80 КБ от
    // начала ответа, и краулер, читающий только head (МАХ), находил там лишь
    // фавикон и текст страницы — превью собиралось из заглушки. Список ботов
    // не пополняем по одному мессенджеру: стриминг выключен для всех.
    const pattern = nextConfig.htmlLimitedBots;
    expect(pattern).toBeInstanceOf(RegExp);
    for (const ua of [
      "WhatsApp/2.23.20.0",
      "Mozilla/5.0 (Linux; Android 14)",
      "max-crawler/1.0",
      "curl/8.5.0",
    ]) {
      expect(pattern!.test(ua), ua).toBe(true);
    }
  });
});
